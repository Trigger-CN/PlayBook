/**
 * 主题常量与工具（客户端与服务端共用）。
 *
 * 决策 D-08：主题以 cookie 持久化，但不通过服务端 cookies() 读取 —— 那会让
 * 整站退化为动态渲染。实际做法是根布局静态输出默认主题，再由 <head> 内联
 * 脚本在首次绘制前按 cookie 纠正 data-theme，既保证正确主题又保留 SSG/ISR。
 */
export const THEME_COOKIE = 'playbook-theme'

export const THEMES = ['light', 'night'] as const

export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'light'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
