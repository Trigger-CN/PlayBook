import 'server-only'

import { query, queryOne } from '@/lib/db/query'
import type { CommentStatus } from '@/lib/interactions/types'

/**
 * 后台数据访问（设计 08 §5、12-admin-comments、11-admin-timeline）。
 *
 * 与公开端口层的区别：
 * 公开端口只返回 approved 评论与 published 内容；后台需要看到全部状态，
 * 因此这里是独立的 admin 仓储，不经 lib/data 的公开端口 —— 避免为了后台
 * 把「能看到未审核内容」的能力泄漏进公开端口的类型里。
 *
 * 所有写操作都要求调用方已通过 requireAdmin()，本文件不做鉴权
 * （鉴权在页面 / Route Handler 层统一做，避免两处逻辑漂移）。
 */

export type AdminCommentRow = {
  id: string
  targetType: string
  targetId: string
  authorName: string
  content: string
  status: CommentStatus
  createdAt: string
  /**
   * 掩码后的邮箱；无邮箱为 null。
   *
   * 设计 12 §3 要求「邮箱只显示掩码或不显示」。数据库里存的是哈希，
   * 本来就没有明文可显示 —— 这里返回的是“是否留了邮箱”这一元信息，
   * 而不是邮箱本身。对外绝不返回哈希值。
   */
  hasEmail: boolean
  /** 目标标题（文章标题或节点标题）；目标不存在时为 null（orphan）。 */
  targetTitle: string | null
}

export type AdminTimelineRow = {
  id: string
  title: string | null
  content: string
  type: string
  status: string
  occurredAt: string
  publishedAt: string | null
  imageUrl: string | null
  imageAlt: string | null
  externalUrl: string | null
  /** 版本戳（YYYY-MM-DD HH24:MI:SS），用于乐观并发控制。 */
  updatedAtStamp: string | null
}

export type AdminOverview = {
  pendingComments: number
  approvedComments: number
  totalComments: number
  totalLikes: number
  totalViews: number
  draftTimeline: number
  publishedTimeline: number
  postsTotal: number
}

// ---------------------------------------------------------------------------
// 概览
// ---------------------------------------------------------------------------

export async function getAdminOverview(): Promise<AdminOverview> {
  const row = await queryOne<Record<string, string>>(
    `select
       (select count(*) from public.comments where status = 'pending')::text  as pending_comments,
       (select count(*) from public.comments where status = 'approved')::text as approved_comments,
       (select count(*) from public.comments)::text                           as total_comments,
       (select count(*) from public.likes)::text                              as total_likes,
       (select count(*) from public.page_views)::text                         as total_views,
       (select count(*) from public.timeline_items where status = 'draft')::text     as draft_timeline,
       (select count(*) from public.timeline_items where status = 'published')::text as published_timeline,
       (select count(*) from public.posts where status = 'published')::text   as posts_total`,
  )

  return {
    pendingComments: Number(row?.pending_comments ?? 0),
    approvedComments: Number(row?.approved_comments ?? 0),
    totalComments: Number(row?.total_comments ?? 0),
    totalLikes: Number(row?.total_likes ?? 0),
    totalViews: Number(row?.total_views ?? 0),
    draftTimeline: Number(row?.draft_timeline ?? 0),
    publishedTimeline: Number(row?.published_timeline ?? 0),
    postsTotal: Number(row?.posts_total ?? 0),
  }
}

// ---------------------------------------------------------------------------
// 评论审核
// ---------------------------------------------------------------------------

/**
 * 评论审核队列的公共列定义。
 *
 * 用 LEFT JOIN 取目标标题，而不是让页面自己去查：
 *  - 评论表的 target_id 是「公开路由上可寻址的字符串」（D-06）：
 *    文章用 slug、时间轴用 timeline_items.id。
 *  - join 不到时 target_title 为 null，即 orphan（内容已不存在）。
 *    互动表按设计不设外键，所以这种行确实会存在，必须能显示而不是崩掉。
 *
 * hasEmail 只暴露「是否留了邮箱」这一元信息 —— 库里存的是哈希，
 * 本来就没有明文可显示，哈希本身也绝不返回。
 */
