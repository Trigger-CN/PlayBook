#!/usr/bin/env node
/**
 * 迁移执行器（自建 PostgreSQL 与 Supabase 通用）。
 *
 * 用法：
 *   node scripts/db-migrate.mjs            # 应用 supabase/migrations 下所有未执行迁移
 *   node scripts/db-migrate.mjs --dry-run  # 只列出将要执行的迁移
 *   node scripts/db-migrate.mjs --seed     # 迁移后额外执行 supabase/seed.sql
 *
 * 设计要点：
 * - 迁移文件名需形如 20261021000001_xxx.sql，按文件名升序执行。
 * - 已执行记录写入 public.schema_migrations，因此可重复运行且幂等。
 * - 每个文件在单个事务内执行；失败则整体回滚，不留半套 schema。
 * - 检测到运行在 Supabase 上（存在 auth schema 或 supabase_admin 角色）时，
 *   才执行 RLS 策略文件；自建库默认跳过 Supabase 专有策略，避免 auth.* 报错。
 * - 迁移在 supabase/ 下而不在 db/ 下，是为了让 Supabase CLI 与自建脚本共用同一份 SQL。
 */

import './lib/load-env.mjs'

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import pg from 'pg'

const { Client } = pg

const ROOT = process.cwd()
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')
const SEED_FILE = path.join(ROOT, 'supabase', 'seed.sql')

/** 依赖 Supabase 专有对象（auth.*、service_role）的文件，自建库跳过。 */
const SUPABASE_ONLY_PATTERN = /_rls_policies\.sql$/

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const withSeed = args.has('--seed')

function fail(message) {
  console.error(`[migrate] ${message}`)
  process.exit(1)
}

function loadConnectionString() {
  const url = process.env.DATABASE_URL
  if (!url || url.trim().length === 0) {
    fail('缺少 DATABASE_URL。示例：postgres://user:pass@127.0.0.1:5432/playbook')
  }
  return url.trim()
}

async function listMigrationFiles() {
  let entries
  try {
    entries = await readdir(MIGRATIONS_DIR)
  } catch (error) {
    fail(`无法读取迁移目录 ${MIGRATIONS_DIR}：${error.message}`)
  }
  const files = entries.filter((name) => name.endsWith('.sql')).sort()
  if (files.length === 0) fail('迁移目录为空')
  return files
}

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `)
}

async function appliedMigrations(client) {
  const { rows } = await client.query('select filename from public.schema_migrations')
  return new Set(rows.map((row) => row.filename))
}

/** 判断当前库是否为 Supabase：存在 auth schema 或 supabase_admin 角色。 */
async function detectSupabase(client) {
  const { rows } = await client.query(`
    select
      exists (select 1 from information_schema.schemata where schema_name = 'auth') as has_auth,
      exists (select 1 from pg_roles where rolname = 'supabase_admin') as has_supabase_admin
  `)
  const row = rows[0]
  return Boolean(row?.has_auth || row?.has_supabase_admin)
}

async function applyFile(client, filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename)
  const sql = await readFile(fullPath, 'utf8')

  await client.query('begin')
  try {
    await client.query(sql)
    await client.query('insert into public.schema_migrations (filename) values ($1)', [filename])
    await client.query('commit')
    console.log(`[migrate] 已应用 ${filename}`)
  } catch (error) {
    await client.query('rollback')
    fail(`应用 ${filename} 失败：${error.message}`)
  }
}

async function applySeed(client) {
  const sql = await readFile(SEED_FILE, 'utf8')
  await client.query('begin')
  try {
    await client.query(sql)
    await client.query('commit')
    console.log('[migrate] 已写入种子数据 supabase/seed.sql')
  } catch (error) {
    await client.query('rollback')
    fail(`写入种子数据失败：${error.message}`)
  }
}

async function main() {
  const connectionString = loadConnectionString()
  const files = await listMigrationFiles()

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
    application_name: 'playbook-migrate',
  })

  await client.connect()

  try {
    const isSupabase = await detectSupabase(client)
    console.log(`[migrate] 目标数据库：${isSupabase ? 'Supabase' : '自建 PostgreSQL'}`)

    await ensureMigrationTable(client)
    const done = await appliedMigrations(client)

    const pending = files.filter((name) => {
      if (done.has(name)) return false
      if (SUPABASE_ONLY_PATTERN.test(name) && !isSupabase) {
        console.log(`[migrate] 跳过 ${name}（Supabase 专有策略，当前为自建库）`)
        return false
      }
      return true
    })

    if (pending.length === 0) {
      console.log('[migrate] 没有待执行的迁移')
    }

    for (const filename of pending) {
      if (dryRun) {
        console.log(`[migrate] 将执行 ${filename}`)
        continue
      }
      await applyFile(client, filename)
    }

    if (withSeed && !dryRun) {
      await applySeed(client)
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => fail(error.message))
