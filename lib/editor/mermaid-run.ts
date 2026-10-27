/**
 * Mermaid 的浏览器端渲染与语法校验（决策 D-32）。
 *
 * ## 为什么在客户端渲染
 *
 * mermaid 需要真实的 DOM 与布局度量才能算节点尺寸；在 Node 里只能靠 jsdom，
 * 而且几 MB 的解析器会让每一次构建都变慢。文章页是一个静态页，把渲染推迟到
 * 浏览器里并不会让它退化成动态路由。
 *
 * ## 为什么按节点 try / catch
 *
 * 写图的过程里，大部分时间图是不完整的。一张图语法错，不应该让同一篇文章里
 * 其它图一起消失，也不应该让整篇文章变成空白。
 */

export type SiteTheme = 'light' | 'night'

type MermaidModule = typeof import('mermaid')

let cached: Promise<MermaidModule> | null = null

/** 原始源码。mermaid 渲染会把 textContent 换成 svg，换主题重画时要能还原。 */
const sources = new WeakMap<Element, string>()

export function loadMermaid(): Promise<MermaidModule> {
  if (cached === null) cached = import('mermaid')
  return cached
}

function currentTheme(): SiteTheme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'night' ? 'night' : 'light'
}

function configure(mermaid: MermaidModule['default'], theme: SiteTheme) {
  mermaid.initialize({
    startOnLoad: false,
    // strict：图表源码里的 HTML 标签一律当文本，不生成可点击的节点。
    securityLevel: 'strict',
    theme: theme === 'night' ? 'dark' : 'default',
    fontFamily: 'inherit',
  })
}

/**
 * 渲染 `root` 内所有 `pre.mermaid`。
 *
 * 每次调用都会先把源码写回再渲染 —— 这样同一个节点被重复处理（例如切换
 * 明暗主题）时不会因为 textContent 已经变成 svg 而渲染出空图。
 */
export async function renderMermaidBlocks(
  root: ParentNode,
  theme: SiteTheme = currentTheme(),
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid'))
  if (nodes.length === 0) return

  const { default: mermaid } = await loadMermaid()
  configure(mermaid, theme)

  for (const node of nodes) {
    if (!sources.has(node)) sources.set(node, node.textContent ?? '')
    const source = sources.get(node) ?? ''

    if (source.trim() === '') {
      node.dataset.mermaidError = '1'
      continue
    }

    node.textContent = source
    delete node.dataset.mermaidError

    try {
      await mermaid.run({ nodes: [node] })
    } catch {
      // 失败时保留源码可见，并打上标记让样式把它染成错误色。
      node.dataset.mermaidError = '1'
      node.textContent = source
    }
  }
}

/** 用 mermaid 自己的解析器校验一段图表源码。合法返回 null，否则返回单行错误说明。 */
export async function lintMermaid(source: string): Promise<string | null> {
  if (source.trim() === '') return null
  const { default: mermaid } = await loadMermaid()
  configure(mermaid, 'light')

  try {
    await mermaid.parse(source)
    return null
  } catch (error) {
    const raw = error instanceof Error ? error.message : '语法错误'
    const firstLine = raw.split('\n').map((line) => line.trim()).find((line) => line.length > 0)
    const message = firstLine ?? '语法错误'
    return message.length > 160 ? `${message.slice(0, 160)}…` : message
  }
}
