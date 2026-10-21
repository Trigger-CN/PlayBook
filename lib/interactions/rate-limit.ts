import 'server-only'

/**
 * 极简内存限流（设计 module 06 §7、07 §7）。
 *
 * 为什么是内存而不是 Redis：当前是单实例自建部署，内存限流足以挡住
 * 脚本刷评论这类常见滥用；换成多实例时把这里替换成 Redis 实现即可，
 * 调用方契约不变。
 *
 * 已知局限（必须明说，不假装是完整方案）：
 * - 进程重启后计数清零。
 * - 多实例部署时各实例独立计数，实际阈值被放大。
 * - 因此它是「降低滥用成本」而非「安全边界」，真正的边界是数据库唯一约束
 *   与服务端强制的 status='pending'。
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** 避免长期运行后 Map 无界增长：每次检查时顺带清理过期桶。 */
function sweep(now: number): void {
  if (buckets.size < 500) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }

/**
 * 滑动窗口限流。
 * @param key 限流维度（例如 `comment:${ipHash}`）
 * @param limit 窗口内允许的次数
 * @param windowMs 窗口长度
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

/** 仅供测试与本地排查使用。 */
export function resetRateLimits(): void {
  buckets.clear()
}
