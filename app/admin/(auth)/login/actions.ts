'use server'

import { redirect } from 'next/navigation'

import {
  createAdminSession,
  isAdminConfigured,
  recordAudit,
  revokeCurrentAdminSession,
  safeAdminRedirect,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from '@/lib/auth/admin'
import { hasDatabaseUrl } from '@/lib/data'
import { checkRateLimit } from '@/lib/interactions/rate-limit'
import { hashValue } from '@/lib/interactions/server-context'

/**
 * 管理员登录 Server Actions（设计 16 §3、§6）。
 *
 * 为什么登录是 Server Action 而不是 GET 链接：口令不能进 URL（会留在
 * 浏览历史、Referer 与访问日志里）。Action 提交的是 POST body。
 *
 * 为什么退出也是 Server Action：设计要求「退出通过 POST/Server Action，
 * 不使用可被预取的 GET 链接」—— 被预取就等于被执行。
 */

export type LoginState = {
  status: 'idle' | 'error' | 'unavailable'
  message: string
}

/**
 * 失败文案只有一句。
 *
 * 「邮箱不在名单」与「口令不对」共用同一句话，否则这个接口就成了
 * 「某邮箱是否为管理员」的探测器。
 */
const DENIED_MESSAGE = '邮箱或口令不正确。'

/** 失败限流：同一邮箱 5 分钟内最多 5 次，压住在线猜测。 */
const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 5 * 60_000

export async function login(_prev: LoginState | null, formData: FormData): Promise<LoginState> {
  if (!hasDatabaseUrl()) {
    return {
      status: 'unavailable',
      message: '后台需要数据库支持，请配置 DATABASE_URL。',
    }
  }
  if (!isAdminConfigured()) {
    return {
      status: 'unavailable',
      message: '后台未完成配置：需要同时设置 ADMIN_EMAIL 与 INTERACTION_HASH_SALT。',
    }
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = formData.get('next')

  if (email.length === 0 || password.length === 0) {
    return { status: 'error', message: DENIED_MESSAGE }
  }

  // 限流键只放邮箱哈希：内存 Map 里没必要留原始邮箱。
  const limit = checkRateLimit(
    `admin-login:${hashValue(`email:${email}`)}`,
    MAX_ATTEMPTS,
    ATTEMPT_WINDOW_MS,
  )
  if (!limit.allowed) {
    return {
      status: 'error',
      message: `尝试过于频繁，请 ${limit.retryAfterSeconds} 秒后再试。`,
    }
  }

  const result = verifyAdminCredentials(email, password)
  if (!result.ok) {
    return { status: 'error', message: DENIED_MESSAGE }
  }

  const sessionToken = await createAdminSession(result.email)
  await setAdminSessionCookie(sessionToken)
  await recordAudit({ actorEmail: result.email, action: 'admin_login' }).catch(() => {})

  // redirect 会抛 NEXT_REDIRECT，因此必须在任何 try/catch 之外调用。
  redirect(safeAdminRedirect(typeof next === 'string' ? next : null))
}

/**
 * 退出登录。刻意做成 Server Action 而非 GET 链接，
 * 避免被浏览器预取或第三方页面用 <img> 触发。
 */
export async function logout(): Promise<void> {
  await revokeCurrentAdminSession()
  redirect('/admin/login')
}
