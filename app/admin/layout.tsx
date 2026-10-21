import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { requireAdmin, isAdminConfigured } from '@/lib/auth/admin'
import { hasDatabaseUrl } from '@/lib/data'

import { AdminNav } from './admin-nav'
import { logout } from './login/actions'

/**
 * 后台受保护外壳（设计 08 §2、§6）。
 *
 * 守卫位置：这个 layout 是 Server Component，在渲染任何后台内容之前
 * 调用 requireAdmin()。未登录直接 redirect，非管理员返回 403 文案，
 * 都不渲染后台框架 —— 避免「先闪现后台再跳走」。
 *
 * 注意 middleware 只做快速会话存在性检查（可省），真正的授权在这里
 * 以及每个 Server Action 里各做一次，不依赖 UI 隐藏。
 */
export const metadata: Metadata = {
  title: { default: '后台', template: '%s · 后台' },
  robots: { index: false, follow: false },
}

// 后台全部为 Dynamic：需要读会话 cookie，且内容随时变化。
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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
