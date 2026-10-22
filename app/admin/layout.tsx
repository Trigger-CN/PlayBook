import type { Metadata } from 'next'

/**
 * 后台根布局：**只放元信息，不做任何鉴权**。
 *
 * ## 为什么鉴权必须下沉到 `(protected)/layout.tsx`
 *
 * 这里曾经直接调用 `requireAdmin()`，未登录就 `redirect('/admin/login')`。
 * 但 `/admin/login` 本身也在这个布局之下，于是：
 *
 *     GET /admin/login  →  307 /admin/login?next=/admin  →  307 …（无限循环）
 *
 * 登录页被自己的守卫挡在门外，**后台根本登不进去**。这个缺陷长期没有暴露，
 * 是因为早先的后台验证都直接往 `admin_sessions` 写会话行、带 cookie 请求，
 * 从来没有真正走过登录页；而 `middleware.ts` 里已经为登录路径开了白名单，
 * 更让人以为这一层也处理过了。
 *
 * 现在按 Next.js 的路由组把两类页面分开（URL 完全不变）：
 *
 * - `(protected)/` —— 需要会话的后台页面，守卫在其 layout 里；
 * - `(auth)/`      —— 登录与令牌兑换，必须匿名可达。
 *
 * 这一层只保留两件对所有后台页面都成立的事：`noindex,nofollow` 与
 * `force-dynamic`（后台内容随时变化，且绝不能进静态产物）。
 */
export const metadata: Metadata = {
  title: { default: '后台', template: '%s · 后台' },
  robots: { index: false, follow: false },
}

// 后台全部为 Dynamic：登录页要读会话、受保护页要读会话与数据库。
export const dynamic = 'force-dynamic'

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
