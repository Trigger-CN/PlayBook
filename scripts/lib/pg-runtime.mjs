/**
 * 本地 PostgreSQL 运行时探测与清理（db:start / db:stop 共用）。
 *
 * ## 为什么不能只看「端口在监听」
 *
 * 实例崩溃恢复中途被打断时，postmaster 会死掉，但它 fork 出的后台 worker
 * 会活下来并**继承监听 socket**。于是端口依然 TCP 可连（连接被内核 accept
 * 队列接住），却没有任何进程去 accept —— 查询发出去永远没有回应，客户端
 * 最终报「连接超时」。
 *
 * 这种状态下 `pg_ctl status`（只看 pid 文件）和 TCP 端口探测都会说「正常」。
 * 所以这里只用两个判据：
 *   - 就绪 = 能在一个往返内拿到 SQL 结果（probeSql）
 *   - 谁是孤儿 = 从端口反查 PID，再看它是不是本实例记录的 postmaster、
 *     或它的父进程是否已经不存在
 *
 * 只读探测集中在这里，避免 start / stop 各写一份而慢慢漂移。
 */

import { execFile } from 'node:child_process'
import { access, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

// scripts/lib/ → scripts/ → 项目根
export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
export const PG_HOME = path.join(ROOT, '.me', 'pg')
export const DATA_DIR = path.join(PG_HOME, 'pgdata')
export const LOG_FILE = path.join(PG_HOME, 'server.log')
export const PID_FILE = path.join(DATA_DIR, 'postmaster.pid')

// 本机开发凭据，与 db-setup.mjs 保持一致；部署必须换成真实强口令。
export const DB_USER = 'postgres'
export const DB_PASSWORD = 'postgres'

// 探测连维护库：db:start 可能早于 db:migrate，那时业务库还不存在。
const PROBE_DATABASE = 'postgres'

const isWindows = process.platform === 'win32'

export function exe(name) {
  return isWindows ? `${name}.exe` : name
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/** 按平台包名探测 embedded-postgres 的二进制目录，不硬编码 windows-x64。 */
export async function findBinDir() {
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

export function pgCtlPath(binDir) {
  return path.join(binDir, exe('pg_ctl'))
}

/** 从 postgresql.conf 末尾读回实际端口，避免 start 与 setup 用了不同 PGPORT。 */
export async function readPort(fallback = 5432) {
  try {
    const text = await readFile(path.join(DATA_DIR, 'postgresql.conf'), 'utf8')
    const matches = [...text.matchAll(/^\s*port\s*=\s*(\d+)\s*$/gm)]
    if (matches.length === 0) return fallback
    return Number(matches[matches.length - 1][1])
  } catch {
    return fallback
  }
}

/**
 * 读 postmaster.pid。文件固定 8 行：
 * PID / 数据目录 / 启动时间戳 / 端口 / socket 目录 / 监听地址 / shmem key / 状态。
 * 没有文件时返回 null。
 */
export async function readPidFile() {
  let text
  try {
    text = await readFile(PID_FILE, 'utf8')
  } catch {
    return null
  }
  const lines = text.split(/\r?\n/)
  const pid = Number.parseInt(lines[0] ?? '', 10)
  return {
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    port: Number.parseInt(lines[3] ?? '', 10) || null,
    status: (lines[7] ?? '').trim(),
  }
}

/** PID 是否还活着。用 signal 0 探测，不依赖任何外部命令。 */
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM = 进程存在但当前用户无权发信号，仍算活着。
    return error?.code === 'EPERM'
  }
}

/** pg_ctl status：退出码 0 表示 pid 文件里的进程还活着。 */
export async function pgCtlStatus(binDir) {
  try {
    await exec(pgCtlPath(binDir), ['-D', DATA_DIR, 'status'], {
      cwd: ROOT,
      maxBuffer: 4 * 1024 * 1024,
    })
    return true
  } catch {
    return false
  }
}

/** pg_ctl stop（-m fast：断开现有连接后关闭，不丢已提交的事务）。 */
export async function pgCtlStop(binDir) {
  await exec(pgCtlPath(binDir), ['-D', DATA_DIR, '-m', 'fast', '-w', '-t', '60', 'stop'], {
    cwd: ROOT,
    maxBuffer: 8 * 1024 * 1024,
  })
}

/** 谁在监听这个端口。孤儿只认 socket，所以这是唯一可靠的识别方向。 */
export async function findPortListeners(port) {
  const toPids = (stdout) => [
    ...new Set(
      stdout
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ]

  if (isWindows) {
    const script =
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue ` +
      '| Select-Object -ExpandProperty OwningProcess'
    try {
      const { stdout } = await exec(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      )
      return toPids(stdout)
    } catch {
      return []
    }
  }

  // POSIX：没有 lsof 就返回空数组，调用方按「没发现孤儿」处理。
  try {
    const { stdout } = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      maxBuffer: 1024 * 1024,
    })
    return toPids(stdout)
  } catch {
    return []
  }
}

/**
 * 把 ps / CIM 的原始字段规整成统一结构，并识别身份。
 *
 * postgres 只有两种命令行形态：
 *   postmaster  「…/postgres.exe」 -D "…/pgdata"
 *   子进程      「…/postgres.exe」 --forkchild="io_worker" 1764
 *
 * 身份必须先认出来：只凭「父进程是否已死」区分不出孤儿与正常 postmaster ——
 * pg_ctl 是 detach 启动的，它退出后 postmaster 的父进程本来就不在了。
 */
function toDescriptor(pid, parentId, name, commandLine) {
  const text = String(commandLine ?? '').trim()
  const parent = Number.parseInt(parentId, 10)
  return {
    pid: Number.parseInt(pid, 10),
    ppid: Number.isInteger(parent) && parent > 0 ? parent : null,
    name: String(name ?? '').trim(),
    commandLine: text,
    kind: /--forkchild=/i.test(text) ? 'child' : /(^|\s)-D(\s|$)/.test(text) ? 'postmaster' : 'unknown',
  }
}

/** 查一个进程的名字、父进程、命令行与身份。查不到返回 null。 */
export async function describeProcess(pid) {
  if (isWindows) {
    const script =
      `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" ` +
      '| Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'
    try {
      const { stdout } = await exec(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      )
      const parsed = JSON.parse(stdout.trim() || 'null')
      if (!parsed) return null
      return toDescriptor(parsed.ProcessId ?? pid, parsed.ParentProcessId, parsed.Name, parsed.CommandLine)
    } catch {
      return null
    }
  }

  try {
    const { stdout } = await exec('ps', ['-p', String(pid), '-o', 'ppid=,command='], {
      maxBuffer: 1024 * 1024,
    })
    const line = stdout.trim()
    if (!line) return null
    const parts = line.split(/\s+/)
    const commandLine = parts.slice(1).join(' ')
    return toDescriptor(pid, parts[0], path.basename(parts[1] ?? ''), commandLine)
  } catch {
    return null
  }
}

function isPostgresProcess(descriptor) {
  return /^postgres(\.exe)?$/i.test(descriptor?.name ?? '')
}

/** 命令行是否指向本仓库装的这套二进制。用来避免误伤另一个 PostgreSQL 安装。 */
function isOwnedByThisInstall(descriptor) {
  const normalize = (value) => value.replace(/\\/g, '/').toLowerCase()
  if (!descriptor?.commandLine) return false
  return normalize(descriptor.commandLine).includes(normalize(PG_HOME))
}

/** 列出机器上所有 postgres 进程及其身份。 */
export async function listPostgresProcesses() {
  if (isWindows) {
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" " +
      '| Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'
    try {
      const { stdout } = await exec(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      )
      const text = stdout.trim()
      if (!text) return []
      const parsed = JSON.parse(text)
      const rows = Array.isArray(parsed) ? parsed : [parsed]
      return rows.map((row) =>
        toDescriptor(row.ProcessId, row.ParentProcessId, row.Name, row.CommandLine),
      )
    } catch {
      return []
    }
  }

  try {
    const { stdout } = await exec('ps', ['-eo', 'pid=,ppid=,args='], { maxBuffer: 4 * 1024 * 1024 })
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(/\s+/)
        const commandLine = parts.slice(2).join(' ')
        return toDescriptor(parts[0], parts[1], path.basename(parts[2] ?? ''), commandLine)
      })
      .filter((descriptor) => isPostgresProcess(descriptor))
  } catch {
    return []
  }
}

