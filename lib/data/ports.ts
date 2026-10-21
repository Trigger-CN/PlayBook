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

export type InteractionPort = {
  /** 单目标点赞计数与该访客是否已点赞。 */
  getLikeState(target: InteractionTargetRef, visitorId: string | null): Promise<LikeState>
  /** 批量计数，避免列表页 N+1；无点赞的目标不出现在结果里。 */
  getLikeCounts(type: TargetType, ids: string[]): Promise<Record<string, number>>
  /** 记录一次浏览；被去重规则拦下时返回 false。 */
  recordView(input: ViewRecordInput): Promise<boolean>
  /** 只返回 approved 的公开评论。 */
  listApprovedComments(target: InteractionTargetRef, limit?: number): Promise<PublicComment[]>
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

export type ContentTotals = {
  postsTotal: number
  timelineTotal: number
}

export type StatsPort = {
  /** 累计总量从内容源取，不读每日聚合表（决策 D-07）。 */
  getContentTotals(): Promise<ContentTotals>
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

export type DataPorts = {
  posts: PostPort
  timeline: TimelinePort
  interactions: InteractionPort
  stats: StatsPort
  /** 当前生效的实现名，用于日志与调试。 */
  readonly driver: 'file' | 'postgres' | 'supabase'
}
