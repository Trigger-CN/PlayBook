import Link from 'next/link'

/**
 * 全站 404。保持最小可用导航，不泄漏内部信息（设计 module 02 §4）。
 */
export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center py-16">
      <div className="max-w-[520px] text-center">
        <p className="font-display text-[64px] leading-none">404</p>
        <h1 className="mt-3 font-display text-2xl">这个页面不存在</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          链接可能已经失效，或者内容尚未发布。可以回到首页或浏览全部文章。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="toy-button toy-button--small">
            <span className="toy-button__top">回到首页</span>
          </Link>
          <Link href="/posts" className="toy-button toy-button--small toy-button--cream">
            <span className="toy-button__top">浏览文章</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