/**
 * 强杀一个进程，并等到它真的消失。
 *
 * 只用在残留进程身上：正常停止走 pg_ctl -m fast 才能保证数据一致；而孤儿的
 * 父 postmaster 已经没了，它本身不再参与任何一致性保证。
 */
export async function terminateProcess(pid) {
  if (!isPidAlive(pid)) return true
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    return false
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isPidAlive(pid)) return true
    await delay(100)
  }
  return !isPidAlive(pid)
}

/**
 * 清掉占着端口的残留 postgres 进程。
 *
 * ## 为什么不能只看「谁在监听端口」
 *
 * Windows 把监听 socket 记在**创建它的那个进程**上。postmaster 死掉、子进程
 * 继承 socket 之后，`Get-NetTCPConnection` 报出来的 OwningProcess 仍然是那个
 * **已经不存在**的 PID —— 真正占着端口的 worker 根本不出现在列表里。
 *
 * 只按端口反查就会看到一个查不到的 PID，进而误判成「外部进程」而拒绝清理，
 * 于是 `db:start` 明明能修却报错退出。这个坑是实测踩到的，不是推测。
 *
 * ## 两轮扫描
 *
 *   1. 端口归属者里**还查得到**的进程：只有「就是 pid 文件记录的 postmaster」
 *      或「本仓库二进制的子进程」才动手，其余一律只报告不杀。
 *   2. 全机 postgres 进程里，命令行属于本仓库这套二进制、身份是子进程、
 *      且父进程已经不在的那些 —— 这些才是继承了 socket 的孤儿。
 *
 * postmaster 不在这里处理：它还活着时该走 `pg_ctl -m fast`，那才保证数据一致。
 * 命令行不属于本仓库的 postgres 一律只报告不杀 —— 替用户结束别人的数据库
 * 不是这个脚本该做的决定。
 */
