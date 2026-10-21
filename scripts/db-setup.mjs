#!/usr/bin/env node
/**
 * 本地 PostgreSQL 一键初始化（Windows / macOS / Linux 通用）。
 *
 * 用法：
 *   npm run db:setup
 *   PGPORT=5433 npm run db:setup     # 换端口
 *
 * 做什么：
 *   1. 在 .me/pg 下安装 embedded-postgres（**不进项目依赖**，package.json 不受影响）
 *   2. 用自带的 initdb 建一个数据目录 .me/pg/pgdata
 *   3. 写入监听端口
 *   4. 启动一次、建库、再停掉
 *
 * 为什么用 embedded-postgres 而不是让用户去装 PostgreSQL：
 *   本机没有原生 PostgreSQL（psql / pg_ctl 都不在 PATH），而这套 npm 包自带
 *   与上游一致的 initdb / postgres 二进制（实测 PostgreSQL 18.4）。它只是
 *   「把官方二进制装到 node_modules 里」，不是模拟器，SQL 行为与真库完全一致。
 *
 * 为什么二进制与数据目录放 .me/pg：
 *   .me/ 已在 .gitignore 里。数据库文件（含数据与日志）绝不该进仓库。
 *   换台机器重新跑一次 db:setup 即可，不依赖任何未提交的状态。
 *
 * 安全边界（刻意的）：
 *   - 只监听 127.0.0.1，不对外暴露。
 *   - 口令固定为 postgres —— 这是**本机开发**凭据，不是可复用的秘密。
 *     任何部署环境都必须换成真实强口令（并设置 DATABASE_SSL）。
 */

import { spawn, execFile } from 'node:child_process'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** TCP 探测：能连上就说明 postmaster 已在监听。 */
function probePort(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const done = (ok) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, '127.0.0.1')
  })
}

