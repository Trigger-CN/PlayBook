/**
 * 数据访问端口（ports）。
 *
 * 目的：页面与业务组件只依赖这里的接口，不直接依赖文件系统、PostgreSQL 或 Supabase。
 * 这样在「文件 / 种子 → 自建 PostgreSQL → Supabase」之间切换时，页面代码不变。
 *
 * 约定：
 * - 全部方法返回 Promise，即使当前实现是同步读文件，避免以后换异步驱动时改签名。
 * - 端口只暴露领域对象，不泄漏驱动层的 response / error 结构。
 * - 不在此文件引入任何 server-only 模块，因为它同时被类型声明与客户端类型检查引用。
 */

import type { PostFrontmatter, PostIndexItem } from '@/lib/content/schema'
import type {
  LikeState,
  PublicComment,
  TargetType,
} from '@/lib/interactions/types'
import type { TimelineItem } from '@/lib/timeline/types'

// ---------------------------------------------------------------------------
// 文章
// ---------------------------------------------------------------------------

export type PostQuery = {
  q?: string
  tag?: string
  category?: string
  sort?: 'published' | 'updated' | 'featured'
  page?: number
  pageSize?: number
}

export type PostQueryResult = {
  items: PostIndexItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type PostDetail = {
  frontmatter: PostFrontmatter
  body: string
  readingTime: number
}

export type PostPort = {
  list(query?: PostQuery): Promise<PostQueryResult>
  getBySlug(slug: string): Promise<PostDetail | null>
  listTags(): Promise<Array<{ slug: string; name: string; count: number }>>
  listCategories(): Promise<Array<{ slug: string; name: string; count: number }>>
}

// ---------------------------------------------------------------------------
// 时间轴
// ---------------------------------------------------------------------------

export type TimelinePort = {
  /** 只返回 status === 'published' 的节点，按 occurredAt desc, id desc 排序。 */
  listPublic(): Promise<TimelineItem[]>
  /** 未知或未发布返回 undefined，调用方据此 notFound()。 */
  getPublic(id: string): Promise<TimelineItem | undefined>
  /** 列表按发生时间倒序，因此前一项更新、后一项更早。 */
  getAdjacent(id: string): Promise<{ newer?: TimelineItem; older?: TimelineItem }>
}

// ---------------------------------------------------------------------------
// 互动（点赞 / 评论 / 浏览）
// ---------------------------------------------------------------------------

export type InteractionTargetRef = {
  type: TargetType
  id: string
}

export type ViewRecordInput = {
  path: string
  target?: InteractionTargetRef
  visitorId?: string | null
  ipHash?: string | null
  userAgentHash?: string | null
  referrer?: string | null
}

/** 新建评论的写入参数（设计 module 06 §3）。 */
export type CommentCreateInput = {
  target: InteractionTargetRef
  authorName: string
  content: string
  /** 只存哈希，不存明文邮箱（module 06 §7）。 */
  authorEmailHash?: string | null
  ipHash?: string | null
  userAgentHash?: string | null
}

/**
 * 写入结果。新建评论恒为 pending，不返回内部审核细节（module 06 §6）。
 */
export type CommentCreateResult = {
  id: string
  status: 'pending'
}

export type InteractionPort = {
  /** 单目标点赞计数与该访客是否已点赞。 */
  getLikeState(target: InteractionTargetRef, visitorId: string | null): Promise<LikeState>
  /** 批量计数，避免列表页 N+1；无点赞的目标不出现在结果里。 */
  getLikeCounts(type: TargetType, ids: string[]): Promise<Record<string, number>>
  /** 点赞；重复点赞视作幂等成功，返回权威状态（module 07 §4.2）。 */
  addLike(
    target: InteractionTargetRef,
    visitorId: string,
    ipHash?: string | null,
  ): Promise<LikeState>
  /** 取消点赞；不存在时也返回成功状态，计数不小于 0（module 07 §4.2）。 */
  removeLike(target: InteractionTargetRef, visitorId: string): Promise<LikeState>
  /** 记录一次浏览；被去重规则拦下时返回 false。 */
  recordView(input: ViewRecordInput): Promise<boolean>
  /** 只返回 approved 的公开评论。 */
  listApprovedComments(target: InteractionTargetRef, limit?: number): Promise<PublicComment[]>
  /** 已审核通过的评论数（公开统计口径，module 09 §3）。 */
  countApprovedComments(target: InteractionTargetRef): Promise<number>
  /** 新建评论；实现必须强制 status = 'pending'。 */
  createComment(input: CommentCreateInput): Promise<CommentCreateResult>
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

export type ContentTotals = {
  postsTotal: number
  timelineTotal: number
}

/** 公开统计汇总（设计 module 09 §3：口径固定，页面不直接扫原始表）。 */
export type SiteTotals = {
  views: number
  likes: number
  comments: number
  postsTotal: number
  timelineTotal: number
}

/** 热门内容项：按浏览或点赞排序。 */
export type PopularItem = {
  targetType: TargetType
  targetId: string
  count: number
}

/** 每日聚合行（设计 07 §5 的 series 项）。date 为 YYYY-MM-DD。 */
export type DailyStatPoint = {
  date: string
  views: number
  likes: number
  comments: number
}

/**
 * 统计页的完整数据包（设计 07 §5）。
 *
 * `aggregated` 为 false 表示当前数据源不提供聚合（文件模式），
 * 页面据此展示说明而不是画一条全零的假趋势线。
 */
export type PublicStats = {
  totals: SiteTotals
  series: DailyStatPoint[]
  popularPosts: PopularItem[]
  popularTimeline: PopularItem[]
  /** 最后一次聚合日期（YYYY-MM-DD）；未聚合过为 null。 */
  aggregatedAt: string | null
  aggregated: boolean
}

export type StatsPort = {
  /** 累计总量从内容源取，不读每日聚合表（决策 D-07）。 */
  getContentTotals(): Promise<ContentTotals>
  /** 公开总量：浏览/点赞/评论三项聚合 + 内容数。无数据库时后三项为 0。 */
  getSiteTotals(): Promise<SiteTotals>
  /** 按浏览或点赞取热门目标，limit 上限由实现限制。 */
  listPopular(kind: 'views' | 'likes', limit: number): Promise<PopularItem[]>
  /** 最近公开活跃事件（module 09 §4：已过滤待审核与访客标识）。 */
  listRecentActivity(limit: number): Promise<ActivityEntry[]>
  /** 近 N 天每日聚合序列，按日期升序；只读聚合表，不扫原始事件（module 09 §5）。 */
  getDailySeries(days: number): Promise<DailyStatPoint[]>
  /** 最后一次聚合日期；从未聚合返回 null。 */
  getLastAggregatedDate(): Promise<string | null>
}

// ---------------------------------------------------------------------------
// 活跃事件
// ---------------------------------------------------------------------------

/** 公开活跃条目；不含访客标识与内部评分。 */
export type ActivityEntry = {
  eventType: string
  targetType: TargetType | null
  targetId: string | null
  title: string | null
  createdAt: string
}

export type ActivityPort = {
  /** 写入一条活动事件；dedupeKey 重复时幂等不重复插入。 */
  record(input: ActivityRecordInput): Promise<boolean>
  /** 检查并写入浏览里程碑；未达新里程碑返回 false。 */
  recordViewMilestone(target: InteractionTargetRef, title?: string | null): Promise<boolean>
  /** 回填最近 N 天每日聚合，返回实际处理天数。 */
  backfillDailyStats(days: number): Promise<number>
}

export type ActivityRecordInput = {
  eventType: string
  target?: InteractionTargetRef | null
  title?: string | null
  metadata?: Record<string, unknown> | null
  dedupeKey?: string | null
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

export type DataPorts = {
  posts: PostPort
  timeline: TimelinePort
  interactions: InteractionPort
  stats: StatsPort
  activity: ActivityPort
  /** 当前生效的实现名，用于日志与调试。 */
  readonly driver: 'file' | 'postgres' | 'supabase'
}
