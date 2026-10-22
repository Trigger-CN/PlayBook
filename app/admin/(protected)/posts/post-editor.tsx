'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'

import { ToyButton } from '@/components/ui/toy-button'

import { savePostAction } from './actions'
import { EMPTY_POST_FORM_STATE, type PostFormState } from './form-state'

/**
 * 文章编辑器（设计 15-post-editor）。
 *
 * ## 为什么是「原生表单 + 文本域」而不是富文本组件
 *
 * 设计 15 §7 要求「Markdown 预览不是唯一编辑方式，文本区始终可用」。
 * 纯文本域天然满足这条，还保住浏览器自带的撤销、拼写检查、输入法与
 * 粘贴行为 —— 自制富文本最容易在这些地方出问题。
 *
 * ## 为什么用 useActionState 而不是 redirect 报错
 *
 * 校验失败时 redirect 会让整页重渲染，刚写的正文全丢。设计 15 §8 的
 * 验收标准是「保存/发布失败不丢失正文」，因此失败必须原地返回状态。
 *
 * ## 刻意没做的（设计里有）
 *
 * - 自动保存（§3.2）：需要草稿版本表与限频 Server Action，单独一块工作。
 *   当前用「离开页面前提示」作为替代，避免误关丢稿。
 * - 实时预览（§3.3）：MDX 只在服务端编译，预览需要额外的受保护路由。
 * - 富文本工具栏（§2.1 第 3 条）：会诱使作者以为具备富文本能力，而实际
 *   只有纯文本域 —— 一个点不动的工具栏比没有更差。
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
        slug 的处理是新建与编辑的分水岭：
          - 新建：必须可编辑，且要有 name="slug" 才会被提交。
          - 编辑：不可改（改 slug 需要重定向规划），用 hidden 提交原值。
        曾经把两者都写成 hidden，导致新建的文章 slug 永远为空 —— 一个
        必然失败的入口比没有入口更糟。
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
            defaultValue={initial.title}
            maxLength={200}
            required
            className="rounded-xl border px-3 py-2 text-sm"
            style={fieldStyle('title')}
          />
        </Field>

        <Field
          label="摘要"
          htmlFor="post-summary"
          hint="会出现在列表、搜索结果与分享卡片里，不自动从正文截取。"
        >
          <textarea
            id="post-summary"
            name="summary"
            defaultValue={initial.summary}
            rows={2}
            maxLength={500}
            required
            className="rounded-xl border px-3 py-2 text-sm leading-relaxed"
            style={fieldStyle('summary')}
          />
        </Field>

        <Field
          label="正文（MDX）"
          htmlFor="post-body"
          hint="支持 Markdown 与 GFM 表格；只有这个文本域，没有富文本工具栏。草稿允许不完整，发布时才做编译校验。"
        >
          <textarea
            id="post-body"
            name="body"
            defaultValue={initial.body}
            rows={22}
            className="rounded-xl border px-3 py-2 font-mono text-[13px] leading-relaxed"
            style={fieldStyle('body')}
          />
        </Field>

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
            <Field
              label="slug（网址标识）"
              htmlFor="post-slug"
              hint="小写字母、数字与连字符，例如 hello-world。建好后不可修改。"
            >
              <input
                id="post-slug"
                name="slug"
                type="text"
                defaultValue={initial.slug}
                maxLength={120}
                required
                placeholder="hello-world"
                className="rounded-xl border px-3 py-2 text-sm"
                style={fieldStyle('slug')}
              />
            </Field>
          ) : (
            <div className="grid gap-1">
              <p className="text-[12px] font-extrabold">slug</p>
              <p className="break-all text-[12px] text-[var(--muted)]">{initial.slug}</p>
              <p className="text-[11px] leading-snug text-[var(--muted)]">
                已创建，不可修改（改 slug 需要规划重定向）。
              </p>
            </div>
          )}

          <Field label="发布日期" htmlFor="post-published-at" hint="格式 YYYY-MM-DD">
            <input
              id="post-published-at"
              name="publishedAt"
              type="date"
              defaultValue={initial.publishedAt}
              required
              className="rounded-xl border px-3 py-2 text-sm"
              style={fieldStyle('publishedAt')}
            />
          </Field>

          <label className="flex items-center gap-2 text-[12px] font-bold">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={initial.featured}
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
              defaultValue={initial.category}
              className="rounded-xl border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </Field>

          <Field label="标签" htmlFor="post-tags" hint="一行一个，或用逗号分隔。">
            <textarea
              id="post-tags"
              name="tags"
              defaultValue={initial.tags}
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
              defaultValue={initial.cover}
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
              defaultValue={initial.coverAlt}
              className="rounded-xl border px-3 py-2 text-sm"
              style={fieldStyle('coverAlt')}
            />
          </Field>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          保存后这篇正文的权威来源会标记为「后台编辑」，`npm run db:import`
          会跳过它，不会用 MDX 文件覆盖你在网页上写的内容。
        </p>

        <Link href="/admin/posts" className="text-xs font-bold text-[var(--muted)] underline">
          ← 返回文章列表
        </Link>
      </aside>
    </form>
  )
}
