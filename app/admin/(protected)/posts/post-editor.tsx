'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import { ToyButton } from '@/components/ui/toy-button'

import { savePostAction } from './actions'
import { PostBodyEditor } from './body-editor'
import { EMPTY_POST_FORM_STATE, type PostFormState } from './form-state'

/**
 * 文章编辑器（设计 15-post-editor）。
 *
 * ## 正文为什么是源码编辑器 + 预览，而不是富文本画布（决策 D-32）
 *
 * 正文的权威格式是 Markdown 源码，要被服务端编译成 HTML。所见即所得的那类
 * 编辑器把 Markdown 当导入导出格式，往返一次就会丢格式（公式、图表、代码块
 * 语言标记、表格对齐），等于把可靠的数据格式换成不可靠的中间表示。
 *
 * 所以编辑的仍然是源码，但换掉了裸 textarea：CodeMirror 提供行号、括号匹配、
 * 撤销、搜索，以及把结构问题直接标在行上的诊断通道。渲染结果由「预览」面板
 * 承担，它走的是公开文章页同一个 processor —— 预览看到的就是发布后的样子。
 *
 * ## 为什么失败时必须原地返回状态（而不是 redirect）
 *
 * 校验失败时 redirect 会让整页重渲染，刚写的正文全丢。设计 15 §8 的
 * 验收标准是「保存/发布失败不丢失正文」。
 *
 * ## 为什么所有字段都是受控的 —— 这一条曾经是错的
 *
 * 早先的实现里字段写的是 `defaultValue`（非受控），并认为「用
 * useActionState 原地返回状态就能保住输入」。**这个判断不成立**：
 * React 19 在 `<form action={fn}>` 提交完成后会**自动重置表单**（等价于
 * 调用 `form.reset()`），非受控字段会被重置回 `defaultValue`。
 * 结果是：填好正文、日期格式打错、点保存 → 服务端返回校验错误 →
 * 页面跳一下、**正文清空**。
 *
 * 受控 + `value` 则不受 `form.reset()` 影响（React 在重置后会重新把
 * state 的值写回 DOM），这是 React 官方对 action 表单的已知行为。
 * 代价是每个字段要多一个 state，但换来的是「失败不丢稿」这条硬要求。
 *
 * 另外：**不要在服务端返回时用 `initial` 覆盖 state**。`initial` 是页面
 * 首次渲染的库内值，用户正在编辑的是 state；两者只能初始化时对齐一次。
 */

const inputStyle = { borderColor: 'var(--line)', background: 'var(--surface)' } as const

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={htmlFor} className="text-[12px] font-extrabold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-[var(--muted)]">{hint}</p> : null}
    </div>
  )
}

export type PostEditorInitial = {
  slug: string
  title: string
  summary: string
  cover: string
  coverAlt: string
  tags: string
  category: string
  featured: boolean
  status: string
  publishedAt: string
  body: string
  /** 空字符串表示新建。 */
  expectedVersion: string
}

