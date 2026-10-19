/**
 * 互动领域契约（设计 module 06/07/08 + 决策 D-04/D-06）。
 *
 * D-06 基线决策：互动目标的稳定键统一使用 slug（文章）或 timeline_items.id（时间轴），
 * 即 target_id 始终是"公开路由上可寻址的字符串"，文件型与数据库型内容共用同一套互动表。
 */

export const TARGET_TYPES = ['post', 'timeline_item'] as const
export type TargetType = (typeof TARGET_TYPES)[number]

export function isTargetType(value: unknown): value is TargetType {
  return typeof value === 'string' && (TARGET_TYPES as readonly string[]).includes(value)
}

export type InteractionTarget = {
  type: TargetType
  id: string
}

/** 点赞聚合结果；liked 与访客绑定，禁止进入公共缓存。 */
export type LikeState = {
  count: number
  liked: boolean
}

export const COMMENT_STATUSES = ['pending', 'approved', 'rejected', 'deleted'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

/** 公开评论只允许 approved 状态出现在页面上。 */
export const PUBLIC_COMMENT_STATUS: CommentStatus = 'approved'

export type PublicComment = {
  id: string
  authorName: string
  content: string
  createdAt: string
}

/** 评论输入契约：昵称与正文必填，正文长度上限 500（需求 REQ-INT-008）。 */
export const COMMENT_MAX_LENGTH = 500
export const COMMENT_NAME_MAX_LENGTH = 40
