'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { Icon } from '@/components/ui/icon'
import { readThemeFromDom, subscribeTheme, toggleTheme } from '@/lib/theme-dom'
import type { Theme } from '@/lib/theme-shared'

/**
 * 卡通主题开关（技术架构 12.2 / 决策 D-08）。
 * 根布局保持静态输出 data-theme="light"，由 head 内联脚本在首屏前按 cookie 校正；
 * 这里只负责切换 DOM 上的 data-theme 并回写 cookie。
 *
 * 读写逻辑已抽到 `lib/theme-dom.ts`（D-24）—— 首页触感面板的主题滑块是第二个
 * 改主题的地方，两处必须共用同一套 cookie 名与写入顺序，否则会出现
 * 「页头切了、面板没跟上」的漂移。
 *
 * 几何（决策 D-21）：滑块与两个图标共用同一套 27×27 的「停靠位」，
 * 两个停靠位分别贴住按钮左右各 6px 内边距，滑块在两者之间平移 35px（= 74 - 6 - 6 - 27）。
 * 滑块完全落在 74×39 的按钮面之内，图标居中压在滑块上，因此日/夜两态都不会出现
 * 滑块溢出圆角或遮住对面图标。**不要改回 justify-between + translateX**：
 * 那套布局里三个子项（14+27+14）挤在 58px 内容宽里，滑块夜间态会右移出按钮面 3.5px
 * 并压住月亮图标 —— 这是用户报告的「显示异常」的真实成因。
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    readThemeFromDom,
    () => 'light' as Theme,
  )
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isNight = theme === 'night'

  const toggle = useCallback(() => {
    toggleTheme()
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
        className="absolute inset-0 rounded-full transition-transform active:translate-y-[3px]"
        style={{ background: 'var(--pink)', color: 'var(--on-accent)' }}
      >
        <span
          className="absolute left-[6px] top-[6px] h-[27px] w-[27px] rounded-full transition-transform duration-200"
          style={{
            background: 'var(--cream)',
            // 滑块的内阴影用 --line（由最深色源色派生），不再写死 rgba，
            // 否则换个配色就会在滑块上留一块不相干的褐色。
            boxShadow: 'inset -3px -3px 0 var(--line)',
            transform: isNight && mounted ? 'translateX(35px)' : 'translateX(0)',
          }}
        />
        {/* 两个图标是绝对定位停靠位，渲染在滑块之后 => 叠在滑块之上，始终可见。 */}
        <span className="absolute left-[6px] top-[6px] flex h-[27px] w-[27px] items-center justify-center">
          <Icon name="light_mode" size={14} />
        </span>
        <span className="absolute right-[6px] top-[6px] flex h-[27px] w-[27px] items-center justify-center">
          <Icon name="dark_mode" size={14} />
        </span>
      </span>
    </button>
  )
}
