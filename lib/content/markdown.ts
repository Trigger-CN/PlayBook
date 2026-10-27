import 'server-only'

import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import type { Pluggable } from 'unified'

/**
 * 正文渲染管线（决策 D-32）。
 *
 * ## 为什么不再是 MDX
 *
 * MDX 把 `{` 当作 JS 表达式起始符。而 LaTeX 的 `\frac{a}{b}` 里到处是 `{a}`
 * 这样的花括号 —— 在 MDX 下正文里的公式会被当成表达式求值，直接渲染失败。
 * 这个冲突没有折中方案：公式与 MDX 的表达式语法共用同一组定界符。
 *
 * 另一方面，原来的 `renderMdx` 从来没有传入过 `components` 白名单，也就是说
 * MDX 的 JSX 能力在本项目里一直是「装了但没接线」，只剩「构建期可以执行任意
 * JS」这一个副作用。放弃它的成本为零。
 *
 * 换成「GFM Markdown + 白名单 rehype 插件」之后：
 * - `{`、`}`、`$` 都只是普通字符，公式能正常解析；
 * - 仍支持正文内嵌 HTML（`rehype-raw`），可以写 `<div align="center">`；
 * - 公开文章页与后台预览走同一个 processor，预览看到的就是发布后的样子。
 *
 * ## 插件顺序是有约束的
 *
 * 1. `rehypeRaw` 必须靠前，否则正文里的原生 HTML 会被丢掉。
 * 2. `rehypeMermaidFence` 必须在 `rehypePrettyCode` 之前：Shiki 不认识 mermaid
 *    这个语言，会把它降级成无高亮的 `<pre><code>`，把客户端渲染要用的节点
 *    结构一起改掉。
 * 3. `rehypeStripDangerous` 必须紧跟在 `rehypeRaw` 之后：前者刚把 HTML 解析成
 *    真实节点，这里才是唯一能拦住 `<script>` 的位置。
 * 4. `rehypeKatex` 必须在 `remarkRehype` 之后，它处理的是已经变成
 *    `span.math-inline` / `div.math-display` 的 hast 节点。
 */

const MERMAID_LANG = 'mermaid'

/** hast 节点的最小结构描述。只用到这几个字段，不复用外部类型以免引入未声明的依赖。 */
type HastNode = {
  type?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
}

function textOf(node: HastNode): string {
  if (typeof node.value === 'string') return node.value
  if (node.children === undefined) return ''
  let out = ''
  for (const child of node.children) out += textOf(child)
  return out
}

function classNameOf(node: HastNode): string[] {
  const raw = node.properties?.className
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string')
  }
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean)
  return []
}

/**
 * 允许正文内嵌 HTML，但不允许它执行脚本。
 *
 * `rehype-raw` 会把 `<script>`、`<iframe>`、`onclick=` 原样保留到最终 HTML 里。
 * 本站的写作者就是站长本人，风险不高，但这属于「一旦发生就没有挽回余地」的
 * 一类问题，而拦住它只需要一份标签黑名单。
 *
 * 只拦「能执行」与「能外联」的标签和属性，不碰排版类 HTML —— 写作者仍然可以
 * 用 `<div align="center">`、`<kbd>`、`<sup>` 这些正常的东西。
 */
const BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'link',
  'meta',
  'style',
  'form',
  'input',
  'button',
])

const EVENT_ATTRIBUTE = /^on/i
const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.{0,2}\/)/i

function rehypeStripDangerous() {
  return (tree: HastNode) => {
    stripDangerous(tree)
  }
}

function stripDangerous(node: HastNode): void {
  const children = node.children
  if (children === undefined) return

  const kept: HastNode[] = []
  for (const child of children) {
    if (child.tagName !== undefined && BLOCKED_TAGS.has(child.tagName)) continue

    const properties = child.properties
    if (properties !== undefined) {
      for (const key of Object.keys(properties)) {
        if (EVENT_ATTRIBUTE.test(key)) {
          delete properties[key]
          continue
        }
        if (key === 'href' || key === 'src' || key === 'xlinkHref') {
          const value = properties[key]
          if (typeof value === 'string' && !SAFE_URL.test(value.trim())) {
            delete properties[key]
          }
        }
      }
    }

    stripDangerous(child)
    kept.push(child)
  }

  node.children = kept
}

/**
 * 把 ```mermaid 围栏代码块换成 `<pre class="mermaid">源码</pre>`。
 *
 * 只保留源码文本，不预渲染成 SVG：mermaid 需要真实的 DOM 与布局度量才能算
 * 节点尺寸，服务端渲染只能靠 jsdom，而且会让每次构建都背上几 MB 的解析器。
 * 客户端那边由 lib/editor/mermaid-run 接手。
 */
function rehypeMermaidFence() {
  return (tree: HastNode) => {
    rewriteMermaid(tree)
  }
}

function rewriteMermaid(node: HastNode): void {
  const children = node.children
  if (children === undefined) return

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (isMermaidPre(child)) {
      children[index] = toMermaidElement(child)
      continue
    }
    rewriteMermaid(child)
  }
}

function isMermaidPre(node: HastNode): boolean {
  if (node.tagName !== 'pre' || node.children === undefined) return false
  const code = node.children[0]
  if (code === undefined || code.tagName !== 'code') return false
  return classNameOf(code).includes(`language-${MERMAID_LANG}`)
}

function toMermaidElement(node: HastNode): HastNode {
  const code = node.children?.[0]
  return {
    type: 'element',
    tagName: 'pre',
    properties: { className: [MERMAID_LANG] },
    children: [{ type: 'text', value: code === undefined ? '' : textOf(code) }],
  }
}

const remarkPlugins: Pluggable[] = [remarkGfm, remarkMath]

const rehypePlugins: Pluggable[] = [
  rehypeRaw,
  // 这两个 transformer 只声明了自己真正读写的字段，与 unified 的 Plugin
  // 签名不完全匹配；断言是这里的正确做法，不是绕过类型检查。
  rehypeStripDangerous as unknown as Pluggable,
  rehypeMermaidFence as unknown as Pluggable,
  rehypeSlug,
  [rehypeAutolinkHeadings, { behavior: 'wrap' }],
  [rehypePrettyCode, { theme: 'github-light', keepBackground: false }],
  // throwOnError: false —— 写坏的公式就地显示成红色原文，不该让整篇文章渲染失败。
  // strict: 'ignore' —— KaTeX 的严格模式会把公式里的中文字符判为问题，中文站必须关掉。
  [rehypeKatex, { throwOnError: false, strict: 'ignore' }],
]

const processor = unified()
  .use(remarkParse)
  .use(remarkPlugins)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypePlugins)
  .use(rehypeStringify)

/** 把 Markdown 源码编译成 HTML 字符串。空正文直接返回空串，不抛错。 */
export async function renderMarkdownToHtml(source: string): Promise<string> {
  if (source.trim() === '') return ''
  const file = await processor.process(source)
  return String(file)
}
