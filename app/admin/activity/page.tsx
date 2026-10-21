import type { Metadata } from 'next'
import Link from 'next/link'

import { countActivityByType, listActivityLog, type ActivityLogRow } from '@/lib/admin/repository'
import {
  ACTIVITY_EVENT_TYPES,
  isPublicActivityEvent,
  type ActivityEventType,
} from '@/lib/activity/events'

/**
 * 活动日志页（设计 09 与 roadmap §11 的交付项）。
 *
 * ## 为什么需要一个独立页面
 *
 * 公开首页的「最近活跃」只显示 8 种公开事件（见 `PUBLIC_EVENT_TYPES`），
 * 而且不带任何操作者与目标上下文。审核通过、拒绝、归档、点赞这些动作
 * 在公开页上要么看不见、要么只剩一句「通过了评论」。
 * 这个页面的用途是回答「最近到底发生了什么」，因此它读的是全量
 * `activity_events`，包括那些不进公开流的事件。
 *
 * ## 三个刻意的取舍
 *
 * 1. **不复用 `list_public_activity`**：那个 SQL 函数内部已按公开事件白名单
 *    过滤，用它做后台日志会得到一份「和公开页一样少」的列表，失去意义。
 * 2. **不显示 metadata**：里面可能含访客标识与 UA 的哈希。日志页不需要它们，
 *    下发即是无意义的暴露面。
 * 3. **明确标出哪些事件不进公开流**：否则会有人以为「我在这里看到拒绝记录，
 *    为什么读者看不到」是 bug。
 */
export const metadata: Metadata = { title: '活动日志' }

type Props = {
  searchParams: Promise<{ type?: string }>
}

const LIMIT = 120

/**
 * 事件标签。
 *
 * 与 `components/site/activity-feed.tsx` 的公开标签措辞不同：公开页是给读者看的
 * 叙事，这里是给管理员看的操作记录，因此更直白（「评论被拒绝」而不是「审核了评论」）。
 */
const EVENT_LABELS: Record<ActivityEventType, string> = {
  post_created: '创建文章',
  post_updated: '更新文章',
  post_published: '发布文章',
  post_archived: '归档文章',
  timeline_created: '创建时间轴节点',
  timeline_updated: '更新时间轴节点',
  timeline_published: '发布时间轴节点',
  timeline_archived: '下线时间轴节点',
  comment_created: '收到新评论',
  comment_approved: '评论通过',
  comment_rejected: '评论被拒绝',
  like_created: '新增点赞',
  view_milestone_reached: '浏览量里程碑',
}

function normalizeType(raw: string | undefined): ActivityEventType | undefined {
  if (!raw) return undefined
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(raw)
    ? (raw as ActivityEventType)
    : undefined
}

function formatTime(iso: string): string {
  // 用 ISO 字符串切片而不是 new Date()：与站内其它后台页保持一致，
  // 且避免服务端与浏览器时区不同导致同一行显示两个时间。
  return iso.slice(0, 16).replace('T', ' ')
}

export default async function AdminActivityPage({ searchParams }: Props) {
  const { type: typeParam } = await searchParams
  const eventType = normalizeType(typeParam)

  const [rows, counts] = await Promise.all([
    listActivityLog({ eventType: eventType ?? null, limit: LIMIT }),
    countActivityByType(),
  ])

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl">活动日志</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          记录内容变更、审核动作与访客互动。共 {total} 条事件，本页显示最近 {LIMIT} 条
          {eventType ? `（当前只看「${EVENT_LABELS[eventType]}」）` : ''}。
        </p>
      </header>

      <nav aria-label="按事件类型筛选" className="mb-5 flex flex-wrap gap-1.5">
        <Link
          href="/admin/activity"
          aria-current={eventType ? undefined : 'page'}
          className="rounded-full px-3 py-1.5 text-xs font-extrabold"
          style={{
            background: eventType ? 'var(--surface)' : 'var(--ink)',
            color: eventType ? 'var(--muted)' : 'var(--canvas)',
            border: '1px solid var(--line)',
          }}
        >
          全部（{total}）
        </Link>
        {ACTIVITY_EVENT_TYPES.map((value) => {
          const active = value === eventType
          const count = counts[value] ?? 0
          return (
            <Link
              key={value}
              href={`/admin/activity?type=${value}`}
              aria-current={active ? 'page' : undefined}
              className="rounded-full px-3 py-1.5 text-xs font-extrabold"
              style={{
                background: active ? 'var(--ink)' : 'var(--surface)',
                color: active ? 'var(--canvas)' : 'var(--muted)',
                border: '1px solid var(--line)',
                // 0 条的事件仍然可点（点进去看到空状态是有信息量的），
                // 但用透明度表明「这里现在是空的」，避免无谓点击。
                opacity: count === 0 && !active ? 0.55 : 1,
              }}
            >
              {EVENT_LABELS[value]}（{count}）
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {eventType
            ? `还没有「${EVENT_LABELS[eventType]}」事件。`
            : '还没有活动事件。发布内容、审核评论或收到点赞后这里会有记录。'}
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((row) => (
            <ActivityRow key={row.id} row={row} />
          ))}
        </ul>
      )}

      <section
        aria-labelledby="legend-title"
        className="mt-6 rounded-xl border p-4 text-xs leading-relaxed"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        <h2 id="legend-title" className="font-display text-sm">
          关于这份日志
        </h2>
        <ul className="mt-2 grid gap-1 text-[var(--muted)]">
          <li>
            · 带「公开」标记的事件会出现在站点首页的「最近活跃」里；不带标记的只在这里可见
            （拒绝记录、归档记录、点赞明细都属于内部信息）。
          </li>
          <li>
            · 不记录访客身份：点赞与浏览只留加盐哈希，且不在此页展示；浏览行为本身不进活动流，
            只在 10 / 50 / 100 / 500 / 1000 次时生成里程碑。
          </li>
          <li>
            · 事件写入失败不会影响主操作（保存、审核照常完成），因此这里偶尔可能缺一条；
            失败原因不写日志，避免扩大敏感信息暴露面。
          </li>
        </ul>
      </section>
    </div>
  )
}

function ActivityRow({ row }: { row: ActivityLogRow }) {
  const isPublic = isPublicActivityEvent(row.eventType)
  const label = EVENT_LABELS[row.eventType as ActivityEventType] ?? row.eventType
  const href = targetHref(row.targetType, row.targetId)

  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-3 py-2"
      style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-2">
        <span className="text-sm font-extrabold">{label}</span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
          style={
            isPublic
              ? { background: 'var(--mint)', color: 'var(--ink)' }
              : { background: 'var(--soft)', color: 'var(--muted)' }
          }
          title={isPublic ? '会出现在公开「最近活跃」' : '只在后台可见'}
        >
          {isPublic ? '公开' : '内部'}
        </span>
        {row.title ? (
          href ? (
            <Link href={href} className="min-w-0 truncate text-xs underline text-[var(--muted)]">
              {row.title}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-xs text-[var(--muted)]">{row.title}</span>
          )
        ) : null}
      </div>
      <time dateTime={row.createdAt} className="text-[11px] text-[var(--muted)]">
        {formatTime(row.createdAt)}
      </time>
    </li>
  )
}

/**
 * 目标链接。
 *
 * 只有 post / timeline_item 两种 target_type 有公开地址（D-06）；
 * 其它值（历史脏数据或未来新增类型）不造链接，避免生成 404。
 */
function targetHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetId) return null
  if (targetType === 'post') return `/posts/${targetId}`
  if (targetType === 'timeline_item') return `/timeline/${targetId}`
  return null
}
