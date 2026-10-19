import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type ToyButtonVariant = 'coral' | 'pink' | 'cream' | 'mint' | 'sky' | 'lilac'

export type ToyButtonSize = 'small' | 'default' | 'large'

const variantClass: Record<ToyButtonVariant, string> = {
  coral: '',
  pink: 'toy-button--pink',
  cream: 'toy-button--cream',
  mint: 'toy-button--mint',
  sky: 'toy-button--sky',
  lilac: 'toy-button--lilac',
}

const sizeClass: Record<ToyButtonSize, string> = {
  small: 'toy-button--small',
  default: '',
  large: 'toy-button--large',
}

type SharedProps = {
  variant?: ToyButtonVariant
  size?: ToyButtonSize
  /** 用于筛选/点赞等可切换状态；只切换色对与语义，不保持物理按下位移。 */
  pressed?: boolean
  loading?: boolean
  className?: string
  children: ReactNode
}

type ButtonProps = SharedProps &
  Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'className'> & {
    href?: undefined
  }

type AnchorProps = SharedProps &
  Omit<ComponentPropsWithoutRef<'a'>, 'children' | 'className' | 'href'> & {
    href: string
  }

export type ToyButtonProps = ButtonProps | AnchorProps

function buttonClasses(
  variant: ToyButtonVariant,
  size: ToyButtonSize,
  className?: string,
) {
  return cn('toy-button', variantClass[variant], sizeClass[size], className)
}

/**
 * 立体卡通按压按钮（技术架构 12.3 / 决策 D-02）。
 * 结构不变量：外层是唯一交互根，内层 span 承载按钮面与位移。
 * 链接与按钮共享视觉类但保留各自语义，禁止在 button 内嵌套 a。
 */
export function ToyButton(props: ToyButtonProps) {
  const {
    variant = 'coral',
    size = 'default',
    pressed,
    loading = false,
    className,
    children,
    ...rest
  } = props

  const classes = buttonClasses(variant, size, className)
  const ariaPressed = pressed === undefined ? undefined : pressed
  const content = <span className="toy-button__top">{children}</span>

  if (typeof rest.href === 'string') {
    const { href, ...anchorRest } = rest as AnchorProps
    return (
      <Link href={href} className={classes} aria-busy={loading || undefined} {...anchorRest}>
        {content}
      </Link>
    )
  }

  const { disabled, type = 'button', ...buttonRest } = rest as ButtonProps
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-pressed={ariaPressed}
      aria-busy={loading || undefined}
      {...buttonRest}
    >
      {content}
    </button>
  )
}
