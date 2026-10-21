'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * 后台导航（设计 08 §3.4）。
 *
 * 当前项用 aria-current="page"。抽屉与账户菜单尚未实现 ——
 * 移动端这里退化为可换行的横向列表，而不是假装有抽屉：
 * 一个能用的简单导航，好过一个没做完的抽屉（后者会有焦点陷阱、
 * 滚动锁定等一堆需要正确处理的状态）。
 */

const NAV_ITEMS = [
  { href: '/admin', label: '概览' },
  { href: '/admin/comments', label: '评论' },
  { href: '/admin/timeline', label: '时间轴' },
] as const

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="后台导航">
      <ul className="flex flex-wrap gap-1.5 lg:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="block rounded-xl px-3 py-2 text-sm font-bold"
                style={{
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--muted)',
                  border: `1px solid ${active ? 'var(--line)' : 'transparent'}`,
                }}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
