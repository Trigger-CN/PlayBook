import 'server-only'

import type { PostFrontmatter } from '@/lib/content/schema'
import type { PublicComment } from '@/lib/interactions/types'
import type { TimelineItem, TimelineType } from '@/lib/timeline/types'

import { getPool } from '@/lib/db/pool'
import { query } from '@/lib/db/query'

import type { DataPorts } from '../ports'

/**
 * PostgreSQL 适配器（自建库过渡实现）。
 * 全部 SQL 只依赖标准 PostgreSQL，不引用 auth.* / service_role 等 Supabase 专有对象，
 * 因此同一套语句在自建库与 Supabase 上都能执行。
 */

type TimelineRow = {
  id: string
  title: string | null
  content: string
  type: TimelineType,
  status: string
  image_url: string | null
  image_alt: string | null
  external_url: string | null
  occurred_at: Date
  published_at: Date | null
}

function toIsoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
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

const TIMELINE_COLUMNS = `id, title, content, type, status, image_url, image_alt, external_url, occurred_at, published_at`

export const postgresPorts: DataPorts = {
  driver: 'postgres',

  posts: {
    /**
     * 文章正文仍在 MDX 文件里（source = 'file'），数据库只存元数据。
     * 因此文章列表与详情暂时继续走文件仓库，等正文迁库时再改这里。
     */
    list: async () => {
      const { filePostRepository } = await import('@/lib/content/repository')
      return filePostRepository.list()
    },
    getBySlug: async (slug) => {
      const { filePostRepository } = await import('@/lib/content/repository')
      return filePostRepository.getBySlug(slug)
    },
    listTags: async () => {
      const { filePostRepository } = await import('@/lib/content/repository')
      return filePostRepository.listTags()
    },
    listCategories: async () => {
      const { filePostRepository } = await import('@/lib/content/repository')
      return filePostRepository.listCategories()
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
  },

  stats: {
    getContentTotals: async () => {
      const rows = await query<{ posts_total: string; timeline_total: string }>(
        `select (select count(*) from public.posts where status = 'published')::text as posts_total,
                (select count(*) from public.timeline_items where status = 'published')::text as timeline_total`,
      )
      const row = rows[0]
      return {
        postsTotal: row ? Number(row.posts_total) : 0,
        timelineTotal: row ? Number(row.timeline_total) : 0,
      }
    },
  },
}
