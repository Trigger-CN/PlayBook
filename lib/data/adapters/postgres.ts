import 'server-only'

import type { PostFrontmatter } from '@/lib/content/schema'
import type { PublicComment } from '@/lib/interactions/types'
import type { TimelineItem, TimelineType } from '@/lib/timeline/types'

import { query } from '@/lib/db/query'

import type { DataPorts } from '../ports'

/**
 * PostgreSQL 适配器（自建库实现，也可指向 Supabase 连接串）。
 * 全部 SQL 只依赖标准 PostgreSQL，不引用 auth.* / service_role 等 Supabase 专有对象，
 * 因此同一套语句在自建库与 Supabase 上都能执行。
 */

// ---------------------------------------------------------------------------
// 时间轴
// ---------------------------------------------------------------------------

type TimelineRow = {
  id: string
  title: string | null
  content: string
  type: TimelineType
  status: string
  image_url: string | null
  image_alt: string | null
  external_url: string | null
  /** date 列，已在 SQL 侧格式化为 YYYY-MM-DD。 */
  occurred_at: string
  published_at: Date | null
}

/**
 * 纯日期取值。
 *
 * 必须由 SQL 的 to_char(..., 'YYYY-MM-DD') 完成，不能在这里对 Date 调
 * toISOString() 再切片：timestamptz 在 +08:00 会话下会得到前一天（实测已验证）。
 * 因此本函数只做防御性裁剪，不做时区换算。
 */
function toIsoDate(value: string): string {
  return value.slice(0, 10)
}

function mapTimelineRow(row: TimelineRow): TimelineItem {
  return {
    id: row.id,
    title: row.title ?? undefined,
    content: row.content,
    type: row.type,
    status: row.status as TimelineItem['status'],
    occurredAt: toIsoDate(row.occurred_at),
    imageUrl: row.image_url ?? undefined,
    imageAlt: row.image_alt ?? undefined,
    externalUrl: row.external_url ?? undefined,
  }
}

const TIMELINE_COLUMNS = `id, title, content, type, status, image_url, image_alt, external_url,
  to_char(occurred_at, 'YYYY-MM-DD') as occurred_at, published_at`

// ---------------------------------------------------------------------------
// 文章（正文在 posts.body，source = 'db'）
// ---------------------------------------------------------------------------

type PostRow = {
  slug: string
  title: string
  summary: string | null
  cover_url: string | null
  cover_alt: string | null
  tags: string[]
  category: string | null
  featured: boolean
  reading_time: number | null
  body: string | null
  /** 两列均由 SQL 侧 to_char 格式化为 YYYY-MM-DD。 */
  published_at: string | null
  updated_at: string | null
}

const POST_COLUMNS = `slug, title, summary, cover_url, cover_alt, tags, category, featured,
  reading_time, body,
  to_char(published_at, 'YYYY-MM-DD') as published_at,
  to_char(updated_at, 'YYYY-MM-DD') as updated_at`

/** 已发布且已到期的条件，供列表与详情共用。 */
const POST_PUBLIC_WHERE = `status = 'published' and (published_at is null or published_at <= now())`

function mapPostFrontmatter(row: PostRow): PostFrontmatter {
  return {
    title: row.title,
    slug: row.slug,
    summary: row.summary ?? '',
    publishedAt: row.published_at ? toIsoDate(row.published_at) : '',
    updatedAt: row.updated_at ? toIsoDate(row.updated_at) : undefined,
    tags: row.tags ?? [],
    category: row.category ?? undefined,
    cover: row.cover_url ?? undefined,
    coverAlt: row.cover_alt ?? undefined,
    draft: false,
    featured: row.featured,
  }
}

/** 与文件仓库保持同一估算口径（module 03 §6），避免两种数据源读数不一致。 */
function estimateReadingTime(body: string): number {
  const cjk = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const words = (body.match(/[A-Za-z0-9]+/g) ?? []).length
  return Math.max(1, Math.ceil((cjk + words * 1.6) / 350))
}

const POST_SORTS = {
  published: 'published_at desc nulls last, slug asc',
  updated: 'coalesce(updated_at, published_at) desc nulls last, slug asc',
  featured: 'featured desc, published_at desc nulls last, slug asc',
} as const

// ---------------------------------------------------------------------------

