import 'server-only'

import { randomBytes, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

import { hashValue } from '@/lib/interactions/server-context'
import { query, queryOne } from '@/lib/db/query'

/**
 * 管理员认证（自建库过渡实现，设计 08 §3 / 16 §3）。
 *
 * 安全约定（逐条对应设计文档）：
 * - 不自建密码存储：登录走「邮箱 → 一次性令牌链接」，与魔法链接等价。
 * - 令牌与会话只存哈希，不存明文。
 * - 会话在服务端校验；`requireAdmin()` 供页面、Server Action、Route Handler 统一调用。
 * - 白名单来自环境变量 ADMIN_EMAIL，不写死在数据库。
 * - 重定向只允许同源白名单后台路径，防开放重定向。
 *
 * 将来切 Supabase Auth 时，只需替换本文件与登录页，页面调用 requireAdmin() 的方式不变。
 */

export const ADMIN_SESSION_COOKIE = 'playbook-admin'

/** 会话有效期 7 天；令牌有效期 15 分钟。 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TOKEN_TTL_MS = 15 * 60 * 1000

export type AdminIdentity = {
  email: string
}

function adminAllowlist(): string[] {
  const raw = process.env.ADMIN_EMAIL ?? ''
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
}

/**
 * 是否配置了管理员白名单。
 * 未配置时后台整体不可用 —— 这比「默认放行」安全：
 * 忘记配置环境变量不应该导致任何人都能进后台。
 */
export function isAdminConfigured(): boolean {
  return adminAllowlist().length > 0
}

export function isAllowedAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (normalized.length === 0) return false
  return adminAllowlist().includes(normalized)
}

function generateSecret(): string {
  // 32 字节随机数，base64url 后长度 43，符合 admin_*_hash_check 的长度要求。
  return randomBytes(32).toString('base64url')
}

/** 恒定时间比较，避免通过响应时间推测令牌。 */
function safeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8')
  const b = Buffer.from(right, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// 登录令牌
// ---------------------------------------------------------------------------

/**
 * 创建一次性登录令牌，返回明文令牌（只在这一次返回，之后只存哈希）。
 * 调用方负责把明文拼进链接并「发送」出去。
 */
export async function createLoginToken(
  email: string,
  ipHash: string | null,
): Promise<{ token: string; expiresAt: string }> {
  const token = generateSecret()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await query(
    `insert into public.admin_login_tokens (email, token_hash, expires_at, ip_hash)
     values ($1, $2, $3, $4)`,
    [email.trim().toLowerCase(), hashValue(`admin-token:${token}`), expiresAt.toISOString(), ipHash],
  )

  return { token, expiresAt: expiresAt.toISOString() }
}

/**
 * 兑换令牌，成功则创建会话并返回会话明文令牌。
 * 失败返回 null（不区分「不存在」「已用过」「已过期」，避免泄漏状态）。
 */
export async function consumeLoginToken(
  token: string,
): Promise<{ email: string; sessionToken: string } | null> {
  const tokenHash = hashValue(`admin-token:${token}`)

  // 用「未使用且未过期」作为条件更新，把一次性语义交给数据库，避免并发双花。
  const row = await queryOne<{ email: string }>(
    `update public.admin_login_tokens
        set used_at = now()
      where token_hash = $1
        and used_at is null
        and expires_at > now()
      returning email`,
    [tokenHash],
  )
  if (!row) return null

  // 兑换后再校验白名单：即使令牌泄露，非管理员邮箱也拿不到会话。
  if (!isAllowedAdminEmail(row.email)) return null

  const sessionToken = generateSecret()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await query(
    `insert into public.admin_sessions (email, token_hash, expires_at)
     values ($1, $2, $3)`,
    [row.email, hashValue(`admin-session:${sessionToken}`), expiresAt.toISOString()],
  )

  return { email: row.email, sessionToken }
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------

/** 写入会话 cookie。httpOnly，生产环境 secure。 */
export async function setAdminSessionCookie(sessionToken: string): Promise<void> {
  const store = await cookies()
  store.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: process.env.NODE_ENV === 'production',
  })
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(ADMIN_SESSION_COOKIE)
}

/**
 * 读取当前管理员身份。未登录、会话过期/撤销、邮箱不在白名单时返回 null。
 * 注意：这里读 cookie，因此所有调用它的路由必然是 Dynamic ——
 * 后台本来就是 Dynamic，这与公开内容页的 SSG 目标不冲突。
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  if (!isAdminConfigured()) return null

  const store = await cookies()
  const token = store.get(ADMIN_SESSION_COOKIE)?.value
  if (!token) return null

  const tokenHash = hashValue(`admin-session:${token}`)
  const row = await queryOne<{ email: string; token_hash: string }>(
    `select email, token_hash
       from public.admin_sessions
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
      limit 1`,
    [tokenHash],
  )
  if (!row) return null

  // 恒定时间比较，避免哈希比较本身成为旁路。
  if (!safeEqualHex(row.token_hash, tokenHash)) return null

  // 白名单可能在会话有效期内被改（例如撤销某个管理员）。
  if (!isAllowedAdminEmail(row.email)) return null

  // 轻量更新 last_seen_at；失败不影响鉴权结果。
  void query(`update public.admin_sessions set last_seen_at = now() where token_hash = $1`, [
    tokenHash,
  ]).catch(() => {})

  return { email: row.email }
}

/** 撤销当前会话。 */
export async function revokeCurrentAdminSession(): Promise<void> {
  const store = await cookies()
  const token = store.get(ADMIN_SESSION_COOKIE)?.value
  if (token) {
    await query(`update public.admin_sessions set revoked_at = now() where token_hash = $1`, [
      hashValue(`admin-session:${token}`),
    ]).catch(() => {})
  }
  await clearAdminSessionCookie()
}

/**
 * 后台页面/接口的统一守卫。
 * 未登录或非管理员时返回 null，由调用方决定跳转还是 403。
 */
export async function requireAdmin(): Promise<AdminIdentity | null> {
  return getAdminIdentity()
}

// ---------------------------------------------------------------------------
// 重定向安全（设计 16 §3.2）
// ---------------------------------------------------------------------------

/**
 * 校验回跳路径：必须是同源后台路径。
 * 拒绝 //evil.com、http://…、/admin/../etc 这类值，非法时回退 /admin。
 */
export function safeAdminRedirect(next: string | null | undefined): string {
  if (!next) return '/admin'
  if (!next.startsWith('/admin')) return '/admin'
  // 拒绝协议相对 URL（//host）与反斜杠变体。
  if (next.startsWith('//') || next.includes('\\')) return '/admin'
  // 拒绝路径穿越。
  if (next.split('/').includes('..')) return '/admin'
  return next
}

// ---------------------------------------------------------------------------
// 审计
// ---------------------------------------------------------------------------

export async function recordAudit(input: {
  actorEmail: string
  action: string
  targetType?: string | null
  targetId?: string | null
  detail?: Record<string, unknown> | null
}): Promise<void> {
  await query(
    `insert into public.admin_audit_log (actor_email, action, target_type, target_id, detail)
     values ($1, $2, $3, $4, $5)`,
    [
      input.actorEmail,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.detail ? JSON.stringify(input.detail) : null,
    ],
  )
}
