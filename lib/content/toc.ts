import GithubSlugger from 'github-slugger'

import type { TocEntry } from './schema'

/**
 * 从 MDX 原文提取 h2/h3 生成目录（设计 module 03 §4）。
 * 在构建期完成，不依赖客户端扫描 DOM。
 * 与 rehype-slug 使用同样的 GitHub slug 规则，保证锚点一致。
 */
export function extractToc(body: string): TocEntry[] {
  const slugger = new GithubSlugger()
  const entries: TocEntry[] = []
  let insideFence = false

  for (const line of body.split('\n')) {
    // 跳过围栏代码块，避免把代码注释里的 # 当成标题
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence
      continue
    }
    if (insideFence) continue

    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue

    const depth = match[1].length as 2 | 3
    const text = match[2]
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~]/g, '')
      .trim()

    if (!text) continue

    entries.push({ id: slugger.slug(text), text, depth })
  }

  return entries
}
