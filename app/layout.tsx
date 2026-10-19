import type { Metadata } from 'next'

import './globals.css'

import { siteConfig } from '@/config/site'
import { DEFAULT_THEME, THEME_COOKIE } from '@/lib/theme-shared'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
