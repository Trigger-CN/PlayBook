import 'server-only'

import { compileMDX } from 'next-mdx-remote/rsc'
import type { Pluggable } from 'unified'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

/**
 * MDX 最小渲染管线（设计 module 03 §4）。
 * 只启用白名单插件：GFM 表格、标题锚点、构建期代码高亮。
 * rehypePlugins 显式标注为 Pluggable[]，否则 unified 的元组类型收窄会失败。
 */
const rehypePlugins: Pluggable[] = [
  rehypeSlug,
  [rehypeAutolinkHeadings, { behavior: 'wrap' }],
  [rehypePrettyCode, { theme: 'github-light', keepBackground: false }],
]

const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm] as Pluggable[],
    rehypePlugins,
  },
}

export async function renderMdx(source: string) {
  return compileMDX<Record<string, unknown>>({
    source,
    options: mdxOptions,
  })
}
