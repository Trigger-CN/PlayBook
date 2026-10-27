'use client'

import { markdown } from '@codemirror/lang-markdown'
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ToyButton } from '@/components/ui/toy-button'
import { findMermaidBlocks, lintMarkdown, type MarkdownDiagnostic } from '@/lib/content/markdown-lint'
import { lintMermaid, renderMermaidBlocks } from '@/lib/editor/mermaid-run'

import { previewBody } from './preview'

/**
 * 正文编辑器（决策 D-32）。
 *
 * ## 为什么是 CodeMirror 而不是富文本编辑器
 *
 * 正文的存储格式是 Markdown 源码，而且它要被服务端编译成 HTML。TipTap、
 * Lexical、ProseMirror 这一层「文档模型 + 双向序列化」的编辑器，Markdown
 * 只是它们的导入导出格式：往返一次就会丢格式（尤其是公式、图表、表格对齐、
 * 代码块语言标记）。对一个以源码为唯一真相的系统来说，那是把可靠的数据格式
 * 换成了不可靠的中间表示。
 *
 * CodeMirror 是这一层里最通用的选择（Obsidian、Joplin、Replit 都是它）：
 * 它编辑的就是源码本身，光标、撤销、输入法、粘贴全部走浏览器原生行为。
 * 富文本该做的事情由右侧预览承担 —— 预览是只读的，不会被误编辑改坏。
 *
 * ## 为什么诊断走 CodeMirror 自己的 lint 通道
 *
 * 有问题的地方在编辑器里直接标出波浪线，比在别处列一张清单更接近「所见即
 * 所得」。检查本身只是纯文本扫描（lib/content/markdown-lint），不依赖浏览器
 * 的 Markdown 解析器，所以规则和线上编译时的行为能对得上。
 */

type Panel = 'edit' | 'preview' | 'check'

const SNIPPETS: Array<{ id: string; label: string; snippet: string }> = [
  { id: 'inline-math', label: '行内公式', snippet: '$a^2 + b^2 = c^2$' },
  { id: 'block-math', label: '公式块', snippet: '$$\n\\frac{a}{b} = c\n$$' },
  { id: 'mermaid', label: '图表', snippet: '```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```' },
  { id: 'code', label: '代码块', snippet: '```ts\n\n```' },
]

/**
 * 编辑器自身的配色。全部取自语义 token，不写任何十六进制 —— 与全站其余部分
 * 共用同一份 5 色派生结果，切主题时不需要额外同步。
 */
const editorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, Consolas, monospace',
    lineHeight: '1.7',
    maxHeight: '58vh',
  },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--ink)' },
  '.cm-gutters': {
    backgroundColor: 'var(--soft)',
    color: 'var(--muted)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--soft)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--soft)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--line)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: '10px',
  },
})

/** 把「第几行第几列」翻译成 CodeMirror 需要的文档偏移。 */
function toCmDiagnostic(view: EditorView, item: MarkdownDiagnostic): CmDiagnostic {
  const doc = view.state.doc
  const line = doc.line(Math.min(Math.max(1, item.line), doc.lines))
  let from = Math.min(line.from + Math.max(0, item.column - 1), line.to)
  let to = Math.min(from + Math.max(1, item.length), line.to)

  if (to <= from) {
    // 空行与行尾的告警没有可下划的字符，退化成「标住一个字符」。
    if (doc.length === 0) return { from: 0, to: 0, severity: item.severity, message: item.message }
    if (from >= doc.length) from = doc.length - 1
    to = Math.min(from + 1, doc.length)
  }

  return { from, to, severity: item.severity, message: item.message }
}

/**
 * 结构检查 + 图表语法检查。
 *
 * 图表那一步要等 mermaid 自己解析，所以整体是异步的；只有正文里真的存在
 * mermaid 围栏时才会去加载那几 MB 的解析器。
 */
async function collectDiagnostics(text: string): Promise<MarkdownDiagnostic[]> {
  const items = lintMarkdown(text)

  for (const block of findMermaidBlocks(text)) {
    const message = await lintMermaid(block.source)
    if (message === null) continue
    items.push({
      line: block.startLine,
      column: 1,
      length: 9,
      severity: 'error',
      message: `图表语法：${message}`,
    })
  }

  return items.sort((a, b) => a.line - b.line || a.column - b.column)
}

