/**
 * 正文的静态检查（决策 D-32）。
 *
 * 只报「几乎确定是写错了」的问题：没闭合的围栏、没闭合的块级公式、
 * 断了右括号的链接、缺替代文字的图片、跳级的标题、空的图表。
 *
 * 刻意不做完整的 Markdown 语法校验，也不猜行内公式的配对：
 * 草稿允许是半成品，把「还没写完」报成错误会让诊断栏变成噪音，
 * 而噪音会让人直接关掉它 —— 那比没有诊断更糟。行内公式写错会在预览里
 * 直接显示成 KaTeX 的错误原文，看得见，不必再猜一遍。
 */

export type MarkdownDiagnostic = {
  /** 1 起始的行号。 */
  line: number
  /** 1 起始的列号，按 UTF-16 code unit 计，与 CodeMirror 的 offset 换算一致。 */
  column: number
  /** 命中字符数，至少 1。 */
  length: number
  severity: 'error' | 'warning'
  message: string
}

export type MermaidBlock = {
  /** 围栏起始行，1 起始。 */
  startLine: number
  source: string
}

type Fence = {
  startLine: number
  /** 闭合行；未闭合为 null。 */
  endLine: number | null
  lang: string
  body: string
}

const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/
const HEADING = /^\s{0,3}(#{1,6})\s/
const LINK_TARGET = /\]\(([^)]*)$/
const IMAGE_EMPTY_ALT = /!\[\s*\]\(/

function scanFences(lines: string[]): Fence[] {
  const fences: Fence[] = []
  let current: { startLine: number; marker: string; lang: string; body: string[] } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]
    const match = FENCE_OPEN.exec(text)
    const marker = match === null ? null : match[1]
    const lang = match === null ? '' : match[2].toLowerCase()

    if (current === null) {
      if (marker !== null) {
        current = { startLine: index + 1, marker: marker[0], lang, body: [] }
      }
      continue
    }

    // 只有同种围栏字符、且长度不短于开启者，才算闭合。
    if (marker !== null && marker[0] === current.marker && marker.length >= current.marker.length) {
      fences.push({
        startLine: current.startLine,
        endLine: index + 1,
        lang: current.lang,
        body: current.body.join('\n'),
      })
      current = null
      continue
    }

    current.body.push(text)
  }

  if (current !== null) {
    fences.push({
      startLine: current.startLine,
      endLine: null,
      lang: current.lang,
      body: current.body.join('\n'),
    })
  }

  return fences
}

/** 找出正文里所有 mermaid 围栏，供编辑器做语法校验。 */
export function findMermaidBlocks(source: string): MermaidBlock[] {
  const fences = scanFences(source.split('\n'))
  const blocks: MermaidBlock[] = []
  for (const fence of fences) {
    if (fence.lang !== 'mermaid') continue
    blocks.push({ startLine: fence.startLine, source: fence.body })
  }
  return blocks
}

export function lintMarkdown(source: string): MarkdownDiagnostic[] {
  const diagnostics: MarkdownDiagnostic[] = []
  const lines = source.split('\n')
  const fences = scanFences(lines)

  const fencedLines = new Set<number>()
  for (const fence of fences) {
    const last = fence.endLine === null ? lines.length : fence.endLine
    for (let line = fence.startLine; line <= last; line += 1) fencedLines.add(line)

    if (fence.endLine === null) {
      diagnostics.push({
        line: fence.startLine,
        column: 1,
        length: 3,
        severity: 'error',
        message: '这个代码块没有闭合，后面所有内容都会被当成代码。',
      })
    }

    if (fence.lang === 'mermaid' && fence.body.trim() === '') {
      diagnostics.push({
        line: fence.startLine,
        column: 1,
        length: 3,
        severity: 'warning',
        message: '空的 mermaid 图表块，补上 graph TD 之类的图表定义。',
      })
    }
  }

  let previousHeadingLevel = 0
  let displayMathOpen = false
  let displayMathLine = 0

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1
    if (fencedLines.has(lineNumber)) continue

    const text = lines[index]

    // 块级公式 $$：同一行成对出现算已闭合，落单则翻转开关。
    let rest = text
    while (rest.includes('$$')) {
      rest = rest.slice(rest.indexOf('$$') + 2)
      if (displayMathOpen) {
        displayMathOpen = false
      } else {
        displayMathOpen = true
        displayMathLine = lineNumber
      }
    }

    const heading = HEADING.exec(text)
    if (heading !== null) {
      const level = heading[1].length
      if (level > 3) {
        diagnostics.push({
          line: lineNumber,
          column: 1,
          length: level,
          severity: 'warning',
          message: `h${level} 不会出现在文章目录里，目录只收 h2 与 h3。`,
        })
      } else if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) {
        diagnostics.push({
          line: lineNumber,
          column: 1,
          length: level,
          severity: 'warning',
          message: `标题从 h${previousHeadingLevel} 跳到 h${level}，中间少了一级。`,
        })
      }
      previousHeadingLevel = level
    }

    // 链接/图片地址断了右括号：]() 没有收尾。
    if (LINK_TARGET.test(text)) {
      diagnostics.push({
        line: lineNumber,
        column: 1,
        length: text.length === 0 ? 1 : text.length,
        severity: 'error',
        message: '链接地址少了右括号 )。',
      })
    }

    if (IMAGE_EMPTY_ALT.test(text)) {
      diagnostics.push({
        line: lineNumber,
        column: 1,
        length: text.length === 0 ? 1 : text.length,
        severity: 'warning',
        message: '图片没写替代文字，正文图片同样需要它。',
      })
    }
  }

  if (displayMathOpen) {
    diagnostics.push({
      line: displayMathLine,
      column: 1,
      length: 2,
      severity: 'error',
      message: '块级公式的 $$ 没有配对闭合。',
    })
  }

  return diagnostics
}