export const postgresPorts: DataPorts = {
  driver: 'postgres',

  posts: {
    /**
     * 文章正文已迁入 posts.body（source = 'db'）。
     * 列表只取元数据列，不把正文拉进索引，避免列表页为几百 KB 正文付出代价。
     */
    list: async (input = {}) => {
      const page = Number.isFinite(input.page) && (input.page ?? 0) > 0 ? Math.floor(input.page!) : 1
      const rawSize =
        Number.isFinite(input.pageSize) && (input.pageSize ?? 0) > 0
          ? Math.floor(input.pageSize!)
          : 10
      const pageSize = Math.min(rawSize, 50)
      const sort = input.sort === 'updated' || input.sort === 'featured' ? input.sort : 'published'

      const conditions: string[] = [POST_PUBLIC_WHERE]
      const params: unknown[] = []

      if (input.tag) {
        params.push(input.tag)
        conditions.push(`$${params.length} = any(tags)`)
      }
      if (input.category) {
        params.push(input.category)
        conditions.push(`category = $${params.length}`)
      }
      const keyword = input.q?.trim()
      if (keyword) {
        params.push(`%${keyword}%`)
        const index = params.length
        conditions.push(
          `(title ilike $${index} or coalesce(summary,'') ilike $${index} or coalesce(category,'') ilike $${index} or array_to_string(tags,' ') ilike $${index})`,
        )
      }

      const where = conditions.join(' and ')

      const countRows = await query<{ total: string }>(
        `select count(*)::text as total from public.posts where ${where}`,
        params,
      )
      const total = Number(countRows[0]?.total ?? 0)
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const safePage = Math.min(page, totalPages)
      const offset = (safePage - 1) * pageSize

      const rows = await query<PostRow>(
        `select ${POST_COLUMNS}
           from public.posts
          where ${where}
          order by ${POST_SORTS[sort]}
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, pageSize, offset],
      )

      return {
        items: rows.map((row) => ({
          slug: row.slug,
          title: row.title,
          summary: row.summary ?? '',
          publishedAt: row.published_at ? toIsoDate(row.published_at) : '',
          updatedAt: row.updated_at ? toIsoDate(row.updated_at) : undefined,
          tags: row.tags ?? [],
          category: row.category ?? undefined,
          cover: row.cover_url ?? undefined,
          coverAlt: row.cover_alt ?? undefined,
          featured: row.featured,
          readingTime: row.reading_time ?? 1,
        })),
        total,
        page: safePage,
        pageSize,
        totalPages,
      }
    },

    getBySlug: async (slug) => {
      const rows = await query<PostRow>(
        `select ${POST_COLUMNS}
           from public.posts
          where slug = $1 and ${POST_PUBLIC_WHERE}
          limit 1`,
        [slug],
      )
      const row = rows[0]
      if (!row) return null
      const body = row.body ?? ''
      return {
        frontmatter: mapPostFrontmatter(row),
        body,
        readingTime: row.reading_time ?? estimateReadingTime(body),
      }
    },

    listTags: async () => {
      const rows = await query<{ name: string; count: string }>(
        `select tag as name, count(*)::text as count
           from public.posts, unnest(tags) as tag
          where ${POST_PUBLIC_WHERE}
          group by tag
          order by count(*) desc, tag asc`,
      )
      return rows.map((row) => ({ slug: row.name, name: row.name, count: Number(row.count) }))
    },

    listCategories: async () => {
      const rows = await query<{ name: string; count: string }>(
        `select category as name, count(*)::text as count
           from public.posts
          where ${POST_PUBLIC_WHERE} and category is not null
          group by category
          order by count(*) desc, category asc`,
      )
      return rows.map((row) => ({ slug: row.name, name: row.name, count: Number(row.count) }))
    },
  },

  timeline: {
    listPublic: async () => {
      const rows = await query<TimelineRow>(
        `select ${TIMELINE_COLUMNS}
           from public.timeline_items
          where status = 'published'
            and (published_at is null or published_at <= now())
          order by occurred_at desc, id desc`,
      )
      return rows.map(mapTimelineRow)
    },

    getPublic: async (id) => {
      const rows = await query<TimelineRow>(
        `select ${TIMELINE_COLUMNS}
           from public.timeline_items
          where id = $1
            and status = 'published'
            and (published_at is null or published_at <= now())
          limit 1`,
        [id],
      )
      const row = rows[0]
      return row ? mapTimelineRow(row) : undefined
    },

    getAdjacent: async (id) => {
      const all = await postgresPorts.timeline.listPublic()
      const index = all.findIndex((item) => item.id === id)
      if (index === -1) return {}
      return {
        newer: index > 0 ? all[index - 1] : undefined,
        older: index < all.length - 1 ? all[index + 1] : undefined,
      }
    },
  },

  interactions: {
    getLikeState: async (target, visitorId) => {
      const rows = await query<{ like_count: string; liked: boolean }>(
        `select count(*)::text as like_count,
                coalesce(bool_or(visitor_id = $3), false) as liked
           from public.likes
          where target_type = $1 and target_id = $2`,
        [target.type, target.id, visitorId],
      )
      const row = rows[0]
      return {
        count: row ? Number(row.like_count) : 0,
        liked: row?.liked ?? false,
      }
    },

    getLikeCounts: async (type, ids) => {
      if (ids.length === 0) return {}
      const rows = await query<{ target_id: string; like_count: string }>(
        `select target_id, count(*)::text as like_count
           from public.likes
          where target_type = $1 and target_id = any($2::text[])
          group by target_id`,
        [type, ids],
      )
      const result: Record<string, number> = {}
      for (const row of rows) result[row.target_id] = Number(row.like_count)
      return result
    },

    /**
     * 点赞。唯一约束是防重复的最终保证（module 07 §6），
     * 因此用 on conflict do nothing 把并发重复请求变成幂等成功。
     */
    addLike: async (target, visitorId, ipHash) => {
      await query(
        `insert into public.likes (target_type, target_id, visitor_id, ip_hash)
         values ($1, $2, $3, $4)
         on conflict (target_type, target_id, visitor_id) do nothing`,
        [target.type, target.id, visitorId, ipHash ?? null],
      )
      return postgresPorts.interactions.getLikeState(target, visitorId)
    },

    removeLike: async (target, visitorId) => {
      await query(
        `delete from public.likes
          where target_type = $1 and target_id = $2 and visitor_id = $3`,
        [target.type, target.id, visitorId],
      )
      return postgresPorts.interactions.getLikeState(target, visitorId)
    },

    recordView: async (input) => {
      const rows = await query<{ counted: boolean }>(
        `select public.record_page_view($1, $2, $3, $4, $5, $6, $7) as counted`,
        [
          input.path,
          input.target?.type ?? null,
          input.target?.id ?? null,
          input.visitorId ?? null,
          input.ipHash ?? null,
          input.userAgentHash ?? null,
          input.referrer ?? null,
        ],
      )
      return rows[0]?.counted ?? false
    },

    listApprovedComments: async (target, limit = 50) => {
      const rows = await query<{
        id: string
        author_name: string
        content: string
        created_at: Date
      }>(
        `select id, author_name, content, created_at
           from public.comments
          where target_type = $1 and target_id = $2 and status = 'approved'
          order by created_at asc
          limit $3`,
        [target.type, target.id, limit],
      )
      return rows.map<PublicComment>((row) => ({
        id: row.id,
        authorName: row.author_name,
        content: row.content,
        createdAt: row.created_at.toISOString(),
      }))
    },

    countApprovedComments: async (target) => {
      const rows = await query<{ total: string }>(
        `select count(*)::text as total
           from public.comments
          where target_type = $1 and target_id = $2 and status = 'approved'`,
        [target.type, target.id],
      )
      return Number(rows[0]?.total ?? 0)
    },

    /**
     * 新建评论。status 在 SQL 里写死 'pending'，不接受调用方传入，
     * 因此即使上层校验被绕过也不会产生直接公开的评论（module 06 §3）。
     */
    createComment: async (input) => {
      const rows = await query<{ id: string }>(
        `insert into public.comments
           (target_type, target_id, author_name, author_email_hash, content, status, ip_hash, user_agent_hash)
         values ($1, $2, $3, $4, $5, 'pending', $6, $7)
         returning id`,
        [
          input.target.type,
          input.target.id,
          input.authorName,
          input.authorEmailHash ?? null,
          input.content,
          input.ipHash ?? null,
          input.userAgentHash ?? null,
        ],
      )
      return { id: rows[0]!.id, status: 'pending' as const }
    },
  },

  stats: {
    getContentTotals: async () => {
      const rows = await query<{ posts_total: string; timeline_total: string }>(
        `select (select count(*) from public.posts where ${POST_PUBLIC_WHERE})::text as posts_total,
                (select count(*) from public.timeline_items where status = 'published')::text as timeline_total`,
      )
      const row = rows[0]
      return {
        postsTotal: row ? Number(row.posts_total) : 0,
        timelineTotal: row ? Number(row.timeline_total) : 0,
      }
    },

    /**
     * 公开总量。三条 count 都是一次聚合查询，不把原始行拉到应用内存
     * （module 09 §7）。评论按 approved 计（module 09 §3）。
     */
    getSiteTotals: async () => {
      const rows = await query<{
        views: string
        likes: string
        comments: string
        posts_total: string
        timeline_total: string
      }>(
        `select
           (select count(*) from public.page_views)::text as views,
           (select count(*) from public.likes)::text as likes,
           (select count(*) from public.comments where status = 'approved')::text as comments,
           (select count(*) from public.posts where ${POST_PUBLIC_WHERE})::text as posts_total,
           (select count(*) from public.timeline_items where status = 'published')::text as timeline_total`,
      )
      const row = rows[0]
      return {
        views: Number(row?.views ?? 0),
        likes: Number(row?.likes ?? 0),
        comments: Number(row?.comments ?? 0),
        postsTotal: Number(row?.posts_total ?? 0),
        timelineTotal: Number(row?.timeline_total ?? 0),
      }
    },

    listPopular: async (kind, limit) => {
      const capped = Math.min(Math.max(1, Math.floor(limit)), 20)
      const sql =
        kind === 'likes'
          ? `select target_type, target_id, count(*)::text as count
               from public.likes
              group by target_type, target_id
              order by count(*) desc, target_id asc
              limit $1`
          : `select target_type, target_id, count(*)::text as count
               from public.page_views
              where target_type is not null and target_id is not null
              group by target_type, target_id
              order by count(*) desc, target_id asc
              limit $1`
      const rows = await query<{ target_type: string; target_id: string; count: string }>(sql, [
        capped,
      ])
      return rows.map((row) => ({
        targetType: row.target_type as 'post' | 'timeline_item',
        targetId: row.target_id,
        count: Number(row.count),
      }))
    },

    listRecentActivity: async (limit) => {
      const capped = Math.min(Math.max(1, Math.floor(limit)), 20)
      const rows = await query<{
        event_type: string
        target_type: string | null
        target_id: string | null
        title: string | null
        created_at: Date
      }>(`select event_type, target_type, target_id, title, created_at
             from public.list_public_activity($1)`, [capped])
      return rows.map((row) => ({
        eventType: row.event_type,
        targetType: (row.target_type as 'post' | 'timeline_item' | null) ?? null,
        targetId: row.target_id,
        title: row.title,
        createdAt: row.created_at.toISOString(),
      }))
    },

    /**
     * 近 N 天每日聚合序列。
     *
     * 只读 site_daily_stats 聚合表，不扫原始 page_views / likes / comments
     * （module 09 §5、§7）。日期由 SQL 侧 to_char 格式化 —— date 列直接取值
     * 会被 pg 解析成带时区的 Date，再 toISOString().slice(0,10) 会少一天。
     */
    getDailySeries: async (days) => {
      const capped = Math.min(Math.max(1, Math.floor(days)), 365)
      const rows = await query<{
        date: string
        views_count: number
        likes_count: number
        comments_count: number
      }>(
        `select to_char(date, 'YYYY-MM-DD') as date,
                views_count, likes_count, comments_count
           from public.site_daily_stats
          where date >= current_date - ($1::int - 1)
          order by date asc`,
        [capped],
      )
      return rows.map((row) => ({
        date: row.date,
        views: Number(row.views_count),
        likes: Number(row.likes_count),
        comments: Number(row.comments_count),
      }))
    },

    /** 最后聚合日期。max(date) 是 date 列，同样经 to_char 取值。 */
    getLastAggregatedDate: async () => {
      const rows = await query<{ last_date: string | null }>(
        `select to_char(max(date), 'YYYY-MM-DD') as last_date from public.site_daily_stats`,
      )
      return rows[0]?.last_date ?? null
      return rows[0]?.last_date ?? null
    },
  },

  activity: {
    /** 幂等写入：dedupe_key 已存在时 on conflict do nothing，返回 false。 */
    record: async (input) => {
      const rows = await query<{ inserted: boolean }>(
        `select public.record_activity($1, $2, $3, $4, $5, $6) as inserted`,
        [
          input.eventType,
          input.target?.type ?? null,
          input.target?.id ?? null,
          input.title ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
          input.dedupeKey ?? null,
        ],
      )
      return rows[0]?.inserted ?? false
    },

    recordViewMilestone: async (target, title) => {
      const rows = await query<{ inserted: boolean }>(
        `select public.record_view_milestone($1, $2, $3) as inserted`,
        [target.type, target.id, title ?? null],
      )
      return rows[0]?.inserted ?? false
    },

    backfillDailyStats: async (days) => {
      const rows = await query<{ days: number }>(
        `select public.backfill_daily_stats($1) as days`,
        [days],
      )
      return rows[0]?.days ?? 0
    },
  },
}
