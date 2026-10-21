import 'server-only'

import { Pool, type PoolConfig } from 'pg'

/**
 * PostgreSQL 连接池（自建库过渡实现）。
 *
 * 设计要点：
 * - 单例：Next.js 开发模式会反复热重载模块，模块级单例若挂在 globalThis 上
 *   可避免每次热更新都新建连接池耗尽数据库连接。
 * - 惰性：只有真正调用 getPool() 时才建池；未配置 DATABASE_URL 时不会触碰网络。
 * - 与 Supabase 的关系：Supabase 底层就是 PostgreSQL，DATABASE_URL 指向
 *   Supabase 的连接串时本层同样可用（使用 session/direct 连接串，非 pooler 事务模式）。
 */

type GlobalWithPool = typeof globalThis & {
  __playbookPgPool?: Pool
}

const globalForPool = globalThis as GlobalWithPool

function buildConfig(connectionString: string): PoolConfig {
  return {
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // 自建库通常没有强制 TLS；Supabase 需要。用环境变量显式控制，避免"看起来加密其实没有"。
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
    application_name: 'playbook',
  }
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error(
      '缺少环境变量 DATABASE_URL：请配置 PostgreSQL 连接串（可参考 .env.example）。' +
        '未配置时整站会回退到文件/种子数据源。',
    )
  }
  return url.trim()
}

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL
  return typeof url === 'string' && url.trim().length > 0
}

export function getPool(): Pool {
  if (globalForPool.__playbookPgPool) return globalForPool.__playbookPgPool

  const pool = new Pool(buildConfig(getDatabaseUrl()))

  // 池级错误必须有人监听，否则会以未捕获异常形式让进程崩溃。
  pool.on('error', (error) => {
    console.error('[db] 空闲连接出错：', error.message)
  })

  globalForPool.__playbookPgPool = pool
  return pool
}

/** 仅供脚本与测试在退出前释放连接；应用运行时不需要调用。 */
export async function closePool(): Promise<void> {
  const pool = globalForPool.__playbookPgPool
  if (!pool) return
  globalForPool.__playbookPgPool = undefined
  await pool.end()
}
