import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { cookies } from 'next/headers'

/**
 * 访客标识与请求元信息（设计 module 07 §2、08 §4/§9）。
 *
 * 安全约定：
 * - visitor_id 是随机不可推断标识，存 httpOnly cookie，服务端仍当不可信输入校验格式。
 * - 不存明文 IP：只存加盐哈希。
 * - 盐来自服务端环境变量；未配置时退化为「进程内随机盐」，
 *   此时哈希只在本进程生命周期内可比，仍不泄漏原始值。
 */

export const VISITOR_COOKIE = 'playbook-visitor'

/** 一年。访客标识长期有效，否则每次访问都算新访客，点赞会被绕过。 */
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** 与 likes_visitor_id_check 的 `char_length between 8 and 128` 对齐。 */
const VISITOR_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

let fallbackSalt: string | null = null

function hashSalt(): string {
  const configured = process.env.INTERACTION_HASH_SALT
  if (typeof configured === 'string' && configured.trim().length > 0) return configured.trim()
  // 没有配置时用进程内随机盐：不持久，但绝不使用硬编码常量冒充安全。
  if (fallbackSalt === null) fallbackSalt = randomUUID()
  return fallbackSalt
}

/** 对敏感值做加盐 SHA-256，只用于去重与防刷，不可逆。 */
export function hashValue(value: string): string {
  return createHash('sha256').update(hashSalt()).update(value).digest('hex')
}

export function isValidVisitorId(value: unknown): value is string {
  return typeof value === 'string' && VISITOR_PATTERN.test(value)
}

/**
 * 读取访客标识。不存在或格式非法时返回 null —— 不在这里写入 cookie，
 * 因为 Route Handler 之外的 Server Component 无法写 cookie（Next.js 限制）。
 */
export async function readVisitorId(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(VISITOR_COOKIE)?.value
  return isValidVisitorId(value) ? value : null
}

/**
 * 读取或创建访客标识，仅在 Route Handler 中调用（可写 cookie）。
 * 返回 { visitorId, created }，created 为 true 时需要调用方下发 cookie。
 */
export async function ensureVisitorId(): Promise<{ visitorId: string; created: boolean }> {
  const store = await cookies()
  const existing = store.get(VISITOR_COOKIE)?.value
  if (isValidVisitorId(existing)) return { visitorId: existing, created: false }

  const visitorId = randomUUID().replace(/-/g, '')
  store.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  })
  return { visitorId, created: true }
}

/**
 * 从请求头提取用于防刷的哈希与来源信息。
 * 客户端不可提交这些字段（module 08 §6）。
 */
export function requestFingerprint(headers: Headers): {
  ipHash: string | null
  userAgentHash: string | null
  referrer: string | null
} {
  // 生产环境由反向代理注入；取第一个值，忽略客户端可伪造的链式串。
  const forwarded = headers.get('x-forwarded-for') ?? ''
  const ip = forwarded.split(',')[0]?.trim() || headers.get('x-real-ip') || ''
  const userAgent = headers.get('user-agent') ?? ''

  return {
    ipHash: ip ? hashValue(`ip:${ip}`) : null,
    userAgentHash: userAgent ? hashValue(`ua:${userAgent}`) : null,
    // 只保留 origin，避免把含敏感 query 的完整 URL 入库（module 08 §5）。
    referrer: normalizeReferrer(headers.get('referer')),
  }
}

function normalizeReferrer(raw: string | null): string | null {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}
