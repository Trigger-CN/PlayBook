/**
 * 数据库 schema 的 TypeScript 映射（Phase 5）。
 * 与 supabase/migrations/ 的 DDL 保持一致；改动迁移时必须同步此文件。
 * 这里只描述类型，不含任何运行时逻辑，因此客户端与服务端都可安全引入。
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type PostStatus = 'draft' | 'published' | 'archived'
export type PostSource = 'file' | 'db'
export type TimelineItemType = 'note' | 'milestone' | 'project' | 'release' | 'travel' | 'reading'
export type TimelineItemStatus = 'draft' | 'published' | 'archived'
export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'deleted'
export type TargetType = 'post' | 'timeline_item'

export type PostRow = {
  id: string
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
  source: PostSource
  status: PostStatus
  version: number
  published_at: string | null
  created_at: string
  updated_at: string | null
}

export type TimelineItemRow = {
  id: string
  title: string | null
  content: string
  type: TimelineItemType
  status: TimelineItemStatus
  image_url: string | null
  image_alt: string | null
  external_url: string | null
  occurred_at: string
  published_at: string | null
  created_at: string
  updated_at: string | null
}

export type CommentRow = {
  id: string
  target_type: TargetType
  target_id: string
  parent_id: string | null
  author_name: string
  author_email_hash: string | null
  author_avatar_url: string | null
  content: string
  status: CommentStatus
  ip_hash: string | null
  user_agent_hash: string | null
  moderated_at: string | null
  moderated_by: string | null
  moderation_reason: string | null
  created_at: string
  updated_at: string | null
}

export type LikeRow = {
  id: string
  target_type: TargetType
  target_id: string
  visitor_id: string
  user_id: string | null
  ip_hash: string | null
  created_at: string
}

export type PageViewRow = {
  id: string
  path: string
  target_type: TargetType | null
  target_id: string | null
  visitor_id: string | null
  ip_hash: string | null
  user_agent_hash: string | null
  referrer: string | null
  created_at: string
}

export type ActivityEventRow = {
  id: string
  event_type: string
  target_type: TargetType | null
  target_id: string | null
  title: string | null
  metadata: Json | null
  created_at: string
}

export type SiteDailyStatsRow = {
  date: string
  views_count: number
  likes_count: number
  comments_count: number
  posts_count: number
  timeline_count: number
  created_at: string
  updated_at: string | null
}

/** 插入类型：把有默认值的列与自增列设为可选。 */
type InsertOf<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>

export type PostInsert = InsertOf<
  PostRow,
  'id' | 'summary' | 'cover_url' | 'cover_alt' | 'tags' | 'category' | 'featured' | 'reading_time' | 'body' | 'source' | 'status' | 'version' | 'published_at' | 'created_at' | 'updated_at'
>

export type TimelineItemInsert = InsertOf<
  TimelineItemRow,
  'title' | 'status' | 'image_url' | 'image_alt' | 'external_url' | 'published_at' | 'created_at' | 'updated_at'
>

export type CommentInsert = InsertOf<
  CommentRow,
  'id' | 'parent_id' | 'author_email_hash' | 'author_avatar_url' | 'status' | 'ip_hash' | 'user_agent_hash' | 'moderated_at' | 'moderated_by' | 'moderation_reason' | 'created_at' | 'updated_at'
>

export type LikeInsert = InsertOf<LikeRow, 'id' | 'user_id' | 'ip_hash' | 'created_at'>

export type PageViewInsert = InsertOf<
  PageViewRow,
  'id' | 'target_type' | 'target_id' | 'visitor_id' | 'ip_hash' | 'user_agent_hash' | 'referrer' | 'created_at'
>

export type ActivityEventInsert = InsertOf<
  ActivityEventRow,
  'id' | 'target_type' | 'target_id' | 'title' | 'metadata' | 'created_at'
>

export type SiteDailyStatsInsert = InsertOf<
  SiteDailyStatsRow,
  'views_count' | 'likes_count' | 'comments_count' | 'posts_count' | 'timeline_count' | 'created_at' | 'updated_at'
>

/** RPC 返回类型。 */
export type LikeStateRow = { like_count: number; liked: boolean }
export type LikeCountRow = { target_id: string; like_count: number }
export type ContentTotalsRow = { posts_total: number; timeline_total: number }

/**
 * Supabase 客户端所需的 schema 描述。
 * 必须包含 Tables / Views / Functions / Enums / CompositeTypes 五个键，
 * 否则 createClient 的泛型推断会失败。
 */
export type Database = {
  public: {
    Tables: {
      posts: {
        Row: PostRow
        Insert: PostInsert
        Update: Partial<PostInsert>
        Relationships: []
      }
      timeline_items: {
        Row: TimelineItemRow
        Insert: TimelineItemInsert
        Update: Partial<TimelineItemInsert>
        Relationships: []
      }
      comments: {
        Row: CommentRow
        Insert: CommentInsert
        Update: Partial<CommentInsert>
        Relationships: []
      }
      likes: {
        Row: LikeRow
        Insert: LikeInsert
        Update: Partial<LikeInsert>
        Relationships: []
      }
      page_views: {
        Row: PageViewRow
        Insert: PageViewInsert
        Update: Partial<PageViewInsert>
        Relationships: []
      }
      activity_events: {
        Row: ActivityEventRow
        Insert: ActivityEventInsert
        Update: Partial<ActivityEventInsert>
        Relationships: []
      }
      site_daily_stats: {
        Row: SiteDailyStatsRow
        Insert: SiteDailyStatsInsert
        Update: Partial<SiteDailyStatsInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_like_state: {
        Args: { p_target_type: string; p_target_id: string; p_visitor_id?: string | null }
        Returns: LikeStateRow[]
      }
      get_like_counts: {
        Args: { p_target_type: string; p_target_ids: string[] }
        Returns: LikeCountRow[]
      }
      record_page_view: {
        Args: {
          p_path: string
          p_target_type?: string | null
          p_target_id?: string | null
          p_visitor_id?: string | null
          p_ip_hash?: string | null
          p_user_agent_hash?: string | null
          p_referrer?: string | null
          p_window_minutes?: number
        }
        Returns: boolean
      }
      get_content_totals: {
        Args: Record<string, never>
        Returns: ContentTotalsRow[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
