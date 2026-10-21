#!/usr/bin/env node
/**
 * 启动本地 PostgreSQL（后台常驻）。
 *
 * 用法：
 *   npm run db:start
 *
 * ## 为什么不用 execFile 跑 pg_ctl start
 *
 * 在 Windows 上 `pg_ctl start` 会**挂住**：它 fork 出的 postgres 子进程继承了
 * pg_ctl 的 stdout/stderr 管道，于是父进程的 'close' 事件永远不来，Promise 不 resolve。
 * 现象是命令看起来卡死、终端不还提示符，但数据库其实已经起来了 ——
 * 这种「成功了却像失败」最难判断。
 *
 * 因此这里用 spawn + stdio:'ignore' 彻底断开输出管道，
 * 然后**轮询端口**判断就绪，而不是依赖 pg_ctl 的退出码。
 * pg_ctl 的 -l 仍然把服务端日志写进文件，排查时看那个文件。
 *
 * ## 为什么用 pg_ctl 而不是常驻 node 进程
 *
 * 之前验证时用的是「node 里 new EmbeddedPostgres() 然后 process.stdin.resume()」，
 * 那种方式下数据库的生命周期绑在终端上：关窗口实例就没了，且终端被占住。
 * pg_ctl 把 postgres 交给操作系统托管，命令立即返回，与装原生 PostgreSQL 的体验一致。
 */

import { spawn, execFile } from 'node:child_process'
import { access, mkdir, readdir, readFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PG_HOME = path.join(ROOT, '.me', 'pg')
const DATA_DIR = path.join(PG_HOME, 'pgdata')
const LOG_FILE = path.join(PG_HOME, 'server.log')

const isWindows = process.platform === 'win32'
const exe = (name) => (isWindows ? `${name}.exe` : name)

function log(message) {
  console.log(`[db:start] ${message}`)
}

function fail(message) {
  console.error(`[db:start] ${message}`)
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

/** 从 postgresql.conf 末尾读回实际端口，避免 start 与 setup 用了不同 PGPORT。 */
async function readPort() {
  const confPath = path.join(DATA_DIR, 'postgresql.conf')
  const text = await readFile(confPath, 'utf8')
  const matches = [...text.matchAll(/^\s*port\s*=\s*(\d+)\s*$/gm)]
  if (matches.length === 0) return 5432
  return Number(matches[matches.length - 1][1])
}

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

/** pg_ctl status：退出码 0 表示在运行。 */
async function isRunning(binDir) {
  try {
    await exec(path.join(binDir, exe('pg_ctl')), ['-D', DATA_DIR, 'status'], {
      cwd: ROOT,
      maxBuffer: 4 * 1024 * 1024,
    })
    return true
  } catch {
    return false
  }
}

/**
 * 用 spawn 启动，stdio 设为 ignore。
 *
 * stdio:'ignore' 是关键 —— 见文件头注释。detached + unref 让 node 不因这个
 * 子进程而保持存活，所以命令跑完就退出，postgres 继续在后台跑。
 */
function spawnStart(binDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      path.join(binDir, exe('pg_ctl')),
      ['-D', DATA_DIR, '-l', LOG_FILE, '-w', '-t', '60', 'start'],
      { cwd: ROOT, stdio: 'ignore', detached: true, windowsHide: true },
    )
    child.once('error', reject)
    // 不论退出码是什么，都交给端口轮询判定真实结果：
    // 「端口是否在监听」不会说谎，而 pg_ctl 的退出码在部分 Windows 环境下不可靠。
    child.once('exit', () => resolve())
  })
}

async function main() {
  if (!(await exists(path.join(DATA_DIR, 'PG_VERSION')))) {
    fail('数据目录不存在。先执行 npm run db:setup')
  }

  const binDir = await findBinDir()
  if (!binDir) fail('找不到 pg_ctl。先执行 npm run db:setup')

  const port = await readPort()

  if (await isRunning(binDir)) {
    log(`已在运行：postgres://postgres:postgres@127.0.0.1:${port}/playbook`)
    return
  }

  await mkdir(PG_HOME, { recursive: true })
  log('启动中…')
  await spawnStart(binDir)

  if (!(await waitForPort(port))) {
    fail(
      `启动超时：${port} 端口未开始监听。\n  日志：${LOG_FILE}\n  可尝试：npm run db:stop 后重试；或删除 .me/pg 重新 db:setup`,
    )
  }

  log(`已启动：postgres://postgres:postgres@127.0.0.1:${port}/playbook`)
  log(`日志：${LOG_FILE}`)
  log('停止：npm run db:stop')
}

await main()
