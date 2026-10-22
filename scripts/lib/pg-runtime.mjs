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

/** 查一个 PID 的名字与父进程。查不到返回 null。 */
export async function describeProcess(pid) {
  if (isWindows) {
    const script =
      `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" ` +
      '| Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress'
    try {
      const { stdout } = await exec(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      )
      const parsed = JSON.parse(stdout.trim() || 'null')
      if (!parsed) return null
      return {
        pid,
        ppid: Number.parseInt(parsed.ParentProcessId, 10) || null,
        name: String(parsed.Name ?? '').trim(),
      }
    } catch {
      return null
    }
  }

  try {
    const { stdout } = await exec('ps', ['-p', String(pid), '-o', 'ppid=,comm='], {
      maxBuffer: 1024 * 1024,
    })
    const [ppidText, ...nameParts] = stdout.trim().split(/\s+/)
    if (!ppidText) return null
    return {
      pid,
      ppid: Number.parseInt(ppidText, 10) || null,
      name: nameParts.join(' ').trim(),
    }
  } catch {
    return null
  }
}

function isPostgresProcess(descriptor) {
  return /^postgres(\.exe)?$/i.test(descriptor?.name ?? '')
}

/**
 * 强杀一个进程，并等到它真的消失。
 *
 * 只用在孤儿身上：正常停止走 pg_ctl -m fast 才能保证数据一致；而孤儿的
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
 * 清掉占着端口的 postgres 进程。
 *
 * 只在两种情况下动手，避免误伤别的实例：
 *   - 它就是 postmaster.pid 记录的那个进程（本实例的 postmaster，只是已经不能服务查询）
 *   - 它的父进程已经不在了（孤儿：父 postmaster 崩溃后活下来的 worker）
 *
 * 其它 postgres 进程只报告、不杀：端口被别的实例占着是配置问题，
 * 替用户杀掉别人的数据库不是这个脚本该做的决定。
 */
export async function clearPortHolders(port) {
  const pidInfo = await readPidFile()
  const killed = []
  const skipped = []

  for (const pid of await findPortListeners(port)) {
    const descriptor = await describeProcess(pid)

    if (!isPostgresProcess(descriptor)) {
      skipped.push({ pid, reason: 'not-postgres' })
      continue
    }

    const isRecordedPostmaster = pidInfo?.pid === pid
    const isOrphan = descriptor.ppid ? !isPidAlive(descriptor.ppid) : false

    if (!isRecordedPostmaster && !isOrphan) {
      skipped.push({ pid, reason: 'owned-by-other-instance' })
      continue
    }

    if (await terminateProcess(pid)) killed.push(pid)
    else skipped.push({ pid, reason: 'terminate-failed' })
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
