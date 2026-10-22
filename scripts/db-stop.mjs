#!/usr/bin/env node
/**
 * 停止本地 PostgreSQL。
 *
 * 用法：
 *   npm run db:stop
 *
 * 用 `-m fast`（默认）：断开现有连接后立即关闭，不丢已提交的事务。
 * 不用 `-m immediate`：那相当于拔电源，下次启动要做崩溃恢复。
 * 也不用 `-m smart`：那会等所有客户端自己断开，开发时常常等不到。
 *
 * ## 为什么停完还要从端口反查一次
 *
 * `pg_ctl status` 只认 pid 文件。实例崩溃恢复中途被打断时，postmaster 已死、
 * pid 文件却还指着它，而它 fork 出的后台 worker 活着并占着监听端口 ——
 * 这时 pg_ctl 会说「未在运行」，端口却仍被一个查不出来的孤儿占着，下一次
 * `db:start` 就会把「端口能连」误判成「已启动」。
 *
 * 所以停完（或判定「未在运行」）之后都要清一次：孤儿进程 + 陈旧 pid 文件。
 * 正常停止时这两步都是空操作。
 */

import path from 'node:path'
import process from 'node:process'

import {
  DATA_DIR,
  clearPortHolders,
  exists,
  findBinDir,
  pgCtlStatus,
  pgCtlStop,
  readPidFile,
  readPort,
  removeStalePidFile,
} from './lib/pg-runtime.mjs'

function log(message) {
  console.log(`[db:stop] ${message}`)
}

async function main() {
  if (!(await exists(path.join(DATA_DIR, 'PG_VERSION')))) {
    log('数据目录不存在，无需停止')
    return
  }

  const binDir = await findBinDir()
  if (!binDir) {
    log('找不到 pg_ctl，可能从未安装')
    return
  }

  const port = await readPort()
  // 先记下「这次停止之前有没有本实例的痕迹」，用来决定收尾时该不该报警。
  const hadPidFile = (await readPidFile()) !== null
  const wasRunning = await pgCtlStatus(binDir)
  let stoppedProperly = false

  if (wasRunning) {
    try {
      await pgCtlStop(binDir)
      stoppedProperly = true
    } catch (error) {
      console.error(
        `[db:stop] 正常停止失败：${error?.stderr?.trim() || error?.message || '未知错误'}`,
      )
      console.error('  继续清理残留进程。')
    }
  }

  const { killed, skipped } = await clearPortHolders(port)
  if (killed.length > 0) log(`已结束占用端口的 postgres 进程：${killed.join(', ')}`)

  const removedPidFile = await removeStalePidFile()
  if (removedPidFile) log('已删除陈旧的 postmaster.pid')

  if (skipped.length > 0 && (hadPidFile || wasRunning)) {
    console.error(
      `[db:stop] 端口 ${port} 仍被其它进程占用（PID ${skipped
        .map((item) => item.pid)
        .join(', ')}），未做处理。`,
    )
    process.exitCode = 1
  }

  if (stoppedProperly || killed.length > 0 || removedPidFile) {
    log('已停止')
    return
  }

  log('未在运行')
}

await main()
