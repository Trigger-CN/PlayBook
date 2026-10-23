import type { Metadata } from 'next'

import './globals.css'

import { resolvePaletteColors } from '@/config/palette'
import { siteConfig } from '@/config/site'
import { DEFAULT_THEME, THEME_COOKIE } from '@/lib/theme-shared'
import { buildPaletteCss } from '@/lib/theme/palette-css'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: 'website',
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  // 设计 module 11 §7：feed 发现链接由布局统一声明，
  // 避免每篇文章各自拼一份。
  alternates: {
    types: {
      'application/rss+xml': '/rss.xml',
    },
  },
}

/**
 * 根布局必须保持静态可预渲染（需求 REQ-NFR-001 / 设计 module 13 渲染矩阵）。
 *
 * 因此这里刻意不调用 cookies()：一旦在布局读取 cookie，整站都会退化为
 * 动态渲染，首页与列表页就失去 SSG/ISR 能力。
 *
 * 主题采用"静态输出默认值 + head 内联脚本纠正"的方案（决策 D-08）：
 * 内联脚本在首次绘制前读取 cookie 并写入 data-theme，既有正确主题也不闪烁，
 * 同时不牺牲静态生成。脚本极小且无外部依赖。
 */
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/);var t=m&&m[1];if(t==='light'||t==='night'){document.documentElement.dataset.theme=t;}}catch(e){}})();`

/**
 * 5 色配色体系（决策 D-22）：把 `config/palette.ts` 的 5 个颜色派生成全部语义
 * token，在 `<head>` 里以 `<style>` 输出。
 *
 * 为什么用 `<style>` 而不是给 `<html>` 加 inline style：
 * 派生结果同时包含 `:root`（日间）与 `:root[data-theme='night']`（夜间）两套选择器，
 * inline style 只能表达一个元素上的一组属性，无法携带选择器。
 *
 * 为什么这段颜色不写在 `app/globals.css` 里：
 * 颜色必须由 5 个源色算出来，CSS 无法做对比度分支；写死在 CSS 里就等于
 * 把 5 色体系退化成「又一套硬编码」。`globals.css` 只保留与颜色无关的几何 token。
 *
 * 这段 CSS 是构建期常量，因此不破坏静态渲染。
 */
const paletteCss = buildPaletteCss(resolvePaletteColors())

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: paletteCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