const COMMENT_COLUMNS = `
  c.id, c.target_type, c.target_id, c.author_name, c.content, c.status, c.created_at,
  (c.author_email_hash is not null) as has_email,
  coalesce(p.title, t.title, nullif(left(t.content, 40), '')) as target_title`

const COMMENT_FROM = `
  from public.comments c
  left join public.posts p
         on c.target_type = 'post' and p.slug = c.target_id
  left join public.timeline_items t
         on c.target_type = 'timeline_item' and t.id = c.target_id`

type CommentRow = {
  id: string
  target_type: string
  target_id: string
  author_name: string
  content: string
  status: string
  created_at: Date
  has_email: boolean
  target_title: string | null
}

function toCommentRow(row: CommentRow): AdminCommentRow {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    authorName: row.author_name,
    content: row.content,
    status: row.status as CommentStatus,
    createdAt: row.created_at.toISOString(),
    hasEmail: row.has_email === true,
    targetTitle: row.target_title ?? null,
  }
}

export async function listCommentsForModeration(
  status: CommentStatus | 'all',
  limit = 50,
): Promise<AdminCommentRow[]> {
  const rows = await query<CommentRow>(
    status === 'all'
      ? `select ${COMMENT_COLUMNS} ${COMMENT_FROM}
          order by c.created_at desc
          limit $1`
      : `select ${COMMENT_COLUMNS} ${COMMENT_FROM}
          where c.status = $1
          order by c.created_at desc
          limit $2`,
    status === 'all' ? [limit] : [status, limit],
  )

  return rows.map(toCommentRow)
}

/**
 * 更新评论状态。
 *
 * 并发安全（设计 06 §5「并发审核用当前 status 条件更新」）：
 * 只有当库中状态仍等于 expectedStatus 时才更新，返回是否真的改到了。
 * 这样两个管理员同时点「批准」不会互相覆盖，也不会把已删除的评论复活。
 */