export async function clearPortHolders(port) {
  const pidInfo = await readPidFile()
  const killed = []
  const skipped = []

  // 第一轮：操作系统认定的监听者
  for (const pid of await findPortListeners(port)) {
    const descriptor = await describeProcess(pid)

    // 查不到 = 进程已经不在了。端口可能仍被它遗留的 worker 占着，交给第二轮。
    if (!descriptor) continue

    if (!isPostgresProcess(descriptor)) {
      skipped.push({ pid, reason: 'not-postgres' })
      continue
    }

    const isRecordedPostmaster = pidInfo?.pid === pid
    const isOwnChild = isOwnedByThisInstall(descriptor) && descriptor.kind === 'child'

    if (!isRecordedPostmaster && !isOwnChild) {
      skipped.push({ pid, reason: 'owned-by-other-instance' })
      continue
    }

    if (await terminateProcess(pid)) killed.push(pid)
    else skipped.push({ pid, reason: 'terminate-failed' })
  }

  // 第二轮：继承了监听 socket、但不会出现在端口列表里的孤儿子进程
  for (const descriptor of await listPostgresProcesses()) {
    if (descriptor.kind !== 'child') continue
    if (!isOwnedByThisInstall(descriptor)) continue
    if (killed.includes(descriptor.pid)) continue
    if (!descriptor.ppid || isPidAlive(descriptor.ppid)) continue

    if (await terminateProcess(descriptor.pid)) killed.push(descriptor.pid)
    else skipped.push({ pid: descriptor.pid, reason: 'terminate-failed' })
  }

  return { killed, skipped }
}

/**
 * 删掉陈旧 postmaster.pid。
 *
 * 只在记录的 PID 已经不在时删：PID 还活着说明那确实是个正在运行的实例，
 * 删掉 pid 文件会让后续 pg_ctl 彻底失去对它的追踪。
 */
export async function removeStalePidFile() {
  const info = await readPidFile()
  if (!info) return false
  if (info.pid && isPidAlive(info.pid)) return false
  await rm(PID_FILE, { force: true })
  return true
}

/**
 * 真实查询探测：能不能在一个往返内拿到 SQL 结果。
 *
 * 这是「就绪」的唯一判据。TCP 能连上不算 —— 孤儿监听正是靠这一点伪装成
 * 「已启动」的。pg 的 connectionTimeoutMillis 覆盖整个启动握手（含认证），
 * 所以对端不回应时它会抛「Connection terminated due to connection timeout」，
 * 而不是一直挂着。
 */
export async function probeSql(port, timeoutMs = 2500) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({
    host: '127.0.0.1',
    port,
    user: DB_USER,
    password: DB_PASSWORD,
    database: PROBE_DATABASE,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    application_name: 'playbook-db-probe',
  })

  try {
    await client.connect()
    await client.query('select 1')
    return true
  } catch {
    return false
  } finally {
    // 连接已经坏掉时 end() 有可能不 resolve，因此给一个上限再放手。
    await Promise.race([client.end().catch(() => {}), delay(1000)])
  }
}

export async function waitForSql(port, totalMs = 30000, intervalMs = 400) {
  const deadline = Date.now() + totalMs
  while (Date.now() < deadline) {
    if (await probeSql(port)) return true
    if (Date.now() >= deadline) break
    await delay(intervalMs)
  }
  return false
}
