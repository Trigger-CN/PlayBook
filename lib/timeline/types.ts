/** 时间轴领域类型（设计 module 05 / 决策 D-06）。 */

/** 数组顺序即界面上的筛选顺序。 */
export const TIMELINE_TYPES = [
  'note',
  'milestone',
  'project',
  'release',
  'travel',
  'reading',
] as const

export type TimelineType = (typeof TIMELINE_TYPES)[number]

export const TIMELINE_STATUSES = ['draft', 'published', 'archived'] as const

export type TimelineStatus = (typeof TIMELINE_STATUSES)[number]

/**
 * 时间轴节点的视图模型。
 * 只有 status 为 published 的节点进入公开页面；draft 是草稿，archived 视为已下线。
 */
export type TimelineItem = {
  /** 公开地址的一部分，同时作为互动数据的 target_id（D-06）。 */
  id: string
  /** 缺省时由类型与日期合成标题。 */
  title?: string
  /** 纯文本正文，段落用空行分隔。 */
  content: string
  type: TimelineType
  status: TimelineStatus
  /** 发生日期，格式 YYYY-MM-DD。 */
  occurredAt: string
  imageUrl?: string
  imageAlt?: string
  externalUrl?: string
}
