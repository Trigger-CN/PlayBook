import type { Metadata } from 'next'
import Link from 'next/link'

import {
  getAdminOverview,
  listActivityLog,
  listAuditLog,
  listPostsForAdmin,
  listRecentComments,
} from '@/lib/admin/repository'
import { Icon } from '@/components/ui/icon'
import { StatBlock } from '@/components/ui/stat-block'

/**
 * 后台概览（设计 09-admin-dashboard）。
 *
 * 只显示操作需要的数字，不做花哨图表 —— 后台是重复工作场景。
 *
 * 结构上是「先告诉你要做什么，再告诉你发生了什么」：
 * 待办条 → 关键数字 → 最近内容 → 最近评论 → 最近操作。
 * 待办条的每一项都链到带筛选的页面（`?status=pending` 等），
 * 点进去就是那份列表，而不是再让人手动筛一次。
 */
export const metadata: Metadata = { title: '概览' }

/**
 * 内容事件的短标签。
 *
 * 仪表盘只关心「内容变了」这一类，因此只列 8 种 post_* / timeline_* 事件；
 * 其余事件（评论、点赞、里程碑）不在「最近内容变更」里展示。
 */
const CONTENT_EVENT_LABELS: Record<string, string> = {
  post_created: '创建文章',
  post_updated: '更新文章',
  post_published: '发布文章',
  post_archived: '归档文章',
  timeline_created: '创建节点',
  timeline_updated: '更新节点',
  timeline_published: '发布节点',
  timeline_archived: '下线节点',
}

function formatTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

