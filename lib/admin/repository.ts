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
  externalUrl: string | null
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

export async function listCommentsForModeration(
  status: CommentStatus | 'all',
  limit = 50,
): Promise<AdminCommentRow[]> {
  const rows = await query<{
    id: string
    target_type: string
    target_id: string
    author_name: string
    content: string
    status: string
    created_at: Date
  }>(
    status === 'all'
      ? `select id, target_type, target_id, author_name, content, status, created_at
           from public.comments
          order by created_at desc
          limit $1`
      : `select id, target_type, target_id, author_name, content, status, created_at
           from public.comments
          where status = $1
          order by created_at desc
          limit $2`,
    status === 'all' ? [limit] : [status, limit],
  )

  return rows.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    authorName: row.author_name,
    content: row.content,
    status: row.status as CommentStatus,
    createdAt: row.created_at.toISOString(),
  }))
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
  const row = await queryOne<{
    id: string
    target_type: string
    target_id: string
    author_name: string
    content: string
    status: string
    created_at: Date
  }>(
    `select id, target_type, target_id, author_name, content, status, created_at
       from public.comments where id = $1`,
    [id],
  )
  if (!row) return null
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    authorName: row.author_name,
    content: row.content,
    status: row.status as CommentStatus,
    createdAt: row.created_at.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// 时间轴管理
// ---------------------------------------------------------------------------

export async function listTimelineForAdmin(): Promise<AdminTimelineRow[]> {
  const rows = await query<{
    id: string
    title: string | null
    content: string
    type: string
    status: string
    occurred_at: string
    published_at: string | null
    image_url: string | null
    external_url: string | null
  }>(
    `select id, title, content, type, status,
            to_char(occurred_at,'YYYY-MM-DD') as occurred_at,
            to_char(published_at,'YYYY-MM-DD') as published_at,
            image_url, external_url
       from public.timeline_items
      order by occurred_at desc, id desc`,
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
    externalUrl: row.external_url,
  }))
}

/**
 * 创建或更新时间轴节点。
 *
 * 时间轴节点的 updated_at 是「真实修改时刻」而非作者编辑日期，
 * 因此这里不设置 app.preserve_updated_at，保持触发器默认行为（自动填 now()）。
 * published_at 在切到 published 时必须非空（与 timeline_items_published_at_check 对齐）。
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
}): Promise<{ created: boolean }> {
  const publishedAt = input.status === 'published' ? input.occurredAt : null

  const existing = await queryOne<{ id: string }>(
    `select id from public.timeline_items where id = $1`,
    [input.id],
  )

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
       published_at = excluded.published_at,
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

  return { created: existing === null }
}

export async function setTimelineStatus(id: string, status: string): Promise<boolean> {
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
  return rows.length > 0
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
