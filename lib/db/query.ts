import 'server-only'

import type { PoolClient, QueryResultRow } from 'pg'

import { getPool } from './pool'

/**
 * 查询助手。
 *
 * 约定：
 * - 只接受参数化 SQL，禁止把外部输入拼进字符串。
 * - 返回领域层可直接消费的行数组，不把 pg 的 result 对象泄漏出去。
 * - 错误统一包装成带上下文的 Error，便于日志定位，但不把连接串写进消息。
 */

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  try {
    const result = await getPool().query<T>(sql, params as unknown[])
    return result.rows
  } catch (error) {
    // 注意：不打印 sql 全文与参数，避免把访客标识或哈希写进日志。
    throw new Error(`[db] 查询失败：${describeError(error)}`)
  }
}

/** 只取第一行；没有结果返回 null。 */
export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

/**
 * 事务助手。回调内所有语句使用同一个 client，
 * 任一语句抛错即回滚，成功则提交。
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // 回滚失败时保留原始错误，不覆盖它。
    }
    throw new Error(`[db] 事务失败：${describeError(error)}`)
  } finally {
    client.release()
  }
}

/** 健康检查：用于启动自检与 /api/health。 */
export async function checkDatabaseHealth(): Promise<{
  ok: boolean
  latencyMs: number
  error?: string
}> {
  const startedAt = Date.now()
  try {
    await query('select 1 as ok')
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: describeError(error) }
  }
}