async function waitForPort(port, totalMs = 30000) {
  const deadline = Date.now() + totalMs
  while (Date.now() < deadline) {
    if (await probePort(port)) return true
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}

// 从脚本位置推导项目根，而不是 process.cwd()：
// npm 在 UNC 路径下的子进程 cwd 可能不可用，用 cwd 会让初始化写错地方。
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PG_HOME = path.join(ROOT, '.me', 'pg')
const DATA_DIR = path.join(PG_HOME, 'pgdata')
const LOG_FILE = path.join(PG_HOME, 'server.log')

const PORT = Number(process.env.PGPORT ?? 5432)
const DB_NAME = process.env.PGDATABASE ?? 'playbook'
const DB_USER = 'postgres'
const DB_PASSWORD = 'postgres'

const isWindows = process.platform === 'win32'
const exe = (name) => (isWindows ? `${name}.exe` : name)

function log(message) {
  console.log(`[db:setup] ${message}`)
}

function fail(message) {
  console.error(`[db:setup] ${message}`)
  process.exit(1)
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/** 找到 embedded-postgres 自带的二进制目录（按平台包名探测，不硬编码 windows-x64）。 */
async function findBinDir() {
  const scopeDir = path.join(PG_HOME, 'node_modules', '@embedded-postgres')
  let entries
  try {
    entries = await readdir(scopeDir)
  } catch {
    return null
  }
  for (const name of entries) {
    const bin = path.join(scopeDir, name, 'native', 'bin')
    if (await exists(path.join(bin, exe('pg_ctl')))) return bin
  }
  return null
}

async function ensurePackage() {
  const pkgPath = path.join(PG_HOME, 'package.json')
  if (!(await exists(pkgPath))) {
    await writeFile(
      pkgPath,
      JSON.stringify(
        {
          name: 'playbook-local-pg',
          private: true,
          description: '本地 PostgreSQL 二进制与数据目录（不进项目依赖，已在 .gitignore 内）',
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
  }
}

async function installBinary() {
  await mkdir(PG_HOME, { recursive: true })
  await ensurePackage()

  if (await findBinDir()) {
    log('embedded-postgres 已安装，跳过下载')
    return
  }

  log('安装 embedded-postgres（首次约 20–60 秒）…')
  // Windows 上必须经 shell 调 npm：Node 20 起（CVE-2024-27980 修复后）
  // child_process 不再允许直接 spawn 一个 .cmd/.bat，会抛 spawn EINVAL。
  // 参数里没有空格与特殊字符，所以 shell:true 不会引入引号拆分风险。
  const npmCmd = isWindows ? 'npm.cmd' : 'npm'
  try {
    await exec(npmCmd, ['install', 'embedded-postgres', '--no-audit', '--no-fund'], {
      cwd: PG_HOME,
      shell: isWindows,
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    fail(
      '安装失败：' +
        (error?.stderr?.trim() || error?.message || '未知错误') +
        '\n  排查：确认网络可访问 npm registry，或先在 .me/pg 下手动 npm install embedded-postgres',
    )
  }
}

async function initCluster(binDir) {
  if (await exists(path.join(DATA_DIR, 'PG_VERSION'))) {
    log('数据目录已存在，跳过 initdb')
    return
  }

  // 口令通过临时文件传给 initdb，避免出现在命令行（会被进程列表看到）。
  const pwFile = path.join(PG_HOME, '.initpw')
  await writeFile(pwFile, DB_PASSWORD, 'utf8')

  log(`initdb → ${DATA_DIR}`)
  try {
    await exec(
      path.join(binDir, exe('initdb')),
      [
        '-D',
        DATA_DIR,
        '-U',
        DB_USER,
        '--pwfile=' + pwFile,
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        // 固定 locale：中文 locale 会让 initdb 警告「找不到合适的全文检索配置」
        // 并把默认配置降级为 simple；显式指定 C 可让每次初始化结果一致。
        '--locale=C',
      ],
      { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 },
    )
  } catch (error) {
    await rm(pwFile, { force: true })
    fail('initdb 失败：' + (error?.stderr?.trim() || error?.message || '未知错误'))
  }
  await rm(pwFile, { force: true })
}

/**
 * 把端口写进 postgresql.conf。
 *
 * 用追加而不是改写：配置文件末尾的赋值会覆盖前面的默认值，
 * 而改写需要解析整个文件（注释、包含、转义），不值得为一行付出这个复杂度。
 * 重复执行时先检查是否已有同样的行，避免不断堆积。
 */
async function configurePort() {
  const confPath = path.join(DATA_DIR, 'postgresql.conf')
  const current = await readFile(confPath, 'utf8')
  const marker = `port = ${PORT}`
  if (current.split(/\r?\n/).some((line) => line.trim() === marker)) {
    log(`端口已是 ${PORT}`)
    return
  }
  await writeFile(
    confPath,
    current +
      '\n# --- playbook local dev ---\n' +
      `${marker}\n` +
      `listen_addresses = '127.0.0.1'\n`,
    'utf8',
  )
  log(`端口设为 ${PORT}（仅监听 127.0.0.1）`)
}

async function ctl(binDir, args) {
  return exec(path.join(binDir, exe('pg_ctl')), args, {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  })
}

/** pg_ctl status：0=运行中，3=未运行，4=数据目录不存在。 */
async function isRunning(binDir) {
  try {
    await ctl(binDir, ['-D', DATA_DIR, 'status'])
    return true
  } catch (error) {
    return error?.code === 0 ? true : false
  }
}

/**
 * 启动实例（仅用于建库，建完就停）。
 *
 * 用 spawn + stdio:'ignore'，不用 execFile：Windows 上 pg_ctl 启动的 postgres
 * 会继承输出管道，使 execFile 的 Promise 永不 resolve（命令看起来卡死，
 * 但数据库其实已经起来了）。就绪与否改用 TCP 端口轮询判断。
 */
async function startServer(binDir) {
  if (await isRunning(binDir)) {
    log('实例已在运行')
    return
  }
  log('启动实例（用于建库）…')
  await new Promise((resolve, reject) => {
    const child = spawn(
      path.join(binDir, exe('pg_ctl')),
      ['-D', DATA_DIR, '-l', LOG_FILE, '-w', '-t', '60', 'start'],
      { cwd: ROOT, stdio: 'ignore', detached: true, windowsHide: true },
    )
    child.once('error', reject)
    child.once('exit', () => resolve())
  })
  if (!(await waitForPort(PORT))) {
    fail(`启动超时：${PORT} 端口未开始监听。日志：${LOG_FILE}`)
  }
}

async function stopServer(binDir) {
  if (!(await isRunning(binDir))) return
  log('停止实例…')
  await ctl(binDir, ['-D', DATA_DIR, '-m', 'fast', '-w', '-t', '60', 'stop'])
}

/**
 * 建库。
 *
 * 刻意**不用** createdb：embedded-postgres 的平台包只带 initdb / pg_ctl / postgres，
 * 不带 psql 与 createdb（实测 windows-x64 包里只有这三个可执行文件）。
 * 而项目本身已经依赖 `pg`，用它连 postgres 维护库发一句 CREATE DATABASE 即可，
 * 既不依赖外部工具，也避开了「拼 createdb 路径」这类脆弱的假设。
 *
 * 为什么单独连 postgres 库：CREATE DATABASE 不能在目标库自己的连接上执行。
 */
async function ensureDatabase() {
  const { default: pg } = await import('pg')
  const admin = new pg.Client({
    host: '127.0.0.1',
    port: PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres',
  })

  await admin.connect()
  try {
    const existing = await admin.query('select 1 from pg_database where datname = $1', [DB_NAME])
    if (existing.rowCount > 0) {
      log(`数据库 ${DB_NAME} 已存在`)
      return
    }
    // 库名不能用参数占位符（DDL 不接受），因此先做标识符白名单校验。
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(DB_NAME)) {
      fail(`库名 ${DB_NAME} 不合法：只允许小写字母、数字与下划线`)
    }
    await admin.query(`create database "${DB_NAME}" encoding 'UTF8'`)
    log(`已创建数据库 ${DB_NAME}`)
  } catch (error) {
    fail('建库失败：' + (error?.message || '未知错误'))
  } finally {
    await admin.end()
  }
}

async function main() {
  await installBinary()
  const binDir = await findBinDir()
  if (!binDir) fail('安装后仍找不到 pg_ctl，请删除 .me/pg 后重试')

  await initCluster(binDir)
  await configurePort()

  await startServer(binDir)
  await ensureDatabase()
  await stopServer(binDir)

  const url = `postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`
  log('完成。把下面两行写进 .env.local：')
  console.log('')
  console.log(`  DATABASE_URL="${url}"`)
  console.log(`  INTERACTION_HASH_SALT="${'<随机长字符串>'}"`)
  console.log('')
  log('下一步：')
  console.log('  npm run db:start      # 启动（后台运行，关掉终端也不停）')
  console.log('  npm run db:migrate    # 建表')
  console.log('  npm run db:import     # 把 content/posts/*.mdx 同步进库')
  console.log('  npm run dev')
}

await main()
