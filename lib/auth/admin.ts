import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

import { hashValue } from '@/lib/interactions/server-context'
import { query, queryOne } from '@/lib/db/query'

/**
 * 管理员认证（邮箱 + 环境变量口令，设计 08 §3 / 16 §3）。
 *
 * ## 口令为什么不落库
 *
 * 账号来自 env 的 ADMIN_EMAIL，口令来自 env 的 INTERACTION_HASH_SALT，
 * 服务端每次登录现算现比。数据库里既没有口令也没有口令哈希，因此「拖库」
 * 这条路径根本不产出可用凭据 —— 这比「存哈希再校验」更强，也顺带满足了
 * 设计里「不自建密码存储」的原始约束。
 *
 * 代价必须说清：改口令 = 改环境变量 + 重启；没有「找回口令」，也没有按时
 * 轮换的机制。单人后台这样取舍是可接受的，多人场景应换成真正的身份提供方。
 *
 * ## 其余约定
 *
 * - 会话只存哈希，可单独撤销；`requireAdmin()` 供页面、Server Action、
 *   Route Handler 统一调用。
 * - 登录失败不区分「邮箱不在名单」与「口令错误」，避免把登录接口变成
 *   账号探测器。
 * - 重定向只允许同源白名单后台路径，防开放重定向。
 */

export const ADMIN_SESSION_COOKIE = 'playbook-admin'

/** 会话有效期 7 天。 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
 * 管理员口令。
 *
 * 复用互动哈希盐而不是再引入一个必填变量：部署里少一个可能漏配的地方。
 * 该值为空时后台整体关闭 —— 绝不允许「口令为空即放行」。
 */
function adminPassword(): string {
  return (process.env.INTERACTION_HASH_SALT ?? '').trim()
}

/**
 * 后台是否可用：需要同时具备账号与口令。
 * 缺任何一个都整体关闭，这比「默认放行」安全：
 * 忘记配置环境变量不应该导致任何人都能进后台。
 */
export function isAdminConfigured(): boolean {
  return adminAllowlist().length > 0 && adminPassword().length > 0
}

export function isAllowedAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (normalized.length === 0) return false
  return adminAllowlist().includes(normalized)
}

/** 把任意长度输入压成定长摘要，使比较与输入长度无关。 */
function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** 恒定时间比较：两侧都先过摘要，长度恒为 32 字节，timingSafeEqual 不会抛。 */
function safeEqualSecret(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right))
}

// ---------------------------------------------------------------------------
// 口令校验
// ---------------------------------------------------------------------------

export type CredentialCheck =
  | { ok: true; email: string }
  | { ok: false; reason: 'unavailable' | 'denied' }

/**
 * 校验账号口令。
 *
 * 两项判断都算完再合并，不因「邮箱不在名单」提前返回 —— 提前返回会让
 * 响应时间变成「该邮箱是否为管理员」的旁路。
 */
export function verifyAdminCredentials(email: string, password: string): CredentialCheck {
  if (!isAdminConfigured()) return { ok: false, reason: 'unavailable' }

  const normalized = email.trim().toLowerCase()
  const emailMatches = isAllowedAdminEmail(normalized)
  const passwordMatches = safeEqualSecret(password, adminPassword())

  if (emailMatches && passwordMatches) return { ok: true, email: normalized }
  return { ok: false, reason: 'denied' }
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------

/** 建立会话，返回写入 cookie 用的明文令牌（库中只存哈希）。 */
export async function createAdminSession(email: string): Promise<string> {
  const sessionToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await query(
    `insert into public.admin_sessions (email, token_hash, expires_at)
     values ($1, $2, $3)`,
    [email, hashValue(`admin-session:${sessionToken}`), expiresAt.toISOString()],
  )

  return sessionToken
}

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
  if (!safeEqualSecret(row.token_hash, tokenHash)) return null

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
