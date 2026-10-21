import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ToyButton } from '@/components/ui/toy-button'

import { completeLogin } from '../actions'

/**
 * 令牌兑换页（设计 16 §3）。
 *
 * 这是一个 Server Component，在服务端完成兑换并 redirect。
 * 为什么不做成客户端 fetch：令牌不应出现在客户端 JS 的请求体里，
 * 也不该留在浏览器历史中可被脚本重复读取；服务端直接兑换最干净。
 *
 * 注意：本页读取 searchParams，因此是 Dynamic —— 这是登录流程的必然，
 * 与公开内容页的 SSG 目标无关。
 */
export const metadata: Metadata = {
  title: '正在登录',
  robots: { index: false, follow: false },
}

type Props = {
  searchParams: Promise<{ token?: string; next?: string }>
}

export default async function VerifyLoginPage({ searchParams }: Props) {
  const { token, next } = await searchParams

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center px-4 py-10">
        <div className="w-full max-w-[420px] text-center">
          <h1 className="font-display text-2xl">登录链接无效</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            链接缺少令牌，可能被截断。请重新请求一封登录邮件。
          </p>
          <div className="mt-5">
            <ToyButton href="/admin/login" size="small">
              重新登录
            </ToyButton>
          </div>
        </div>
      </main>
    )
  }

  const target = await completeLogin(token, next ?? null)

  // 兑换失败时回到登录页并带上错误码；不区分「不存在/已用/过期」。
  if (target.startsWith('/admin/login?error=')) redirect(target)

  redirect(target)
}
