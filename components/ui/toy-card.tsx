import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** 卡片底座色对名称，对应 .toy-card 使用的 --card-base-color 变量。 */
export type ToyCardBase = 'coral' | 'pink' | 'cream' | 'mint' | 'sky' | 'lilac'

type SharedProps = {
  /** 底座色对；只覆盖 CSS 变量，不复制 .toy-card 的位移与阴影规则。 */
  base?: ToyCardBase
  className?: string
  children: ReactNode
}

type CardLinkProps = SharedProps & {
  href: string
}

type CardBoxProps = SharedProps & {
  href?: undefined
}

export type ToyCardProps = CardLinkProps | CardBoxProps

/**
 * 实体内容卡，与 ToyButton 共用一套立体语言。
 * 整张卡只有一个交互根：传 href 时根元素是链接，否则是普通容器。
 * 卡片内部不得再嵌套 a/button；需要多个链接时应改用非链接卡片。
 */
export function ToyCard({ base = 'coral', className, children, href }: ToyCardProps) {
  const classes = cn('toy-card', className)
  const style = { '--card-base-color': `var(--${base}-base)` } as CSSProperties

  if (typeof href === 'string') {
    return (
      <Link href={href} className={classes} style={style}>
        {children}
      </Link>
    )
  }

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  )
}
