import { ToyButton } from '@/components/ui/toy-button'
import { getEnabledQuickLinks } from '@/config/site'

/**
 * 快捷入口阵列（设计 module 02 §3.3）。
 * 站内与站外链接共用 ToyButton，不在此重复任何按钮状态样式。
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
          topClassName="h-[112px] flex-col items-start justify-between"
          {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <b aria-hidden="true" className="text-xl leading-none">
            {link.icon}
          </b>
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
