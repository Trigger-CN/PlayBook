/**
 * 主题在浏览器端的**唯一**读写入口（决策 D-08，D-24 抽出来）。
 *
 * 为什么需要这个文件：D-08 定的做法是「根布局静态输出 data-theme，由 <head>
 * 内联脚本在首屏前按 cookie 校正」，所以主题的真值在 **DOM 上**，不在 React
 * state 里。谁要改主题，就必须同时改 `data-theme` 并回写同一个 cookie。
 *
 * 一旦有第二个组件（触感面板的主题滑块）也要改主题，如果各自抄一份 cookie
 * 名与写盘逻辑，迟早会出现「页头改了、面板没跟上」或者 cookie 名写错的漂移。
 * 因此把「读 / 订阅 / 写 / 切换」四个动作收到这里，两处共用。
 *
 * 注意：这里不 import 'server-only'。它必须能在浏览器里跑，也只该在客户端
 * 组件的 effect / 事件回调里被调用。
 */
import { THEME_COOKIE, type Theme } from '@/lib/theme-shared'

/** 读 DOM 上当前的主题。服务端渲染期没有 document，返回默认值。 */
export function readThemeFromDom(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'night' ? 'night' : 'light'
}

/**
 * 订阅 `data-theme` 的变化。
 *
 * 用 MutationObserver 而不是自定义事件：主题可能被别处（内联脚本、另一个
 * 组件、将来的快捷键）改动，只有观测 DOM 才能全都收到。
 */
export function subscribeTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

/**
 * 写入主题：DOM 与 cookie 一起改。
 *
 * 已经等于目标值时**跳过 DOM 赋值**。否则一次多余的赋值就会触发
 * MutationObserver，让所有订阅者白跑一轮 —— 主题滑块在拖动时会高频调用它。
 */
export function writeTheme(next: Theme): void {
  if (typeof document === 'undefined') return

  if (document.documentElement.dataset.theme !== next) {
    document.documentElement.dataset.theme = next
  }

  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
}

/** 取反并写入。总是从 DOM 现读，不依赖调用方手里的 state（可能已过期）。 */
export function toggleTheme(): Theme {
  const next: Theme = readThemeFromDom() === 'night' ? 'light' : 'night'
  writeTheme(next)
  return next
}
