'use client'

import Link from 'next/link'

/**
 * 路由级错误边界（设计 module 13 §6.3）。
 * 不向客户端展示堆栈、SQL 或密钥，只提供重试与安全返回。
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center py-16">
      <div className="max-w-[520px] text-center">
        <h1 className="font-display text-2xl">页面暂时无法显示</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          服务出现了一点问题，你可以重试，或先返回其他页面。
          {error.digest ? `（请求编号：${error.digest}）` : ''}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="toy-button toy-button--small">
            <span className="toy-button__top">重试</span>
          </button>
          <Link href="/" className="toy-button toy-button--small toy-button--cream">
            <span className="toy-button__top">回到首页</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
