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
 */

import { execFile } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PG_HOME = path.join(ROOT, '.me', 'pg')
const DATA_DIR = path.join(PG_HOME, 'pgdata')

const isWindows = process.platform === 'win32'
const exe = (name) => (isWindows ? `${name}.exe` : name)

function log(message) {
  console.log(`[db:stop] ${message}`)
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

  const ctl = (args) =>
    exec(path.join(binDir, exe('pg_ctl')), args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 })

  try {
    await ctl(['-D', DATA_DIR, 'status'])
  } catch {
    log('未在运行')
    return
  }

  try {
    await ctl(['-D', DATA_DIR, '-m', 'fast', '-w', '-t', '60', 'stop'])
  } catch (error) {
    console.error(
      `[db:stop] 停止失败：${error?.stderr?.trim() || error?.message || '未知错误'}`,
    )
    console.error('  若进程已卡死，可在任务管理器结束 postgres.exe 后重试。')
    process.exit(1)
  }

  log('已停止')
}

await main()
