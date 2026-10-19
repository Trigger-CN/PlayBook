import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

/** 数据块右下装饰圆的强调色，取自主题的明亮色。 */
export type StatBlockTone = 'mint' | 'coral' | 'cream' | 'sky' | 'pink'

export type StatBlockProps = {
  value: string
  label: string
  tone?: StatBlockTone
  className?: string
}

/**
 * 单个数据块（demo 的 .stat）。网格布局由外层 .stats 承担。
 * 强调色通过 --stat-accent 传入，不依赖元素顺序。
 */
export function StatBlock({ value, label, tone = 'mint', className }: StatBlockProps) {
  const style = { '--stat-accent': `var(--${tone})` } as CSSProperties

  return (
    <div className={cn('stat', className)} style={style}>
      <span className="stat__value">{value}</span>
      <small className="stat__label">{label}</small>
    </div>
  )
}
