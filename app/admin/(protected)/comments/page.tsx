import type { Metadata } from 'next'
import Link from 'next/link'

import { listCommentsForModeration } from '@/lib/admin/repository'
import { COMMENT_STATUSES, type CommentStatus } from '@/lib/interactions/types'

import { moderateCommentAction } from './actions'

/**
 * 评论审核页（设计 12-admin-comments）。
 *
 * 三个刻意的选择：
 *
 * 1. **默认进入 pending**，而不是 all。这个页面的默认任务就是「处理待审核」，
 *    默认展示全部会让待审核混在已处理里，等于每次都要先筛选一次。
 * 2. **操作后保留当前筛选**（returnTo 隐藏字段）。审核完一条就跳回「全部」，
 *    会丢掉队列上下文，一次审核十条要点十次筛选。
 * 3. **目标标题优先，裸 id 兜底并标记 orphan**。互动表按设计不设外键（D-06），
 *    目标内容被删掉后评论还在，这种行必须能显示出来而不是报错。
 *
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

/**
 * 缺省进入 pending。
 *
 * 只有显式传 `status=all` 才看全部 —— 「没传参数」的语义是「我刚打开这个页面」，
 * 而打开这个页面最可能想做的事是处理待审核。
 */
function normalizeStatus(raw: string | undefined): CommentStatus | 'all' {
  if (raw === 'all') return 'all'
  if (raw === undefined || raw === '') return 'pending'
  return (COMMENT_STATUSES as readonly string[]).includes(raw) ? (raw as CommentStatus) : 'pending'
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

  // 操作完成后回到当前筛选（设计 12 §3）。
  //
  // 这里只给基础路径，不带 ok/error —— 那两个参数由 Action 用
  // `includes('?') ? '&' : '?'` 自行追加。若页面再把它们拼进来，
  // 会得到重复或错位的查询串。
  const currentListPath =
    status === 'all' ? '/admin/comments?status=all' : `/admin/comments?status=${status}`

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
        {(['pending', 'all', ...COMMENT_STATUSES] as const)
          .filter((value, index, list) => list.indexOf(value) === index)
          .map((value) => {
            const active = value === status
            return (
              <Link
                key={value}
                href={`/admin/comments?status=${value}`}
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
        <p className="text-sm text-[var(--muted)]">
          {status === 'pending' ? '没有待审核的评论。' : '该状态下没有评论。'}
        </p>
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
                    style={{ background: 'var(--cream)', color: 'var(--on-accent)' }}
                  >
                    {STATUS_LABELS[comment.status] ?? comment.status}
                  </span>
                  {/*
                    只显示「留了邮箱」这一元信息：库里存的是哈希，
                    本来就没有明文可显示，哈希本身也绝不渲染出来。
                  */}
                  {comment.hasEmail ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: 'var(--sky)', color: 'var(--ink)' }}
                      title="留言时填写了邮箱，数据库只保存哈希，无法还原明文"
                    >
                      留了邮箱
                    </span>
                  ) : null}
                  <TargetLabel
                    targetType={comment.targetType}
                    targetId={comment.targetId}
                    targetTitle={comment.targetTitle}
                  />
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
                    returnTo={currentListPath}
                  />
                ) : null}
                {comment.status !== 'rejected' ? (
                  <ActionButton
                    id={comment.id}
                    expectedStatus={comment.status}
                    status="rejected"
                    label="拒绝"
                    returnTo={currentListPath}
                  />
                ) : null}
                {comment.status !== 'deleted' ? (
                  <ActionButton
                    id={comment.id}
                    expectedStatus={comment.status}
                    status="deleted"
                    label="删除"
                    returnTo={currentListPath}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
        「删除」只是把评论标记为已删除，不做物理删除 —— 互动表按设计不设外键，
        物理删除会留下孤儿点赞与回复。删除动作也不写入公开活动流。
      </p>
    </div>
  )
}

/**
 * 目标标签。
 *
 * 有标题就显示「类型 / 标题」并链到公开页；标题为 null 说明目标已不存在
 * （orphan），此时显示裸 id 并明确标注，避免让人以为页面坏了。
 * 只有 postgres 驱动才有评论数据，因此这里的公开链接一定有效。
 */
function TargetLabel({
  targetType,
  targetId,
  targetTitle,
}: {
  targetType: string
  targetId: string
  targetTitle: string | null
}) {
  const typeLabel = targetType === 'post' ? '文章' : targetType === 'timeline_item' ? '时间轴' : targetType
  const href = targetType === 'post' ? `/posts/${targetId}` : `/timeline/${targetId}`

  if (!targetTitle) {
    return (
      <span className="text-xs font-bold" style={{ color: 'var(--coral)' }}>
        {typeLabel} / {targetId}（目标已不存在）
      </span>
    )
  }

  return (
    <Link href={href} className="text-xs font-bold text-[var(--muted)] underline">
      {typeLabel} / {targetTitle}
    </Link>
  )
}

function ActionButton({
  id,
  expectedStatus,
  status,
  label,
  returnTo,
}: {
  id: string
  expectedStatus: CommentStatus
  status: CommentStatus
  label: string
  returnTo: string
}) {
  return (
    <form action={moderateCommentAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedStatus" value={expectedStatus} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={returnTo} />
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
