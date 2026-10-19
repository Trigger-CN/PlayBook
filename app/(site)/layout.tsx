import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

/** 公开站点外壳（设计 08 / module 02）：Header + main + Footer 的稳定容器。 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="absolute left-[-9999px] z-50 rounded-br-xl px-4 py-2 font-extrabold text-white focus:left-0"
        style={{ background: 'var(--coral)' }}
      >
        跳到主内容
      </a>
      <main id="main-content" className="page-shell">
        <SiteHeader />
        {children}
        <SiteFooter />
      </main>
    </>
  )
}