export async function moderateComment(input: {
  id: string
  status: CommentStatus
  expectedStatus: CommentStatus
  reason?: string | null
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update public.comments
        set status = $2,
            moderated_at = now(),
            moderation_reason = $3
      where id = $1
        and status = $4
      returning id`,
    [input.id, input.status, input.reason ?? null, input.expectedStatus],
  )
  return rows.length > 0
}

export async function getCommentById(id: string): Promise<AdminCommentRow | null> {
  const row = await queryOne<CommentRow>(
    `select ${COMMENT_COLUMNS} ${COMMENT_FROM} where c.id = $1`,
    [id],
  )
  return row ? toCommentRow(row) : null
}

/**
 * 最近评论（不限状态）。
 *
 * 仪表盘用：让管理员一眼看到「刚刚发生了什么」，而不是先跑去评论页筛。
 * 与 listCommentsForModeration 共用列定义，因此同样带目标标题与 hasEmail，
 * 并且同样不返回任何邮箱哈希。
 */
export async function listRecentComments(limit = 5): Promise<AdminCommentRow[]> {
  const capped = Math.min(Math.max(1, Math.floor(limit)), 50)
  const rows = await query<CommentRow>(
    `select ${COMMENT_COLUMNS} ${COMMENT_FROM}
      order by c.created_at desc
      limit $1`,
    [capped],
  )
  return rows.map(toCommentRow)
}

// ---------------------------------------------------------------------------
// 时间轴管理
// ---------------------------------------------------------------------------

export type AdminTimelineFilters = {
  type?: string
  status?: string
  year?: string
  q?: string
}

/**
 * 后台时间轴列表（设计 11 §3.1：支持类型/年份/状态/关键字筛选，query 可恢复）。
 *
 * 筛选条件全部参数化拼装，不做字符串拼接。年份用 `extract(year from occurred_at)`
 * 而不是 `occurred_at::text like '2026%'`——后者无法用索引，且对 date 列
 * 依赖隐式格式化。
 *
 * 额外带上 `imageAlt` 与 `updatedAtStamp`：前者用于编辑回填（有图必须有 alt），
 * 后者是乐观并发控制的版本戳。
 */
export async function listTimelineForAdmin(
  filters: AdminTimelineFilters = {},
): Promise<AdminTimelineRow[]> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.type) {
    params.push(filters.type)
    conditions.push(`type = $${params.length}`)
  }
  if (filters.status) {
    params.push(filters.status)
    conditions.push(`status = $${params.length}`)
  }
  if (filters.year && /^\d{4}$/.test(filters.year)) {
    params.push(Number(filters.year))
    conditions.push(`extract(year from occurred_at) = $${params.length}`)
  }
  const keyword = filters.q?.trim()
  if (keyword) {
    params.push(`%${keyword}%`)
    const i = params.length
    conditions.push(`(coalesce(title,'') ilike $${i} or content ilike $${i} or id ilike $${i})`)
  }

  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''

  const rows = await query<{
    id: string
    title: string | null
    content: string
    type: string
    status: string
    occurred_at: string
    published_at: string | null
    image_url: string | null
    image_alt: string | null
    external_url: string | null
    updated_at_stamp: string | null
  }>(
    `select id, title, content, type, status,
            to_char(occurred_at,'YYYY-MM-DD') as occurred_at,
            to_char(published_at,'YYYY-MM-DD') as published_at,
            image_url, image_alt, external_url,
            to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') as updated_at_stamp
       from public.timeline_items
      ${where}
      order by occurred_at desc, id desc`,
    params,
  )

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    status: row.status,
    occurredAt: row.occurred_at,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    externalUrl: row.external_url,
    updatedAtStamp: row.updated_at_stamp,
  }))
}

/**
 * 创建或更新时间轴节点。
 *
 * 时间轴节点的 updated_at 是「真实修改时刻」而非作者编辑日期，
 * 因此这里不设置 app.preserve_updated_at，保持触发器默认行为（自动填 now()）。
 * published_at 在切到 published 时必须非空（与 timeline_items_published_at_check 对齐）。
 *
 * 并发控制：传入 `expectedUpdatedAt` 时，只有当库中值仍匹配才更新，
 * 否则返回 `{ ok: false, conflict: true }`。设计 11 §4 要求「发布冲突：
 * updated_at 不一致时阻止覆盖」。传 null 表示「这是新建，不检查」。
 *
 * 返回 `previousStatus` 让调用方判断「草稿→发布」这一跳，
 * 从而写正确的活动事件（内容变更 ≠ 可见性变更）。
 */
export async function upsertTimelineItem(input: {
  id: string
  title: string | null
  content: string
  type: string
  status: string
  occurredAt: string
  imageUrl: string | null
  imageAlt: string | null
  externalUrl: string | null
  /** 新建时传 null；编辑时传表单里的旧 updated_at 值。 */
  expectedUpdatedAt?: string | null
}): Promise<{ ok: boolean; created: boolean; conflict: boolean; previousStatus: string | null }> {
  const publishedAt = input.status === 'published' ? input.occurredAt : null

  const existing = await queryOne<{ id: string; status: string }>(
    `select id, status from public.timeline_items where id = $1`,
    [input.id],
  )

  // 已存在且调用方提供了期望版本，但版本不符：不覆盖。
  if (existing && input.expectedUpdatedAt) {
    const current = await queryOne<{ stamp: string | null }>(
      `select to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') as stamp
         from public.timeline_items where id = $1`,
      [input.id],
    )
    if ((current?.stamp ?? '') !== input.expectedUpdatedAt) {
      return { ok: false, created: false, conflict: true, previousStatus: existing.status }
    }
  }

  await query(
    `insert into public.timeline_items
       (id, title, content, type, status, occurred_at, published_at, image_url, image_alt, external_url)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (id) do update set
       title = excluded.title,
       content = excluded.content,
       type = excluded.type,
       status = excluded.status,
       occurred_at = excluded.occurred_at,
       -- 首次发布时间不该因为改了个错字而往后跳：已发布过的节点保留原值。
       published_at = case
         when excluded.status = 'published'
           then coalesce(public.timeline_items.published_at, excluded.published_at)
         else public.timeline_items.published_at
       end,
       image_url = excluded.image_url,
       image_alt = excluded.image_alt,
       external_url = excluded.external_url`,
    [
      input.id,
      input.title,
      input.content,
      input.type,
      input.status,
      input.occurredAt,
      publishedAt,
      input.imageUrl,
      input.imageAlt,
      input.externalUrl,
    ],
  )

  return {
    ok: true,
    created: existing === null,
    conflict: false,
    previousStatus: existing?.status ?? null,
  }
}

/**
 * 切换时间轴节点状态。
 *
 * 返回 `previousStatus`，让调用方能区分「真的发布了」与「原本就是发布」
 * —— 只有前者该写 `timeline_published` 活动事件。
 */
export async function setTimelineStatus(
  id: string,
  status: string,
): Promise<{ ok: boolean; previousStatus: string | null; title: string | null }> {
  const before = await queryOne<{ status: string; title: string | null }>(
    `select status, title from public.timeline_items where id = $1`,
    [id],
  )
  if (!before) return { ok: false, previousStatus: null, title: null }

  const rows = await query<{ id: string }>(
    `update public.timeline_items
        set status = $2,
            published_at = case
              when $2 = 'published' then coalesce(published_at, occurred_at)
              else published_at
            end
      where id = $1
      returning id`,
    [id, status],
  )

  return { ok: rows.length > 0, previousStatus: before.status, title: before.title }
}

/**
 * 目标上已有的互动数量（设计 11 §3.3：删除前显示关联评论/点赞数量）。
 *
 * 一次聚合查询取两个计数，不把原始行拉回应用（module 09 §7）。
 */
export async function getTargetInteractionCounts(target: {
  type: string
  id: string
}): Promise<{ comments: number; likes: number }> {
  const row = await queryOne<{ comments: string; likes: string }>(
    `select
       (select count(*) from public.comments
         where target_type = $1 and target_id = $2)::text as comments,
       (select count(*) from public.likes
         where target_type = $1 and target_id = $2)::text as likes`,
    [target.type, target.id],
  )
  return {
    comments: Number(row?.comments ?? 0),
    likes: Number(row?.likes ?? 0),
  }
}

/**
 * 批量取时间轴节点的互动计数。
 *
 * 列表页每行都要显示「N 条评论 / M 个赞」，逐行调 getTargetInteractionCounts
 * 就是 N+1 查询。这里一次 group by 取完，只查有互动的目标，
 * 没有互动的节点由调用方按 0 处理。
 */
export async function listTimelineInteractionCounts(
  ids: string[],
): Promise<Record<string, { comments: number; likes: number }>> {
  if (ids.length === 0) return {}

  const rows = await query<{ target_id: string; comments: string; likes: string }>(
    `select t.target_id,
            coalesce(c.n, 0)::text as comments,
            coalesce(l.n, 0)::text as likes
       from (select unnest($1::text[]) as target_id) t
       left join (
         select target_id, count(*) as n from public.comments
          where target_type = 'timeline_item' and target_id = any($1::text[])
          group by target_id
       ) c on c.target_id = t.target_id
       left join (
         select target_id, count(*) as n from public.likes
          where target_type = 'timeline_item' and target_id = any($1::text[])
          group by target_id
       ) l on l.target_id = t.target_id`,
    [ids],
  )

  const result: Record<string, { comments: number; likes: number }> = {}
  for (const row of rows) {
    result[row.target_id] = {
      comments: Number(row.comments ?? 0),
      likes: Number(row.likes ?? 0),
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// 活动日志（后台）
// ---------------------------------------------------------------------------

/**
 * 后台活动日志行。
 *
 * 比公开活跃流多出的信息：
 * - `eventType` 原值（公开流只给中文标签）
 * - `isPublic`：该事件是否会出现在公开页（由 isPublicActivityEvent 判定）
 * - `metadata`：写入时附带的上下文（可能含访客标识的哈希，不渲染）
 */
export type ActivityLogRow = {
  id: string
  eventType: string
  targetType: string | null
  targetId: string | null
  title: string | null
  createdAt: string
}

/**
 * 读取活动事件。
 *
 * **刻意不复用 `list_public_activity`**：那个函数只返回 8 种公开事件，
 * 而后台日志页的意义恰恰在于能看到 `comment_created`、`comment_rejected`、
 * `*_archived`、`like_created` 这些不进公开流的事件。
 *
 * 不返回 `metadata`：里面可能有访客标识的哈希与 UA 哈希，
 * 日志页不需要它们，下发即是无意义的暴露面。
 */
export async function listActivityLog(input: {
  eventType?: string | null
  limit?: number
} = {}): Promise<ActivityLogRow[]> {
  const capped = Math.min(Math.max(1, Math.floor(input.limit ?? 100)), 200)
  const rows = input.eventType
    ? await query<{
        id: string
        event_type: string
        target_type: string | null
        target_id: string | null
        title: string | null
        created_at: Date
      }>(
        `select id, event_type, target_type, target_id, title, created_at
           from public.activity_events
          where event_type = $1
          order by created_at desc
          limit $2`,
        [input.eventType, capped],
      )
    : await query<{
        id: string
        event_type: string
        target_type: string | null
        target_id: string | null
        title: string | null
        created_at: Date
      }>(
        `select id, event_type, target_type, target_id, title, created_at
           from public.activity_events
          order by created_at desc
          limit $1`,
        [capped],
      )

  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    targetType: row.target_type,
    targetId: row.target_id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
  }))
}

/**
 * 每种事件各有多少条（用于筛选栏的计数徽标）。
 */
export async function countActivityByType(): Promise<Record<string, number>> {
  const rows = await query<{ event_type: string; n: string }>(
    `select event_type, count(*)::text as n
       from public.activity_events
      group by event_type`,
  )
  const result: Record<string, number> = {}
  for (const row of rows) result[row.event_type] = Number(row.n ?? 0)
  return result
}

// ---------------------------------------------------------------------------
// 审计日志
// ---------------------------------------------------------------------------

export type AuditRow = {
  id: string
  actorEmail: string
  action: string
  targetType: string | null
  targetId: string | null
  createdAt: string
}

export async function listAuditLog(limit = 50): Promise<AuditRow[]> {
  const rows = await query<{
    id: string
    actor_email: string
    action: string
    target_type: string | null
    target_id: string | null
    created_at: Date
  }>(
    `select id, actor_email, action, target_type, target_id, created_at
       from public.admin_audit_log
      order by created_at desc
      limit $1`,
    [limit],
  )

  return rows.map((row) => ({
    id: row.id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at.toISOString(),
  }))
}

// ---------------------------------------------------------------------------
// 文章索引（设计 10-admin-posts）
// ---------------------------------------------------------------------------

/**
 * 后台文章行。
 *
 * 与公开端口的区别：公开端口只返回 published，后台需要看到 draft / archived，
 * 并且要能区分 `source` 是 `file` 还是 `db` —— 这决定正文在哪里修改
 * （file → 改 MDX 后跑 db:import；db → 已可直接在库内编辑）。
 */
export type AdminPostRow = {
  slug: string
  title: string
  summary: string
  status: string
  source: string
  category: string | null
  tags: string[]
  featured: boolean
  version: number
  publishedAt: string | null
  updatedAt: string | null
}

/**
 * 后台文章列表。
 *
 * `status` 可选筛选：仪表盘的「草稿文章」待办条会链到 `?status=draft`。
 * 与时间轴筛选一样参数化拼装，不做字符串拼接。
 */
export async function listPostsForAdmin(filters: {
  status?: string | null
} = {}): Promise<AdminPostRow[]> {
  const params: unknown[] = []
  let where = ''
  if (filters.status) {
    params.push(filters.status)
    where = `where status = $${params.length}`
  }

  const rows = await query<{
    slug: string
    title: string
    summary: string | null
    status: string
    source: string
    category: string | null
    tags: string[]
    featured: boolean
    version: number
    published_at: string | null
    updated_at: string | null
  }>(
    `select slug, title, summary, status, source, category, tags, featured, version,
            to_char(published_at,'YYYY-MM-DD') as published_at,
            to_char(updated_at,'YYYY-MM-DD') as updated_at
       from public.posts
      ${where}
      order by coalesce(updated_at, published_at) desc nulls last, slug asc`,
    params,
  )

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? '',
    status: row.status,
    source: row.source,
    category: row.category,
    tags: row.tags ?? [],
    featured: row.featured,
    version: Number(row.version),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }))
}

// ---------------------------------------------------------------------------
// 分析（设计 13-admin-analytics）
// ---------------------------------------------------------------------------

/** 后台分析页的聚合快照。 */
export type AdminAnalytics = {
  series: Array<{ date: string; views: number; likes: number; comments: number }>
  aggregatedAt: string | null
  totals: {
    views: number
    likes: number
    pendingComments: number
    approvedComments: number
    publishedPosts: number
    publishedTimeline: number
  }
}

/**
 * 后台分析数据。
 *
 * 趋势只读 site_daily_stats（与公开页同一口径，保证两处数字可解释地一致），
 * 累计量直接 count 真实表。不在这里下发任何逐条原始事件。
 */
export async function getAdminAnalytics(days = 30): Promise<AdminAnalytics> {
  const capped = Math.min(Math.max(1, Math.floor(days)), 365)

  const [seriesRows, totalsRow, lastRow] = await Promise.all([
    query<{ date: string; views_count: number; likes_count: number; comments_count: number }>(
      `select to_char(date, 'YYYY-MM-DD') as date,
              views_count, likes_count, comments_count
         from public.site_daily_stats
        where date >= current_date - ($1::int - 1)
        order by date asc`,
      [capped],
    ),
    queryOne<Record<string, string>>(
      `select
         (select count(*) from public.page_views)::text                          as views,
         (select count(*) from public.likes)::text                               as likes,
         (select count(*) from public.comments where status = 'pending')::text    as pending_comments,
         (select count(*) from public.comments where status = 'approved')::text   as approved_comments,
         (select count(*) from public.posts where status = 'published')::text     as published_posts,
         (select count(*) from public.timeline_items where status = 'published')::text as published_timeline`,
    ),
    queryOne<{ last_date: string | null }>(
      `select to_char(max(date), 'YYYY-MM-DD') as last_date from public.site_daily_stats`,
    ),
  ])

  return {
    series: seriesRows.map((row) => ({
      date: row.date,
      views: Number(row.views_count),
      likes: Number(row.likes_count),
      comments: Number(row.comments_count),
    })),
    aggregatedAt: lastRow?.last_date ?? null,
    totals: {
      views: Number(totalsRow?.views ?? 0),
      likes: Number(totalsRow?.likes ?? 0),
      pendingComments: Number(totalsRow?.pending_comments ?? 0),
      approvedComments: Number(totalsRow?.approved_comments ?? 0),
      publishedPosts: Number(totalsRow?.published_posts ?? 0),
      publishedTimeline: Number(totalsRow?.published_timeline ?? 0),
    },
  }
}
