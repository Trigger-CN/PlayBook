import type { Metadata } from 'next'

import { safeAdminRedirect } from '@/lib/auth/admin'

import { LoginForm } from './login-form'

/**
 * 登录页（设计 16）。
 *
 * 独立布局，不渲染后台外壳，也不展示任何后台信息或统计。
 * noindex,nofollow；robots 另外禁止抓取 /admin。
 *
 * 回跳地址在这里先过一道 safeAdminRedirect：即便 `?next=` 被手动改成
 * `//evil.com` 或 `https://evil.com`，落到表单里的也只是 /admin。
 * 服务端 Action 收到后仍会再校验一次 —— 这一层只保证「表单里没有脏数据」。
 */
export const metadata: Metadata = {
  title: '管理员登录',
  robots: { index: false, follow: false },
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  const rawNext = params.next
  const next = safeAdminRedirect(typeof rawNext === 'string' ? rawNext : null)

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-[7px] text-xs font-extrabold"
            style={{ background: 'var(--cream)', color: 'var(--on-accent)' }}
          >
            ADMIN / PLAYBOOK
          </span>
        </div>

        <div
          className="rounded-[26px] border p-6"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          <h1 className="font-display text-2xl">管理员登录</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            用管理员邮箱与部署口令登录。口令只在服务端校验，数据库不保存它。
          </p>

          <LoginForm next={next} />
        </div>

        <ul className="mt-5 grid gap-1.5 text-xs leading-relaxed text-[var(--muted)]">
          <li>· 只有管理员邮箱名单内的账号可以登录。</li>
          <li>· 连续失败会被临时限流，稍后再试即可。</li>
          <li>· 会话 7 天有效，可随时从后台退出。</li>
        </ul>
      </div>
    </main>
  )
}
