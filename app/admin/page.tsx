import type { Metadata } from 'next'
import Link from 'next/link'

import { getAdminOverview, listAuditLog } from '@/lib/admin/repository'
import { StatBlock } from '@/components/ui/stat-block'

/**
 * 后台概览（设计 09-admin-dashboard）。
 * 只显示操作需要的数字，不做花哨图表 —— 后台是重复工作场景。
 */
export const metadata: Metadata = { title: '概览' }

export default async function AdminDashboardPage() {
  const [overview, audit] = await Promise.all([getAdminOverview(), listAuditLog(10)])

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl">概览</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          待审核评论需要处理时，评论页会显示数量。
        </p>
      </header>

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
            href="/admin/comments"
            className="rounded-xl border px-4 py-2.5 text-sm font-bold"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            审核评论
            {overview.pendingComments > 0 ? (
              <span className="ml-2 rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'var(--coral)' }}>
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
        </div>
      </section>

      <section className="mt-8" aria-labelledby="audit-title">
        <h2 id="audit-title" className="font-display text-xl">
          最近操作
        </h2>
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
                  <span className="text-[var(--muted)]">→ {entry.targetId}</span>
                ) : null}
                <time dateTime={entry.createdAt} className="ml-auto text-[var(--muted)]">
                  {entry.createdAt.slice(0, 16).replace('T', ' ')}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
