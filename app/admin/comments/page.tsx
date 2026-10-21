import type { Metadata } from 'next'
import Link from 'next/link'

import { listCommentsForModeration } from '@/lib/admin/repository'
import { COMMENT_STATUSES, type CommentStatus } from '@/lib/interactions/types'

import { moderateCommentAction } from './actions'

/**
 * 评论审核页（设计 12-admin-comments）。
 *
 * 用 searchParams 做状态筛选（后台是 Dynamic，不存在 SSG 顾虑）。
 * 审核按钮都是 <form> + Server Action，不是 GET 链接 ——
 * 避免邮件/聊天工具预取链接导致误操作。
 */
export const metadata: Metadata = { title: '评论审核' }

type Props = {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>
}

const STATUS_LABELS: Record<string, string> = {
  all: '全部',
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  deleted: '已删除',
}

function normalizeStatus(raw: string | undefined): CommentStatus | 'all' {
  if (raw === 'all' || raw === undefined) return 'all'
  return (COMMENT_STATUSES as readonly string[]).includes(raw) ? (raw as CommentStatus) : 'all'
}

function errorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'conflict':
      return '该评论状态已被其他操作改变，请刷新后重试。'
    case 'not_found':
      return '评论不存在，可能已被删除。'
    case 'invalid':
      return '请求参数不合法。'
    default:
      return null
  }
}

export default async function AdminCommentsPage({ searchParams }: Props) {
  const { status: statusParam, ok, error } = await searchParams
  const status = normalizeStatus(statusParam)
  const comments = await listCommentsForModeration(status, 100)
  const err = errorMessage(error)

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl">评论审核</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          新评论默认待审核，通过后才会显示在公开页面上。
        </p>
      </header>

      {err ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
        >
          {err}
        </p>
      ) : null}
      {ok ? (
        <p
          role="status"
          className="mb-4 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: 'var(--mint)' }}
        >
          操作成功：{STATUS_LABELS[ok] ?? ok}
        </p>
      ) : null}

      <nav aria-label="按状态筛选" className="mb-5 flex flex-wrap gap-1.5">
        {(['all', ...COMMENT_STATUSES] as const).map((value) => {
          const active = value === status
          return (
            <Link
              key={value}
              href={value === 'all' ? '/admin/comments' : `/admin/comments?status=${value}`}
              aria-current={active ? 'page' : undefined}
              className="rounded-full px-3 py-1.5 text-xs font-extrabold"
              style={{
                background: active ? 'var(--ink)' : 'var(--surface)',
                color: active ? 'var(--canvas)' : 'var(--muted)',
                border: '1px solid var(--line)',
              }}
            >
              {STATUS_LABELS[value] ?? value}
            </Link>
          )
        })}
      </nav>

      {comments.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">该状态下没有评论。</p>
      ) : (
        <ul className="grid gap-2.5">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-xl border p-4"
              style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <b className="text-sm">{comment.authorName}</b>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                    style={{ background: 'var(--cream)', color: '#4a2d11' }}
                  >
                    {STATUS_LABELS[comment.status] ?? comment.status}
                  </span>
                  <Link
                    href={
                      comment.targetType === 'post'
                        ? `/posts/${comment.targetId}`
                        : `/timeline/${comment.targetId}`
                    }
                    className="text-xs font-bold text-[var(--muted)] underline"
                  >
                    {comment.targetType} / {comment.targetId}
                  </Link>
                </div>
                <time dateTime={comment.createdAt} className="text-xs text-[var(--muted)]">
                  {comment.createdAt.slice(0, 16).replace('T', ' ')}
                </time>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {comment.status !== 'approved' ? (
                  <ActionButton
                    id={comment.id}
                    expectedStatus={comment.status}
                    status="approved"
                    label="通过"
                  />
                ) : null}
                {comment.status !== 'rejected' ? (
                  <ActionButton
                    id={comment.id}
                    expectedStatus={comment.status}
                    status="rejected"
                    label="拒绝"
                  />
                ) : null}
                {comment.status !== 'deleted' ? (
                  <ActionButton
                    id={comment.id}
                    expectedStatus={comment.status}
                    status="deleted"
                    label="删除"
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ActionButton({
  id,
  expectedStatus,
  status,
  label,
}: {
  id: string
  expectedStatus: CommentStatus
  status: CommentStatus
  label: string
}) {
  return (
    <form action={moderateCommentAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedStatus" value={expectedStatus} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="rounded-lg border px-3 py-1.5 text-xs font-extrabold"
        style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
      >
        {label}
      </button>
    </form>
  )
}