export function PostBodyEditor({
  value,
  onChange,
  invalid = false,
}: {
  value: string
  onChange: (next: string) => void
  invalid?: boolean
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)

  // 只用首次渲染的值建文档；之后由外部 value 的同步 effect 负责对齐。
  const initialRef = useRef(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [panel, setPanel] = useState<Panel>('edit')
  const [diagnostics, setDiagnostics] = useState<MarkdownDiagnostic[]>([])
  const [html, setHtml] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewPending, setPreviewPending] = useState(false)

  // 建立编辑器实例，只做一次。
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    const extensions: Extension[] = [
      basicSetup,
      markdown(),
      lintGutter(),
      linter(
        async (target) => {
          const items = await collectDiagnostics(target.state.doc.toString())
          return items.map((item) => toCmDiagnostic(target, item))
        },
        { delay: 600 },
      ),
      editorTheme,
      EditorView.contentAttributes.of({ 'aria-label': '正文 Markdown 源码' }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        onChangeRef.current(update.state.doc.toString())
      }),
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: initialRef.current, extensions }),
      parent: host,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // 外部值变化（例如服务端返回后回填）同步进编辑器。值相同就不动，避免打断光标。
  useEffect(() => {
    const view = viewRef.current
    if (view === null) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  // 「检查」面板用的清单。与波浪线走同一份检查逻辑，只是延迟稍长一点。
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const items = await collectDiagnostics(value)
      if (!cancelled) setDiagnostics(items)
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value])

  // 预览：停手 450ms 之后请求一次。走服务端同一个 processor，结果与线上一致。
  useEffect(() => {
    if (panel !== 'preview') return
    let cancelled = false
    setPreviewPending(true)

    const timer = setTimeout(async () => {
      const result = await previewBody(value)
      if (cancelled) return
      setPreviewPending(false)
      if (result.ok) {
        setHtml(result.html)
        setPreviewError(null)
      } else {
        setPreviewError(result.message)
      }
    }, 450)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [panel, value])

  // 预览 HTML 变了之后再画图。mermaid 需要真实 DOM，只能放在这一侧。
  useEffect(() => {
    if (panel !== 'preview') return
    const host = previewRef.current
    if (host === null || html === '') return
    const theme = document.documentElement.dataset.theme === 'night' ? 'night' : 'light'
    void renderMermaidBlocks(host, theme).catch(() => {})
  }, [html, panel])

  // 从隐藏状态切回来时，CodeMirror 需要重新量一次尺寸，否则会画成空白。
  useEffect(() => {
    if (panel !== 'edit') return
    viewRef.current?.requestMeasure()
  }, [panel])

  const jumpTo = useCallback((item: MarkdownDiagnostic) => {
    setPanel('edit')
    const view = viewRef.current
    if (view === null) return
    const doc = view.state.doc
    const line = doc.line(Math.min(Math.max(1, item.line), doc.lines))
    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
    view.focus()
  }, [])

  const insertSnippet = useCallback((snippet: string) => {
    const view = viewRef.current
    if (view === null) return
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + snippet.length },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const warningCount = diagnostics.length - errorCount

  const status =
    panel === 'preview'
      ? previewPending
        ? '预览更新中…'
        : '预览已是最新'
      : panel === 'check'
        ? diagnostics.length === 0
          ? '没有发现问题'
          : `${errorCount} 处错误 · ${warningCount} 处提醒`
        : `${value.length} 字符`

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="正文面板" className="flex flex-wrap gap-1.5">
          <ToyButton
            size="small"
            variant={panel === 'edit' ? 'coral' : 'cream'}
            pressed={panel === 'edit'}
            onClick={() => setPanel('edit')}
          >
            编辑
          </ToyButton>
          <ToyButton
            size="small"
            variant={panel === 'preview' ? 'coral' : 'cream'}
            pressed={panel === 'preview'}
            onClick={() => setPanel('preview')}
          >
            预览
          </ToyButton>
          <ToyButton
            size="small"
            variant={panel === 'check' ? 'coral' : 'cream'}
            pressed={panel === 'check'}
            onClick={() => setPanel('check')}
          >
            检查
          </ToyButton>
        </div>
        <p aria-live="polite" className="text-[11px] font-bold text-[var(--muted)]">
          {status}
        </p>
      </div>

      {panel === 'edit' ? (
        <div className="flex flex-wrap gap-1.5">
          {SNIPPETS.map((item) => (
            <ToyButton
              key={item.id}
              size="small"
              variant="cream"
              onClick={() => insertSnippet(item.snippet)}
            >
              {item.label}
            </ToyButton>
          ))}
        </div>
      ) : null}

      <div
        className={
          panel === 'edit' ? 'overflow-hidden rounded-[14px] border' : 'hidden'
        }
        style={{ borderColor: invalid ? 'var(--coral)' : 'var(--line)' }}
      >
        <div ref={hostRef} />
      </div>

      {panel === 'preview' ? (
        <div
          className="rounded-[14px] border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          {previewError !== null ? (
            <p role="alert" className="mb-2 text-[12px] font-bold" style={{ color: 'var(--coral)' }}>
              {previewError}
            </p>
          ) : null}
          {html === '' && previewError === null ? (
            <p className="text-[12px] text-[var(--muted)]">还没有正文。写一点东西，这里就会显示渲染结果。</p>
          ) : null}
          <div
            ref={previewRef}
            className="prose-playbook text-sm leading-[1.85]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      ) : null}

      {panel === 'check' ? (
        <div
          className="rounded-[14px] border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          {diagnostics.length === 0 ? (
            <p className="text-[12px] text-[var(--muted)]">
              没有发现结构问题。代码块都闭合了，公式定界符成对，标题层级没有跳级。
            </p>
          ) : (
            <ul className="grid gap-2">
              {diagnostics.map((item, index) => (
                <li key={`${item.line}-${item.column}-${index}`}>
                  <button
                    type="button"
                    onClick={() => jumpTo(item)}
                    className="w-full text-left text-[12px] leading-snug"
                  >
                    <span
                      className="font-extrabold"
                      style={{ color: item.severity === 'error' ? 'var(--coral)' : 'var(--muted)' }}
                    >
                      {item.severity === 'error' ? '错误' : '提醒'} · 第 {item.line} 行
                    </span>
                    <span className="ml-2 text-[var(--ink)]">{item.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
