'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { TimelineCard } from '@/components/timeline/timeline-card'
import { ToyButton } from '@/components/ui/toy-button'
import { timelineTypeStyles } from '@/config/timeline'
import { TIMELINE_TYPES, type TimelineItem, type TimelineType } from '@/lib/timeline/types'
import { groupTimelineItems } from '@/lib/timeline/view'

type Filter = TimelineType | 'all'

const filterOptions: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  ...TIMELINE_TYPES.map((type) => ({ value: type, label: timelineTypeStyles[type].label })),
]

/**
 * 时间轴筛选与分组列表。数据在服务端一次取好，筛选在客户端完成，
 * 因此 /timeline 可以保持静态生成，不需要读取 searchParams。
 */
export function TimelineExplorer({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const visibleItems = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.type === filter)),
    [filter, items],
  )

  const groups = useMemo(() => groupTimelineItems(visibleItems), [visibleItems])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="按类型筛选时间轴">
        {filterOptions.map((option) => {
          const active = filter === option.value
          return (
            <ToyButton
              key={option.value}
              size="small"
              variant={active ? 'coral' : 'cream'}
              pressed={active}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </ToyButton>
          )
        })}
      </div>

      <p className="mt-4 text-sm font-bold text-[var(--muted)]" aria-live="polite">
        共 {visibleItems.length} 条记录
      </p>

      {items.length === 0 ? (
        <p
          className="mt-8 rounded-2xl border-2 border-dashed p-8 text-center text-sm text-[var(--muted)]"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          时间轴正在整理中，很快就来。
        </p>
      ) : groups.length === 0 ? (
        <p
          className="mt-8 rounded-2xl border-2 border-dashed p-8 text-center text-sm text-[var(--muted)]"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          这一类还没有记录，换个类型看看。
        </p>
      ) : (
        <>
          <nav aria-label="按年份跳转" className="mt-5 flex flex-wrap gap-2">
            {groups.map((group) => (
              <ToyButton key={group.key} href={`#year-${group.key}`} size="small" variant="sky">
                {group.label}
              </ToyButton>
            ))}
          </nav>

          <div className="mt-10 grid gap-12">
            {groups.map((group) => (
              <section
                key={group.key}
                id={`year-${group.key}`}
                aria-labelledby={`year-title-${group.key}`}
              >
                <div className="mb-5 flex items-baseline gap-3">
                  <h2 id={`year-title-${group.key}`} className="font-display text-2xl">
                    {group.label}
                  </h2>
                  <span className="text-xs font-bold text-[var(--muted)]">{group.count} 条</span>
                </div>

                <div className="grid gap-7">
                  {group.months.map((month) => (
                    <section key={month.key} aria-labelledby={`month-title-${month.key}`}>
                      <h3
                        id={`month-title-${month.key}`}
                        className="mb-3 text-sm font-extrabold text-[var(--muted)]"
                      >
                        {month.label}
                      </h3>

                      <ol className="timeline-rail grid gap-4">
                        {month.items.map((item) => {
                          const typeStyle = timelineTypeStyles[item.type]
                          const nodeStyle = {
                            '--node-tone': `var(--${typeStyle.tone})`,
                            '--node-base': `var(--${typeStyle.tone}-base)`,
                          } as CSSProperties

                          return (
                            <li key={item.id} className="timeline-node" style={nodeStyle}>
                              <TimelineCard item={item} />
                            </li>
                          )
                        })}
                      </ol>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
