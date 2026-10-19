'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { isNavItemActive, primaryNav } from '@/config/site'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'

/**
 * 主导航（设计 module 02 §3.1）。
 * 整站仅此一处读取 pathname，Header 其余部分保持 Server Component。
 */
export function SiteNav() {
  const pathname = usePathname() ?? '/'

  return (
    <nav className="flex items-center gap-[18px] text-sm font-bold" aria-label="主导航">
      {primaryNav.map((item) => {
        const active = isNavItemActive(item, pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'hidden text-[var(--muted)] hover:text-[var(--ink)] sm:inline',
              active && 'text-[var(--ink)] underline decoration-[var(--coral)] decoration-[3px] underline-offset-[6px]',
            )}
          >
            {item.label}
          </Link>
        )
      })}
      <ThemeToggle />
    </nav>
  )
}
