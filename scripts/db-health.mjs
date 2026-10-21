#!/usr/bin/env node
/**
 * 数据库连通性与 schema 自检（自建 PostgreSQL 与 Supabase 通用）。
 *
 * 用法：
 *   node scripts/db-health.mjs
 *
 * 输出（全部为脱敏信息）：
 *   - 连接是否成功、往返延迟
 *   - 服务端版本、当前角色、当前库名
 *   - 是否为 Supabase 实例
 *   - 核心表与公开计数函数是否齐备、已应用的迁移文件
 *
 * 安全约定：绝不打印 DATABASE_URL 或其任何片段（含密码），
 * 只打印主机名与库名以便排查。
 */

import process from 'node:process'

import pg from 'pg'

const { Client } = pg

const REQUIRED_TABLES = [
  'posts',
  'timeline_items',
  'comments',
  'likes',
  'page_views',
  'activity_events',
  'site_daily_stats',
]

const REQUIRED_FUNCTIONS = [
  'get_like_state',
  'get_like_counts',
  'record_page_view',
  'get_content_totals',
]

function fail(message) {
  console.error(`[db:health] ${message}`)
  process.exit(1)
}

/** 只取协议之外的主机与库名，用于日志；不返回用户名与密码。 */
function describeTarget(rawUrl) {
  try {
    const url = new URL(rawUrl)
    const database = url.pathname.replace(/^\//, '') || '(默认)'
    return `${url.hostname}:${url.port || '5432'}/${database}`
  } catch {
    return '(无法解析的连接串)'
  }
}

function loadConnectionString() {
  const url = process.env.DATABASE_URL
  if (!url || url.trim().length === 0) {
    fail('缺少 DATABASE_URL。示例：postgres://user:pass@127.0.0.1:5432/playbook')
  }
  return url.trim()
}

async function main() {
  const connectionString = loadConnectionString()

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
    application_name: 'playbook-health',
    connectionTimeoutMillis: 10_000,
  })

  console.log(`[db:health] 目标 ${describeTarget(connectionString)}`)

  const startedAt = Date.now()
  await client.connect()
  const latencyMs = Date.now() - startedAt
  console.log(`[db:health] 连接成功，耗时 ${latencyMs} ms`)

  try {
    const { rows: infoRows } = await client.query(`
      select
        current_setting('server_version')            as server_version,
        current_user                                 as current_role,
        current_database()                           as database_name,
        exists (select 1 from information_schema.schemata where schema_name = 'auth')
          or exists (select 1 from pg_roles where rolname = 'supabase_admin')
                                                     as is_supabase
    `)
    const info = infoRows[0]
    console.log(`[db:health] 服务端 PostgreSQL ${info.server_version}`)
    console.log(`[db:health] 当前角色 ${info.current_role}，当前库 ${info.database_name}`)
    console.log(`[db:health] 实例类型 ${info.is_supabase ? 'Supabase' : '自建 PostgreSQL'}`)

    const { rows: tableRows } = await client.query(
      `
      select table_name
        from information_schema.tables
       where table_schema = 'public'
         and table_name = any($1::text[])
      `,
      [REQUIRED_TABLES],
    )
    const presentTables = new Set(tableRows.map((row) => row.table_name))
    const missingTables = REQUIRED_TABLES.filter((name) => !presentTables.has(name))

    const { rows: functionRows } = await client.query(
      `
      select distinct p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = any($1::text[])
      `,
      [REQUIRED_FUNCTIONS],
    )
    const presentFunctions = new Set(functionRows.map((row) => row.proname))
    const missingFunctions = REQUIRED_FUNCTIONS.filter((name) => !presentFunctions.has(name))

    const { rows: migrationRows } = await client.query(
      `
      select filename
        from public.schema_migrations
       order by filename
      `,
    ).catch(() => ({ rows: null }))

    if (migrationRows === null) {
      console.log('[db:health] 尚未初始化：public.schema_migrations 不存在（请先运行 npm run db:migrate）')
    } else {
      console.log(`[db:health] 已应用迁移 ${migrationRows.length} 个`)
      for (const row of migrationRows) console.log(`  - ${row.filename}`)
    }

    if (missingTables.length > 0) {
      console.error(`[db:health] 缺少表：${missingTables.join(', ')}`)
    }
    if (missingFunctions.length > 0) {
      console.error(`[db:health] 缺少函数：${missingFunctions.join(', ')}`)
    }
    if (missingTables.length > 0 || missingFunctions.length > 0) {
      process.exitCode = 1
      return
    }

    console.log('[db:health] schema 自检通过：核心表与公开计数函数齐备')
  } finally {
    await client.end()
  }
}

main().catch((error) => fail(error.message))
