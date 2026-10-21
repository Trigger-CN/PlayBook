import type { Metadata } from 'next'

import { LoginForm } from './login-form'

/**
 * 登录页（设计 16）。
 *
 * 独立布局，不渲染后台外壳，也不展示任何后台信息或统计。
 * noindex,nofollow；robots 另外禁止抓取 /admin。
 */
export const metadata: Metadata = {
  title: '管理员登录',
  robots: { index: false, follow: false },
}

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-[7px] text-xs font-extrabold"
            style={{ background: 'var(--cream)', color: '#4a2d11' }}
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
            输入管理员邮箱获取一次性登录链接。本站不保存密码。
          </p>

          <LoginForm />
        </div>

        <ul className="mt-5 grid gap-1.5 text-xs leading-relaxed text-[var(--muted)]">
          <li>· 登录链接 15 分钟内有效，且只能使用一次。</li>
          <li>· 只有 ADMIN_EMAIL 白名单内的邮箱可以获得会话。</li>
          <li>· 未授权访问不会透露后台内容。</li>
        </ul>
      </div>
    </main>
  )
}
