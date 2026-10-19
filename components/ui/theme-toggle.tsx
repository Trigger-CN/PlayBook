'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { THEME_COOKIE, type Theme } from '@/lib/theme-shared'

function readThemeFromDom(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'night' ? 'night' : 'light'
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

/**
 * 卡通主题开关（技术架构 12.2 / 决策 D-08）。
 * 根布局保持静态输出 data-theme="light"，由 head 内联脚本在首屏前按 cookie 校正；
 * 这里只负责切换 DOM 上的 data-theme 并回写 cookie，两者共用同一个 cookie 名。
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readThemeFromDom,
    () => 'light' as Theme,
  )
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isNight = theme === 'night'

  const toggle = useCallback(() => {
    const next: Theme = readThemeFromDom() === 'night' ? 'light' : 'night'
    document.documentElement.dataset.theme = next
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }, [])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isNight}
      aria-label={isNight ? '切换日间主题' : '切换晚间主题'}
      className="relative h-[39px] w-[74px] rounded-full border-0 bg-transparent p-0"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 top-[6px] rounded-full"
        style={{ background: 'var(--pink-base)' }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-between rounded-full px-2 py-1 text-[13px] transition-transform active:translate-y-[3px]"
        style={{ background: 'var(--pink)', color: '#28152b' }}
      >
        ☼
        <span
          className="h-[27px] w-[27px] rounded-full transition-transform duration-200"
          style={{
            background: 'var(--cream)',
            boxShadow: 'inset -3px -3px 0 rgba(100,61,0,.12)',
            transform: isNight && mounted ? 'translateX(27px)' : 'translateX(0)',
          }}
        />
        ☾
      </span>
    </button>
  )
}