export default async function AdminDashboardPage() {
  const [overview, audit, recentPosts, recentComments, recentActivity] = await Promise.all([
    getAdminOverview(),
    listAuditLog(10),
    listPostsForAdmin(),
    listRecentComments(5),
    listActivityLog({ limit: 8 }),
  ])

  // 待办只列真正需要动作的项。0 项时不显示整条，
  // 而不是显示一排「0」—— 那会让人每次都读一遍才确认没事可做。
  const todos: Array<{ label: string; href: string; tone: string }> = []
  if (overview.pendingComments > 0) {
    todos.push({
      label: `${overview.pendingComments} 条评论待审核`,
      href: '/admin/comments?status=pending',
      tone: 'var(--coral)',
    })
  }
  const draftPosts = recentPosts.filter((post) => post.status === 'draft').length
  if (draftPosts > 0) {
    todos.push({
      label: `${draftPosts} 篇文章仍是草稿`,
      href: '/admin/posts?status=draft',
      tone: 'var(--cream)',
    })
  }
  if (overview.draftTimeline > 0) {
    todos.push({
      label: `${overview.draftTimeline} 个时间轴节点未发布`,
      href: '/admin/timeline?status=draft',
      tone: 'var(--sky)',
    })
  }

  // 最近变更只看「内容」事件：点赞与里程碑是访客行为，
  // 放在「最近内容变更」里会淹没真正需要复核的编辑动作。
  const contentActivity = recentActivity.filter((row) =>
    row.eventType.startsWith('post_') || row.eventType.startsWith('timeline_'),
  )

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl">概览</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          待办条目会直接链到对应的筛选结果，不需要再手动筛一次。
        </p>
      </header>

      {todos.length > 0 ? (
        <section aria-labelledby="todo-title" className="mb-6">
          <h2 id="todo-title" className="sr-only">
            待办
          </h2>
          <ul className="grid gap-1.5">
            {todos.map((todo) => (
              <li key={todo.href}>
                <Link
                  href={todo.href}
                  className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm font-bold"
                  style={{ borderColor: 'var(--line)', background: todo.tone }}
                >
                  <span style={{ color: 'var(--on-accent)' }}>{todo.label}</span>
                  <span aria-hidden="true" style={{ color: 'var(--on-accent)' }}>
                    去处理 <Icon name="arrow_forward" size={13} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p
          className="mb-6 rounded-xl border px-4 py-2.5 text-sm font-bold"
          style={{ borderColor: 'var(--line)', background: 'var(--mint)', color: 'var(--on-accent)' }}
        >
          当前没有待办事项。
        </p>
      )}

      <div className="stats">
        <StatBlock value={String(overview.pendingComments)} label="待审核评论" tone="coral" />
        <StatBlock value={String(overview.approvedComments)} label="已通过评论" tone="mint" />
        <StatBlock value={String(overview.totalLikes)} label="累计点赞" tone="cream" />
        <StatBlock value={String(overview.totalViews)} label="累计浏览" tone="sky" />
      </div>

      <div className="stats mt-4">
        <StatBlock value={String(overview.publishedTimeline)} label="已发布节点" tone="mint" />
        <StatBlock value={String(overview.draftTimeline)} label="草稿节点" tone="cream" />
        <StatBlock value={String(overview.postsTotal)} label="已发布文章" tone="sky" />
        <StatBlock value={String(overview.totalComments)} label="评论总数" tone="coral" />
      </div>

      <section className="mt-8" aria-labelledby="admin-actions-title">
        <h2 id="admin-actions-title" className="font-display text-xl">
          常用操作
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/admin/comments?status=pending"
            className="rounded-xl border px-4 py-2.5 text-sm font-bold"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            审核评论
            {overview.pendingComments > 0 ? (
              <span
                className="ml-2 rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: 'var(--coral)', color: 'var(--on-accent)' }}
              >
                {overview.pendingComments}
              </span>
            ) : null}
          </Link>
          <Link
            href="/admin/timeline"
            className="rounded-xl border px-4 py-2.5 text-sm font-bold"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            管理时间轴
          </Link>
          <Link
            href="/admin/activity"
            className="rounded-xl border px-4 py-2.5 text-sm font-bold"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            查看活动日志
          </Link>
          <Link
            href="/admin/analytics"
            className="rounded-xl border px-4 py-2.5 text-sm font-bold"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            查看分析
          </Link>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="content-title">
          <h2 id="content-title" className="font-display text-xl">
            最近内容变更
          </h2>
          {contentActivity.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              还没有内容变更记录。新建或编辑时间轴节点后会出现在这里。
            </p>
          ) : (
            <ul className="mt-3 grid gap-1.5">
              {contentActivity.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
                >
                  <span className="min-w-0 truncate">
                    <b>{CONTENT_EVENT_LABELS[row.eventType] ?? row.eventType}</b>
                    {row.title ? <span className="ml-1 text-[var(--muted)]">{row.title}</span> : null}
                  </span>
                  <time dateTime={row.createdAt} className="text-[var(--muted)]">
                    {formatTime(row.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            完整流水见{' '}
            <Link href="/admin/activity" className="underline">
              活动日志
            </Link>
            。
          </p>
        </section>

        <section aria-labelledby="comments-title">
          <h2 id="comments-title" className="font-display text-xl">
            最近评论
          </h2>
          {recentComments.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">还没有评论。</p>
          ) : (
            <ul className="mt-3 grid gap-1.5">
              {recentComments.map((comment) => (
                <li
                  key={comment.id}
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <b>{comment.authorName}</b>
                      <span className="ml-1.5 text-[var(--muted)]">
                        {comment.targetTitle ?? `${comment.targetType} / ${comment.targetId}`}
                      </span>
                    </span>
                    <span className="text-[var(--muted)]">{comment.status}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[var(--muted)]">{comment.content}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            去{' '}
            <Link href="/admin/comments?status=pending" className="underline">
              评论审核
            </Link>{' '}
            处理待审核项。
          </p>
        </section>
      </div>

      <section className="mt-8" aria-labelledby="audit-title">
        <h2 id="audit-title" className="font-display text-xl">
          最近操作
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          这是管理员动作的审计记录（含被拒绝的请求），与上面的公开活动流是两回事。
        </p>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">还没有操作记录。</p>
        ) : (
          <ul className="mt-3 grid gap-1.5">
            {audit.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
              >
                <b>{entry.action}</b>
                <span className="text-[var(--muted)]">{entry.actorEmail}</span>
                {entry.targetId ? (
                  <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                    <Icon name="arrow_forward" size={11} /> {entry.targetId}
                  </span>
                ) : null}
                <time dateTime={entry.createdAt} className="ml-auto text-[var(--muted)]">
                  {formatTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
