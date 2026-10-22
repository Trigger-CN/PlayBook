import Link from 'next/link'

import { Icon } from '@/components/ui/icon'
import { primaryNav, siteConfig } from '@/config/site'

/** 站点页脚（设计 module 02 §3.2）：版权、导航补充与社交链接。 */
export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="flex flex-wrap items-center justify-between gap-5 pt-10 text-xs font-semibold text-[var(--muted)]">
      <span>
        © {year} {siteConfig.name} · 用心按下每一次更新
      </span>
      <span className="flex flex-wrap items-center gap-3">
        {primaryNav
          .filter((item) => item.href !== '/')
          .map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-[var(--ink)]">
              {item.label}
            </Link>
          ))}
        {siteConfig.socialLinks.map((link) =>
          link.external ? (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--ink)]"
            >
              {link.label} <Icon name="north_east" size={11} />
            </a>
          ) : (
            <Link key={link.href} href={link.href} className="hover:text-[var(--ink)]">
              {link.label}
            </Link>
          ),
        )}
      </span>
    </footer>
  )
}
