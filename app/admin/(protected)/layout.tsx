import Link from 'next/link'
import { redirect } from 'next/navigation'

import { requireAdmin, isAdminConfigured } from '@/lib/auth/admin'
import { hasDatabaseUrl } from '@/lib/data'

import { AdminNav } from './admin-nav'
import { logout } from '../(auth)/login/actions'

/**
 * 后台受保护外壳（设计 08 §2、§6）。
 *
 * ## 守卫放这里，而不是 `app/admin/layout.tsx`
 *
 * 这个 layout 只覆盖路由组 `(protected)` —— 也就是真正需要会话的后台页面。
 * 登录页与令牌兑换页在旁边的 `(auth)` 组里，**不受这里约束**。
 *
 * 早期版本把 requireAdmin() 放在 `app/admin/layout.tsx`，结果把 `/admin/login`
 * 也一起挡住了：未登录访问登录页会被重定向到登录页自己，形成无限循环，
 * 后台无法进入。路由组把「需要登录的」与「登录用的」分开，是这件事的正确
 * 结构 —— 不靠白名单字符串去排除，而是让守卫在物理上只覆盖该覆盖的路由。
 *
 * 三分支都不渲染后台框架，避免「先闪现后台再跳走」：
 * 1. 没有数据库 → 后台整体不可用；
 * 2. 没有 ADMIN_EMAIL 白名单 → 后台整体关闭（安全默认值）；
 * 3. 未登录 / 会话无效 → 跳登录页并带上 next。
 *
 * middleware 只做快速会话存在性检查（可省），真正的授权在这里以及每个
 * Server Action 里各做一次，不依赖 UI 隐藏。
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!hasDatabaseUrl()) {
    return (
      <main className="mx-auto max-w-[560px] px-4 py-16">
        <h1 className="font-display text-2xl">后台暂不可用</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          后台依赖数据库。请配置 DATABASE_URL 后重启服务。
        </p>
        <div className="mt-5">
          <Link href="/" className="text-sm font-bold underline">
            返回站点
          </Link>
        </div>
      </main>
    )
  }

  if (!isAdminConfigured()) {
    return (
      <main className="mx-auto max-w-[560px] px-4 py-16">
        <h1 className="font-display text-2xl">后台未配置</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          需要设置 ADMIN_EMAIL 环境变量（可用逗号分隔多个管理员邮箱）。
          未配置时后台整体关闭，这是刻意的安全默认值。
        </p>
        <div className="mt-5">
          <Link href="/" className="text-sm font-bold underline">
            返回站点
          </Link>
        </div>
      </main>
    )
  }

  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin')

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <div className="mx-auto grid max-w-[1180px] gap-6 px-4 py-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <Link href="/admin" className="font-display text-lg">
              后台
            </Link>
            <Link href="/" className="text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)]">
              查看站点 ↗
            </Link>
          </div>

          <AdminNav />

          <div
            className="mt-5 rounded-xl border px-3 py-2.5 text-xs"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <p className="font-bold text-[var(--muted)]">当前管理员</p>
            <p className="mt-1 truncate">{identity.email}</p>
            <form action={logout} className="mt-2">
              <button
                type="submit"
                className="text-xs font-bold underline hover:text-[var(--ink)]"
              >
                退出登录
              </button>
            </form>
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
