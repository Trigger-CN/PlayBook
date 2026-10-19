import Link from 'next/link'

import { SiteNav } from '@/components/site/site-nav'
import { siteConfig } from '@/config/site'

/** 品牌标记 + 名称（设计 module 02 §3.1）。 */
export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-5 pb-6 pt-7">
      <Link
        href="/"
        className="inline-flex items-center gap-[11px] font-display text-2xl font-bold"
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-[12px]"
          style={{
            background: 'var(--coral)',
            boxShadow: '0 6px 0 var(--coral-base)',
            transform: 'rotate(-7deg)',
          }}
        >
          <span
            className="block h-[15px] w-[15px] rounded-full border-[3px]"
            style={{ borderColor: 'var(--ink)' }}
          />
        </span>
        {siteConfig.name}
      </Link>
      <SiteNav />
    </header>
  )
}
