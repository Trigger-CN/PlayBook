import type { IconName } from '@/components/ui/icon'

/** 站点身份与导航配置（设计 module 02 / 决策 D-09）。 */

export type SiteConfig = {
  name: string
  title: string
  description: string
  author: string
  bio: string
  url: string
  socialLinks: Array<{ label: string; href: string; external: boolean }>
}

/** 主导航保持少而稳定：首页 / 文章 / 时间轴 / 关于。 */
export type PrimaryNavItem = {
  label: string
  href: string
  /** 详情页归属栏目的匹配前缀，用于 aria-current。 */
  match: string
}

export type QuickLink = {
  title: string
  href: string
  /** Material Symbols 图标名（内联 SVG，见 components/ui/icon.tsx）。 */
  icon: IconName
  description?: string
  order: number
  external: boolean
  enabled: boolean
}

export const siteConfig: SiteConfig = {
  name: 'Playbook',
  title: 'Playbook · 个人内容站',
  description: '一个面向长期写作、思考与互动的个人内容站，用扁平卡通矢量语言记录内容与时间。',
  author: 'Lin',
  bio: '前端工程师，业余设计师。白天写代码，晚上把想法压进这只数字玩具盒。',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  socialLinks: [
    { label: 'GitHub', href: 'https://github.com', external: true },
    { label: 'RSS', href: '/feed.xml', external: false },
  ],
}

export const primaryNav: PrimaryNavItem[] = [
  { label: '首页', href: '/', match: '/' },
  { label: '文章', href: '/posts', match: '/posts' },
  { label: '时间轴', href: '/timeline', match: '/timeline' },
  { label: '关于', href: '/about', match: '/about' },
]

/** 快捷入口按 order 排序，只渲染 enabled 项（设计 module 02 §3.3）。 */
export const quickLinks: QuickLink[] = [
  { title: '文章', href: '/posts', icon: 'article', description: '最近写作', order: 10, external: false, enabled: true },
  { title: '时间轴', href: '/timeline', icon: 'timeline', description: '生活记录', order: 20, external: false, enabled: true },
  { title: '统计', href: '/stats', icon: 'insights', description: '站点活跃', order: 30, external: false, enabled: true },
  { title: '关于我', href: '/about', icon: 'person', description: '一点自述', order: 40, external: false, enabled: true },
  { title: 'GitHub', href: 'https://github.com', icon: 'north_east', description: '开放代码', order: 50, external: true, enabled: true },
  { title: 'RSS', href: '/feed.xml', icon: 'rss_feed', description: '订阅更新', order: 60, external: false, enabled: true },
]

export function getEnabledQuickLinks(): QuickLink[] {
  return quickLinks
    .filter((link) => link.enabled)
    .sort((a, b) => a.order - b.order)
}

/** 判断主导航项是否应标记为当前栏目。 */
export function isNavItemActive(item: PrimaryNavItem, pathname: string): boolean {
  if (item.match === '/') return pathname === '/'
  return pathname === item.match || pathname.startsWith(`${item.match}/`)
}
