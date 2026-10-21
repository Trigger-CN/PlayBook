'use client'

import { useId, useRef, useState } from 'react'

import { ToyButton } from '@/components/ui/toy-button'
import {
  COMMENT_MAX_LENGTH,
  COMMENT_NAME_MAX_LENGTH,
  type PublicComment,
  type TargetType,
} from '@/lib/interactions/types'

/**
 * 评论区（设计 module 06 §8）。
 *
 * 关键决策：评论不做「乐观插入」。
 * 因为新评论默认 pending、不会立刻公开，乐观插入会让访客以为自己评论
 * 已经出现在列表里，随后又消失 —— 那是更差的体验（module 06 §8）。
 *
 * 状态机：idle → submitting → success | error。
 * 失败时保留已填内容（module 06 §10「不丢输入」）。
 */

type Props = {
  targetType: TargetType
  targetId: string
  /** 服务端读到的已审核评论，避免首屏空列表闪烁。 */
  initialComments: PublicComment[]
  initialTotal: number
  enabled?: boolean
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

function formatDate(iso: string): string {
  // 只取日期部分，避免把服务器时区差异暴露给访客。
  return iso.slice(0, 10)
}

export function CommentSection({
  targetType,
  targetId,
  initialComments,
  initialTotal,
  enabled = true,
}: Props) {
  const [comments] = useState<PublicComment[]>(initialComments)
  const [total] = useState<number>(initialTotal)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const nameId = useId()
  const emailId = useId()
  const contentId = useId()
  const errorId = useId()

  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!enabled || status === 'submitting') return

    const authorName = nameRef.current?.value.trim() ?? ''
    const authorEmail = emailRef.current?.value.trim() ?? ''
    const content = contentRef.current?.value.trim() ?? ''

    // 客户端即时校验（module 06 §3 第 2 步）；服务端会再校验一次。
    const errors: Record<string, string> = {}
    if (authorName.length === 0) errors.authorName = '请填写昵称'
    if (authorName.length > COMMENT_NAME_MAX_LENGTH)
      errors.authorName = `昵称不能超过 ${COMMENT_NAME_MAX_LENGTH} 字`
    if (content.length === 0) errors.content = '请填写评论内容'
    if (content.length > COMMENT_MAX_LENGTH) errors.content = `评论不能超过 ${COMMENT_MAX_LENGTH} 字`

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setStatus('error')
      setMessage('请检查标红的输入项')
      // 失败时把焦点送到错误摘要（module 06 §8）。
      errorRef.current?.focus()
      return
    }

    setFieldErrors({})
    setStatus('submitting')
    setMessage(null)

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId,
          authorName,
          content,
          ...(authorEmail ? { authorEmail } : {}),
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; details?: Array<{ field: string; message: string }> }
        | null

      if (!response.ok) {
        if (payload?.details?.length) {
          const mapped: Record<string, string> = {}
          for (const detail of payload.details) mapped[detail.field] = detail.message
          setFieldErrors(mapped)
        }
        throw new Error(payload?.message ?? '提交失败，请稍后再试')
      }

      // 只有服务端确认后才清空正文（module 06 §8）。
      if (contentRef.current) contentRef.current.value = ''
      if (emailRef.current) emailRef.current.value = ''
      setStatus('success')
      setMessage(payload?.message ?? '评论已提交，将在审核后显示。')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : '提交失败，请稍后再试')
      errorRef.current?.focus()
    }
  }

  return (
    <section className="mt-12" aria-labelledby="comments-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="comments-title" className="font-display text-2xl">
          评论
        </h2>
        <span className="text-xs font-bold text-[var(--muted)]">{total} 条已通过审核</span>
      </div>

      {comments.length === 0 ? (
        <p
          className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-[var(--muted)]"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          还没有评论，来写第一条吧。
        </p>
      ) : (
        <ul className="grid gap-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-2xl border px-5 py-4"
              style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b className="text-sm">{comment.authorName}</b>
                <time dateTime={comment.createdAt} className="text-xs font-bold text-[var(--muted)]">
                  {formatDate(comment.createdAt)}
                </time>
              </div>
              {/* 纯文本渲染并保留换行；MVP 不解析 Markdown/HTML（module 06 §7）。 */}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-7 rounded-2xl border p-5" style={{ borderColor: 'var(--line)' }} noValidate>
        <h3 className="font-display text-lg">写一条评论</h3>
        <p className="mt-1 text-xs font-bold text-[var(--muted)]">
          评论需要审核后才会公开显示。
        </p>

        {!enabled ? (
          <p className="mt-4 text-sm font-bold text-[var(--muted)]">
            评论功能需要数据库支持，配置 DATABASE_URL 后可用。
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={nameId} className="mb-1 block text-xs font-extrabold">
                  昵称 <span aria-hidden="true">*</span>
                </label>
                <input
                  id={nameId}
                  ref={nameRef}
                  name="authorName"
                  maxLength={COMMENT_NAME_MAX_LENGTH}
                  required
                  aria-invalid={fieldErrors.authorName ? true : undefined}
                  aria-describedby={fieldErrors.authorName ? `${errorId}-name` : undefined}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: fieldErrors.authorName ? 'var(--coral)' : 'var(--line)' }}
                />
                {fieldErrors.authorName ? (
                  <p id={`${errorId}-name`} className="mt-1 text-xs font-bold text-[var(--coral)]">
                    {fieldErrors.authorName}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor={emailId} className="mb-1 block text-xs font-extrabold">
                  邮箱（可选，不公开）
                </label>
                <input
                  id={emailId}
                  ref={emailRef}
                  name="authorEmail"
                  type="email"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--line)' }}
                />
                <p className="mt-1 text-xs text-[var(--muted)]">只用于识别，服务端仅保存哈希。</p>
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor={contentId} className="mb-1 block text-xs font-extrabold">
                评论内容 <span aria-hidden="true">*</span>
              </label>
              <textarea
                id={contentId}
                ref={contentRef}
                name="content"
                rows={4}
                maxLength={COMMENT_MAX_LENGTH}
                required
                aria-invalid={fieldErrors.content ? true : undefined}
                aria-describedby={fieldErrors.content ? `${errorId}-content` : undefined}
                className="w-full rounded-xl border px-3 py-2 text-sm leading-relaxed"
                style={{ borderColor: fieldErrors.content ? 'var(--coral)' : 'var(--line)' }}
              />
              <div className="mt-1 flex flex-wrap justify-between gap-2">
                {fieldErrors.content ? (
                  <p id={`${errorId}-content`} className="text-xs font-bold text-[var(--coral)]">
                    {fieldErrors.content}
                  </p>
                ) : (
                  <span className="text-xs text-[var(--muted)]">
                    纯文本，不支持 Markdown 或 HTML。
                  </span>
                )}
                <span className="text-xs text-[var(--muted)]">上限 {COMMENT_MAX_LENGTH} 字</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ToyButton type="submit" size="small" loading={status === 'submitting'}>
                提交评论
              </ToyButton>
              <p
                id={errorId}
                ref={errorRef}
                tabIndex={-1}
                role="status"
                aria-live="polite"
                className="text-xs font-bold"
                style={{ color: status === 'error' ? 'var(--coral)' : 'var(--muted)' }}
              >
                {message ?? ''}
              </p>
            </div>
          </>
        )}
      </form>
    </section>
  )
}
