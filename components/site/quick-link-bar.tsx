import { Icon } from '@/components/ui/icon'
import { ToyButton } from '@/components/ui/toy-button'
import { getEnabledQuickLinks } from '@/config/site'

/**
 * 快捷入口阵列（设计 module 02 §3.3）。
 * 站内与站外链接共用 ToyButton，不在此重复任何按钮状态样式。
 *
 * 图标用 Material Symbols 内联 SVG（见 components/ui/icon.tsx），
 * aria-hidden 由 Icon 自带 —— 标题文字才是可访问名称。
 *
 * 为什么这里要显式给 p-[15px]：.toy-button__top 的默认内边距是 `0 20px`
 * （普通按钮只需水平留白，文字靠 align-items:center 垂直居中）。
 * 但快捷入口是 height:112px 的纵向 space-between 布局，垂直内边距为 0
 * 会让图标紧贴卡片顶边、描述文字紧贴底边并被 16px 圆角裁切。
 * 设计稿 demo 的 .link>span 是四边 padding:15px，这里保持一致。
 */
export function QuickLinkBar() {
  const quickLinks = getEnabledQuickLinks()

  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-6">
      {quickLinks.map((link) => (
        <ToyButton
          key={link.href}
          href={link.href}
          variant="cream"
          className="min-h-[112px] text-left"
          topClassName="h-[112px] flex-col items-start justify-between p-[15px]"
          {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <Icon name={link.icon} size={22} className="opacity-80" />
          <span>
            <b className="block text-base">{link.title}</b>
            {link.description ? (
              <small className="block text-xs font-semibold opacity-70">{link.description}</small>
            ) : null}
          </span>
        </ToyButton>
      ))}
    </div>
  )
}
