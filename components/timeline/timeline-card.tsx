import { Icon } from '@/components/ui/icon'
import { ToyCard } from '@/components/ui/toy-card'
import { timelineTypeStyles } from '@/config/timeline'
import type { TimelineItem } from '@/lib/timeline/types'
import { firstParagraph, formatTimelineDay } from '@/lib/timeline/view'
import { cn } from '@/lib/utils'

export type TimelineCardProps = {
  item: TimelineItem
  className?: string
}

/**
 * 时间轴节点卡：日期、类型徽标、标题与首段摘要，可选缩略图。
 * 整卡是唯一交互根（ToyCard 传 href），内部不再嵌套链接。
 * 类型同时用文字与颜色表达，颜色只来自 config/timeline.ts。
 */
export function TimelineCard({ item, className }: TimelineCardProps) {
  const typeStyle = timelineTypeStyles[item.type]

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <time dateTime={item.occurredAt} className="text-xs font-bold text-[var(--muted)]">
          {formatTimelineDay(item.occurredAt)}
        </time>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-extrabold"
          style={{ background: `var(--${typeStyle.tone})`, color: '#211522' }}
        >
          <Icon name={typeStyle.icon} size={13} />
          {typeStyle.label}
        </span>
      </div>
      {item.title ? (
        <h4 className="my-1.5 font-display text-lg leading-snug">{item.title}</h4>
      ) : null}
      <p className="line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
        {firstParagraph(item.content)}
      </p>
    </>
  )

  return (
    <ToyCard href={`/timeline/${item.id}`} base={typeStyle.tone} className={cn('p-4', className)}>
      {item.imageUrl ? (
        <div className="grid gap-4 sm:grid-cols-[112px_1fr]">
          <img
            src={item.imageUrl}
            alt={item.imageAlt ?? ''}
            className="h-full min-h-[92px] w-full rounded-[13px] object-cover"
          />
          <div>{body}</div>
        </div>
      ) : (
        body
      )}
    </ToyCard>
  )
}
