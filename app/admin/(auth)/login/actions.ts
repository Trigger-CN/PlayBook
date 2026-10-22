'use server'

import { redirect } from 'next/navigation'

import {
  consumeLoginToken,
  createLoginToken,
  isAllowedAdminEmail,
  isAdminConfigured,
  revokeCurrentAdminSession,
  safeAdminRedirect,
  setAdminSessionCookie,
  recordAudit,
} from '@/lib/auth/admin'
import { hasDatabaseUrl } from '@/lib/data'
import { checkRateLimit } from '@/lib/interactions/rate-limit'
import { hashValue } from '@/lib/interactions/server-context'

/**
 * 管理员登录 Server Actions（设计 16 §3、§6）。
 *
 * 为什么用 Server Action 而不是 GET 链接：
 * 设计要求「退出通过 POST/Server Action，不使用可被预取的 GET 链接」。
 * 登录请求同理 —— 用 Action 可以避免链接被邮件扫描器或预取而消耗令牌。
 */

export type LoginState = {
  status: 'idle' | 'sent' | 'error' | 'forbidden' | 'unavailable'
  message: string
  /** 仅在开发环境返回，便于本地验证流程；生产环境不返回。 */
  devLink?: string
}

/**
 * 请求登录链接。
 *
 * 无论邮箱是否在白名单，对外都返回同一句话 —— 否则这个接口就成了
 * 「某邮箱是否为管理员」的探测器（设计 06 §7 同源原则）。
 */
export async function requestLoginLink(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  if (!hasDatabaseUrl()) {
    return {
      status: 'unavailable',
      message: '后台需要数据库支持，请配置 DATABASE_URL。',
    }
  }
  if (!isAdminConfigured()) {
    return {
      status: 'unavailable',
      message: '尚未配置 ADMIN_EMAIL，后台暂不可用。',
    }
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 'error', message: '请输入有效的邮箱地址。' }
  }

  // 限流：同一邮箱 10 分钟内最多请求 3 次，防止被当成邮件轰炸工具。
  const limit = checkRateLimit(`admin-login:${hashValue(`email:${email}`)}`, 3, 10 * 60_000)
  if (!limit.allowed) {
    return {
      status: 'error',
      message: `请求过于频繁，请 ${limit.retryAfterSeconds} 秒后再试。`,
    }
  }

  const generic: LoginState = {
    status: 'sent',
    message: '如果该邮箱是管理员，登录链接已生成，15 分钟内有效。',
  }

  if (!isAllowedAdminEmail(email)) {
    // 非白名单：不做任何写入，但仍返回同样文案。
    return generic
  }

  try {
    const { token } = await createLoginToken(email, null)
    const link = `/admin/login/verify?token=${encodeURIComponent(token)}`

    // 本地开发没有邮件通道，把链接回显出来，否则无法完成登录。
    // 生产环境必须接入真实邮件发送，且绝不回显。
    if (process.env.NODE_ENV !== 'production') {
      return { ...generic, devLink: link }
    }
    return generic
  } catch {
    return { status: 'error', message: '生成登录链接失败，请稍后再试。' }
  }
}

/**
 * 退出登录。刻意做成 Server Action 而非 GET 链接，
 * 避免被浏览器预取或第三方页面用 <img> 触发。
 */
export async function logout(): Promise<void> {
  await revokeCurrentAdminSession()
  redirect('/admin/login')
}

/**
 * 兑换登录令牌并建立会话。
 *
 * 由 `/admin/login/verify/route.ts`（Route Handler）调用 —— 必须是
 * Route Handler 或 Server Action，因为要写会话 cookie。返回值是应跳转的
 * 同源后台路径（失败时带 `?error=`）。
 *
 * 注意：consumeLoginToken 已经把令牌消耗掉；如果写 cookie 这一步失败，
 * 令牌就白花了 —— 人得重新请求一封登录邮件。这是有意的取舍：把一次性
 * 语义交给数据库单语句完成，换取并发下不会双花。
 */
export async function completeLogin(token: string, next: string | null): Promise<string> {
  if (!hasDatabaseUrl()) return '/admin/login?error=unavailable'

  const result = await consumeLoginToken(token)
  if (!result) return '/admin/login?error=invalid'

  await setAdminSessionCookie(result.sessionToken)
  await recordAudit({
    actorEmail: result.email,
    action: 'admin_login',
  }).catch(() => {})

  return safeAdminRedirect(next)
}
