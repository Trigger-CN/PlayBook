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
 * 因此这里用 spawn + stdio:'ignore' 彻底断开输出管道。
 * pg_ctl 的 -l 仍然把服务端日志写进文件，排查时看那个文件。
 *
 * ## 就绪判据是「真实 SQL 往返」，不是「端口在监听」
 *
 * 这是踩坑换来的。实例崩溃恢复中途被打断时，postmaster 会死掉，但它 fork
 * 出的后台 worker 会活下来并继承监听 socket：端口依然 TCP 可连，却没有
 * 任何进程 accept。此时 `pg_ctl status`（只看 pid 文件）和端口探测都会说
 * 「在运行」，而应用侧每个查询都会挂到超时 —— 之前就是这样把一次启动
 * 谎报成成功的。
 *
 * 所以启动前先把残留清干净，启动后只用 SQL 探测判定成功：
 *   1. 端口有监听但查询不通 → 僵尸，先清再启
 *   2. postmaster.pid 指向的进程已不存在 → 陈旧文件，删掉
 *   3. postmaster.pid 指向的进程还在但端口没监听 → 半死，先清再启
 *
 * ## 为什么用 pg_ctl 而不是常驻 node 进程
 *
 * 之前验证时用的是「node 里 new EmbeddedPostgres() 然后 process.stdin.resume()」，
 * 那种方式下数据库的生命周期绑在终端上：关窗口实例就没了，且终端被占住。
 * pg_ctl 把 postgres 交给操作系统托管，命令立即返回，与装原生 PostgreSQL 的体验一致。
 */

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import {
  DATA_DIR,
  LOG_FILE,
  PG_HOME,
  ROOT,
  clearPortHolders,
  exists,
  findBinDir,
  findPortListeners,
  isPidAlive,
  pgCtlPath,
  pgCtlStatus,
  pgCtlStop,
  probeSql,
  readPidFile,
  readPort,
  removeStalePidFile,
  waitForSql,
} from './lib/pg-runtime.mjs'

function log(message) {
  console.log(`[db:start] ${message}`)
}

function fail(message) {
  console.error(`[db:start] ${message}`)
  process.exit(1)
}

/**
 * 用 spawn 启动，stdio 设为 ignore。
 *
 * stdio:'ignore' 是关键 —— 见文件头注释。detached 让 node 不因这个子进程
 * 而保持存活，所以命令跑完就退出，postgres 继续在后台跑。
 */
function spawnStart(binDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      pgCtlPath(binDir),
      ['-D', DATA_DIR, '-l', LOG_FILE, '-w', '-t', '60', 'start'],
      { cwd: ROOT, stdio: 'ignore', detached: true, windowsHide: true },
    )
    child.once('error', reject)
    // 不看退出码：端口被占时 pg_ctl 会立刻返回非 0，但真正该问的是
    // 「数据库现在能不能服务查询」，那个由 waitForSql 回答。
    child.once('exit', () => resolve())
  })
}

/**
 * 把「看起来在运行、其实不能服务查询」的状态清干净。
 *
 * 三种残留（僵尸 postmaster、孤儿 worker、陈旧 pid 文件）的外部表现一致：
 * 端口占着、SQL 不通。区分它们对使用者没有意义 —— 该做的事都是清干净再启动。
 */
async function resetInstance(binDir, port, reason) {
  log(`检测到异常状态：${reason}`)

  // 先走正规停止：postmaster 还活着时，-m fast 能保证数据一致。
  if (await pgCtlStatus(binDir)) {
    log('尝试正常停止残留实例…')
    try {
      await pgCtlStop(binDir)
    } catch {
      log('正常停止失败，继续清理残留进程')
    }
  }

  const { killed, skipped } = await clearPortHolders(port)
  if (killed.length > 0) log(`已结束占用端口的 postgres 进程：${killed.join(', ')}`)

  if (skipped.length > 0) {
    fail(
      `端口 ${port} 上仍有未能清理的进程（PID ${skipped.map((item) => item.pid).join(', ')}）。\n` +
        '  请先释放该端口，或换端口重跑 db:setup。',
    )
  }

  if (await removeStalePidFile()) log('已删除陈旧的 postmaster.pid')
}

async function main() {
  if (!(await exists(path.join(DATA_DIR, 'PG_VERSION')))) {
    fail('数据目录不存在。先执行 npm run db:setup')
  }

  const binDir = await findBinDir()
  if (!binDir) fail('找不到 pg_ctl。先执行 npm run db:setup')

  const port = await readPort()
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/playbook`

  // 已经在服务查询：什么都不用做。这一步同时保证重复执行 db:start 是安全的。
  if (await probeSql(port)) {
    log(`已在运行：${url}`)
    return
  }

  const pidInfo = await readPidFile()
  const listeners = await findPortListeners(port)
  const recordedPidAlive = Boolean(pidInfo?.pid) && isPidAlive(pidInfo.pid)

  if (listeners.length > 0) {
    await resetInstance(binDir, port, `端口 ${port} 有监听，但查询没有响应`)
  } else if (pidInfo && !recordedPidAlive) {
    await resetInstance(binDir, port, 'postmaster.pid 指向的进程已不存在')
  } else if (recordedPidAlive) {
    await resetInstance(binDir, port, 'postmaster.pid 指向的进程还在，但端口没有监听')
  }

  await mkdir(PG_HOME, { recursive: true })
  log('启动中…')
  await spawnStart(binDir)

  if (!(await waitForSql(port))) {
    fail(
      `启动失败：${port} 端口上等不到可用的数据库。\n` +
        `  日志：${LOG_FILE}\n` +
        '  可尝试：npm run db:stop 后重试；或删除 .me/pg 重新 db:setup',
    )
  }

  log(`已启动：${url}`)
  log(`日志：${LOG_FILE}`)
  log('停止：npm run db:stop')
}

await main()
