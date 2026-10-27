'use client'

import { useEffect, useRef } from 'react'

import { renderMermaidBlocks } from '@/lib/editor/mermaid-run'

/**
 * 正文 HTML 的客户端外壳（决策 D-32）。
 *
 * HTML 仍然由服务端渲染好后随 RSC 一起下发，所以首屏与 SEO 都不受影响；
 * 这个组件只多做一件事：等 DOM 就位后把 `pre.mermaid` 画成图。
 *
 * 同时监听 `<html data-theme>`：明暗主题切换时必须重画，否则深色背景上会留着
 * 一张为浅色主题生成的图，文字与底色撞在一起。
 */
export function MermaidRoot({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = ref.current
    if (host === null) return

    const paint = () => {
      const theme = document.documentElement.dataset.theme === 'night' ? 'night' : 'light'
      void renderMermaidBlocks(host, theme).catch(() => {})
    }

    paint()

    const observer = new MutationObserver(paint)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => observer.disconnect()
  }, [html])

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