export function PostEditor({
  initial,
  isNew,
  flash,
}: {
  initial: PostEditorInitial
  isNew: boolean
  flash: { ok?: string; error?: string } | null
}) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    savePostAction,
    EMPTY_POST_FORM_STATE,
  )

  // 全部字段受控：失败时 DOM 不会被表单重置清空。
  const [title, setTitle] = useState(initial.title)
  const [summary, setSummary] = useState(initial.summary)
  const [body, setBody] = useState(initial.body)
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt)
  const [category, setCategory] = useState(initial.category)
  const [tags, setTags] = useState(initial.tags)
  const [cover, setCover] = useState(initial.cover)
  const [coverAlt, setCoverAlt] = useState(initial.coverAlt)
  const [featured, setFeatured] = useState(initial.featured)

  const [dirty, setDirty] = useState(false)

  // 有未保存修改时提醒一次。用 beforeunload 而不是拦截站内路由跳转：
  // 前者覆盖关标签、刷新、强制关闭，后者只覆盖站内点击。
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const fieldStyle = (name: string) =>
    ({
      ...inputStyle,
      borderColor: state.field === name ? 'var(--coral)' : 'var(--line)',
    }) as const

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start"
    >
      {/*
        slug 由服务端生成（决策 D-31），界面没有输入框。
        编辑态用 hidden 把原值带回，仅作为定位条件；新建态完全不传，
        服务端在 upsertPost 里现生成一个。
      */}
      {isNew ? null : <input type="hidden" name="slug" value={initial.slug} />}
      <input type="hidden" name="expectedVersion" value={initial.expectedVersion} />

      {/* 左：主编辑区 */}
      <div className="grid min-w-0 gap-4">
        {flash?.ok === 'saved' ? (
          <p
            role="status"
            className="rounded-xl border px-3 py-2 text-sm font-bold"
            style={{ borderColor: 'var(--mint)' }}
          >
            已保存。
          </p>
        ) : null}

        {state.error ? (
          <p
            role="alert"
            className="rounded-xl border px-3 py-2 text-sm font-bold"
            style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
          >
            {state.error}
          </p>
        ) : null}

        {flash?.error === 'conflict' ? (
          <p
            role="alert"
            className="rounded-xl border px-3 py-2 text-sm font-bold"
            style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
          >
            这篇文章已被其他操作修改。请刷新页面查看最新内容后再改。
          </p>
        ) : null}

        {flash?.error === 'not_found' ? (
          <p
            role="alert"
            className="rounded-xl border px-3 py-2 text-sm font-bold"
            style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
          >
            文章不存在，可能已被删除。
          </p>
        ) : null}

        <Field label="标题" htmlFor="post-title">
          <input
            id="post-title"
            name="title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
            className="rounded-xl border px-3 py-2 text-sm"
            style={fieldStyle('title')}
          />
        </Field>

        <Field
          label="摘要"
          htmlFor="post-summary"
          hint="会出现在列表、搜索结果与分享卡片里，不自动从正文截取。草稿可留空。"
        >
          <textarea
            id="post-summary"
            name="summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={2}
            maxLength={500}
            className="rounded-xl border px-3 py-2 text-sm leading-relaxed"
            style={fieldStyle('summary')}
          />
        </Field>

        <div className="grid gap-2">
          <p className="text-[12px] font-extrabold">正文（Markdown）</p>
          <p className="text-[11px] leading-snug text-[var(--muted)]">
            Markdown + GFM，支持 $行内公式$、$$公式块$$ 与 ```mermaid 图表。
            结构问题会标在行号旁；草稿允许不完整，发布时才做编译校验。
          </p>
          {/*
            隐藏字段承担表单提交：CodeMirror 是 contenteditable，不是表单控件，
            它不会自己进入 FormData。body 仍然是受控的，隐藏字段只是把 state
            同步成可提交的值。
          */}
          <input type="hidden" name="body" value={body} />
          <PostBodyEditor
            value={body}
            onChange={setBody}
            invalid={state.field === 'body'}
          />
        </div>

        {/* 窄屏：操作按钮跟在正文后面，不用滚回顶部 */}
        <div className="flex flex-wrap gap-2 lg:hidden">
          <ToyButton type="submit" name="intent" value="draft" size="small" variant="cream">
            保存草稿
          </ToyButton>
          <ToyButton type="submit" name="intent" value="publish" size="small">
            发布
          </ToyButton>
        </div>
      </div>

      {/* 右：设置栏。窄屏堆到下面，不做抽屉 —— 一个没做完的抽屉
          （焦点陷阱、滚动锁定）比一个直接堆叠的列表更糟。 */}
      <aside className="grid gap-4">
        <div
          className="grid gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          <p className="text-[12px] font-extrabold">发布</p>

          {isNew ? (
            <div className="grid gap-1">
              <p className="text-[12px] font-extrabold">网址标识</p>
              <p className="text-[11px] leading-snug text-[var(--muted)]">
                保存时自动生成（形如 post-3f9a2b1c5d7e），不需要填。生成后不会变，
                改标题也不影响已有链接。
              </p>
            </div>
          ) : (
            <div className="grid gap-1">
              <p className="text-[12px] font-extrabold">网址标识</p>
              <p className="break-all text-[12px] text-[var(--muted)]">{initial.slug}</p>
              <p className="text-[11px] leading-snug text-[var(--muted)]">
                由系统生成，不可修改（改网址会让已有链接失效）。
              </p>
            </div>
          )}

          <Field label="发布日期" htmlFor="post-published-at" hint="格式 YYYY-MM-DD，草稿可留空">
            <input
              id="post-published-at"
              name="publishedAt"
              type="date"
              value={publishedAt}
              onChange={(event) => setPublishedAt(event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={fieldStyle('publishedAt')}
            />
          </Field>

          <label className="flex items-center gap-2 text-[12px] font-bold">
            <input
              type="checkbox"
              name="featured"
              checked={featured}
              onChange={(event) => setFeatured(event.target.checked)}
              className="h-4 w-4"
            />
            精选
          </label>

          <div className="hidden flex-wrap gap-2 lg:flex">
            <ToyButton type="submit" name="intent" value="draft" size="small" variant="cream">
              保存草稿
            </ToyButton>
            <ToyButton type="submit" name="intent" value="publish" size="small">
              发布
            </ToyButton>
          </div>

          <p aria-live="polite" className="text-[11px] text-[var(--muted)]">
            {pending ? '保存中…' : dirty ? '有未保存的修改' : '暂无修改'}
          </p>
        </div>

        <div
          className="grid gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          <p className="text-[12px] font-extrabold">分类与标签</p>

          <Field label="分类" htmlFor="post-category">
            <input
              id="post-category"
              name="category"
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </Field>

          <Field label="标签" htmlFor="post-tags" hint="一行一个，或用逗号分隔。">
            <textarea
              id="post-tags"
              name="tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              rows={3}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </Field>
        </div>

        <div
          className="grid gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          <p className="text-[12px] font-extrabold">封面</p>

          <Field label="封面图片地址" htmlFor="post-cover" hint="可留空。填了就必须填下面的替代文字。">
            <input
              id="post-cover"
              name="cover"
              type="text"
              value={cover}
              onChange={(event) => setCover(event.target.value)}
              placeholder="/images/..."
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </Field>

          <Field
            label="封面替代文字"
            htmlFor="post-cover-alt"
            hint="描述图片内容，供屏幕阅读器使用（无障碍要求）。"
          >
            <input
              id="post-cover-alt"
              name="coverAlt"
              type="text"
              value={coverAlt}
              onChange={(event) => setCoverAlt(event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={fieldStyle('coverAlt')}
            />
          </Field>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          保存后这篇正文的权威来源会标记为「后台编辑」，`npm run db:import`
          会跳过它，不会用 Markdown 文件覆盖你在网页上写的内容。
        </p>

        <Link href="/admin/posts" className="text-xs font-bold text-[var(--muted)] underline">
          <Icon name="arrow_back" size={12} /> 返回文章列表
        </Link>
      </aside>
    </form>
  )
}
