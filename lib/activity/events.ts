/**
 * 活动事件枚举（决策 D-03：固定为单一来源）。
 * 数据库侧应有同名 check 约束；修改此文件必须同步迁移。
 */
export const ACTIVITY_EVENT_TYPES = [
  'post_created',
  'post_updated',
  'post_published',
  'post_archived',
  'timeline_created',
  'timeline_updated',
  'timeline_published',
  'timeline_archived',
  'comment_created',
  'comment_approved',
  'comment_rejected',
  'like_created',
  'view_milestone_reached',
] as const

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number]

/** 允许在公开页面展示的事件类型（不含待审核、访客标识）。 */
const PUBLIC_EVENT_TYPES: readonly ActivityEventType[] = [
  'post_created',
  'post_updated',
  'post_published',
  'timeline_created',
  'timeline_updated',
  'timeline_published',
  'comment_approved',
  'view_milestone_reached',
]

export function isPublicActivityEvent(type: string): boolean {
  return (PUBLIC_EVENT_TYPES as readonly string[]).includes(type)
}

export type ActivityItem = {
  type: ActivityEventType
  title: string
  createdAt: string
}
