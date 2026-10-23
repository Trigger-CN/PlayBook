import Link from 'next/link'

import { cacheTags } from '@/lib/cache/tags'
import { getDataPorts, hasDatabaseUrl } from '@/lib/data'

/**
 * 最近活跃（设计 module 09 §4、路线图 Phase 7）。
 *
 * 这是 Server Component：活动列表在服务端读取，客户端不额外发请求。
 * 无数据库时整块不渲染 —— 不显示假的空列表，也不显示「暂无数据」这种
 * 会被误读为「真的没有活动」的文案。
 *
 * 事件类型 → 中文说明的映射放在这里而不是 config，因为它是纯展示文案，
 * 且必须与 lib/activity/events.ts 的枚举保持一一对应。
 */

const EVENT_LABELS: Record<string, string> = {
  post_created: '新建文章',
  post_updated: '更新文章',
  post_published: '发布文章',
  timeline_created: '新建时间轴',
  timeline_updated: '更新时间轴',
  timeline_published: '发布时间轴',
  comment_approved: '通过评论',
  view_milestone_reached: '浏览量里程碑',
}

function formatRelative(iso: string): string {
  const created = new Date(iso).getTime()
  if (Number.isNaN(created)) return ''
  const diffMinutes = Math.floor((Date.now() - created) / 60_000)
  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const hours = Math.floor(diffMinutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return iso.slice(0, 10)
}

function targetHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetType || !targetId) return null
  return targetType === 'post' ? `/posts/${targetId}` : `/timeline/${targetId}`
}

export async function ActivityFeed({ limit = 8 }: { limit?: number }) {
  if (!hasDatabaseUrl()) return null

  const entries = await getDataPorts().stats.listRecentActivity(limit)
  if (entries.length === 0) {
    return (
      <p
        className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-[var(--muted)]"
        style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
      >
        还没有活动记录。发表文章、发布节点或收到第一条评论后会出现在这里。
      </p>
    )
  }

  return (
    <ol className="grid gap-2.5">
      {entries.map((entry, index) => {
        const href = targetHref(entry.targetType, entry.targetId)
        const label = EVENT_LABELS[entry.eventType] ?? entry.eventType
        const content = (
          <>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: 'var(--cream)', color: 'var(--on-accent)' }}>
              {label}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {entry.title ?? entry.targetId ?? '站点'}
            </span>
            <time dateTime={entry.createdAt} className="shrink-0 text-xs font-bold text-[var(--muted)]">
              {formatRelative(entry.createdAt)}
            </time>
          </>
        )

        return (
          <li
            key={`${entry.eventType}-${entry.targetId ?? 'site'}-${entry.createdAt}-${index}`}
            className="rounded-xl border px-4 py-2.5"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            {href ? (
              <Link href={href} className="flex items-center gap-3 hover:text-[var(--ink)]">
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-3">{content}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** 供其他页面复用的缓存 tag（保持 tag 只在 lib/cache 里定义）。 */
export const activityCacheTag = cacheTags.statsPublic
