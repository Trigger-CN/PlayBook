import Link from 'next/link'

import { SiteNav } from '@/components/site/site-nav'
import { Icon } from '@/components/ui/icon'
import { ToyButton } from '@/components/ui/toy-button'
import { siteConfig } from '@/config/site'

/**
 * 品牌标记 + 名称（设计 module 02 §3.1）。
 *
 * 右侧顺序固定为「主导航 → 登录入口」。登录按钮放在 <nav> 之外，
 * 因为主导航 landmark 里只应包含栏目链接；混进一个跳转到后台的动作按钮，
 * 会让读屏用户在「主导航」里听到一个不属于栏目的东西。
 */
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
          <Icon name="auto_awesome" size={15} />
        </span>
        {siteConfig.name}
      </Link>
      <div className="flex shrink-0 items-center gap-2.5 sm:gap-[18px]">
        <SiteNav />
        {/*
          * 后台入口（决策 D-18：放在页面顶部而不是页脚）。
          *
          * 指向 /admin 而不是 /admin/login：未登录时由 (protected)/layout.tsx 的
          * requireAdmin() 带上 next 参数 307 到登录页，已登录则直接进后台 ——
          * 同一个按钮对「有会话」和「没会话」两种状态都成立，不需要在公开页
          * 读 cookie 判断登录态（那会让全站路由退化为 Dynamic，违背 REQ-NFR-001）。
          *
          * rel="nofollow"：robots.ts 已经 disallow 了 /admin，这里再提示一次
          * 「不要顺着这个链接走」。它挡不住有意抓取，只是减少无谓请求；
          * 真正的保护是后台每个 Action / Route Handler 独立鉴权。
          */}
        <ToyButton
          href="/admin"
          size="small"
          variant="cream"
          rel="nofollow"
          aria-label="登录后台"
          className="shrink-0"
        >
          登录
        </ToyButton>
      </div>
    </header>
  )
}
