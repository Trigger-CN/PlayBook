import 'server-only'

import type { ActivityEventType } from '@/lib/activity/events'
import { getDataPorts } from '@/lib/data'
import type { InteractionTargetRef } from '@/lib/data/ports'

/**
 * 后台写操作的活动事件记录（设计 module 09 §4、D-03 事件枚举）。
 *
 * ## 为什么用端口层而不是 admin 仓储
 *
 * admin 仓储存在的理由是「后台需要看到公开端口看不到的状态」。
 * 写活动事件不需要额外可见性，它就是把一条公开事实记进流水，
 * 因此复用 `ports.activity.record` 而不是另写一套 SQL —— 一套幂等逻辑
 * 维护两遍必然漂移。
 *
 * ## 为什么所有调用都 `.catch()`
 *
 * 活动流是**附加信息**：时间轴节点保存成功、评论审核通过，这些是用户
 * 真正要做的事；活动写入失败不该让它们失败。因此这里吞掉错误。
 *
 * 但「吞错误」有个已知代价，本轮之前就踩过一次：`record_activity` 曾经
 * 因为 `on conflict` 匹配不上部分唯一索引而**静默失效**，页面完全看不出
 * 异常，只是活动流永远为空。所以：
 * - 数据库侧修好了（迁移 000010），并有真实库验证；
 * - 这里仍然返回 boolean，让调用方在需要时可以观测；
 * - 失败时**不**写日志 —— 活动事件里可能含标题，写日志反而扩大暴露面。
 */

export type ActivityWriteResult = 'recorded' | 'duplicate' | 'skipped' | 'failed'

/**
 * 记录一条活动事件。
 *
 * @param eventType 必须是 `ACTIVITY_EVENT_TYPES` 中的值，否则数据库 check 会拒绝。
 * @param target    互动目标；文章用 slug，时间轴用 `timeline_items.id`（D-06）。
 * @param title     展示用标题。公开活跃列表会直接显示它，因此不能放内部信息。
 * @param dedupeKey 非空时同一键只保留一条。为 null 表示「这条事件每次都该记」。
 */
export async function writeActivity(input: {
  eventType: ActivityEventType
  target?: InteractionTargetRef | null
  title?: string | null
  metadata?: Record<string, unknown> | null
  dedupeKey?: string | null
}): Promise<ActivityWriteResult> {
  const ports = getDataPorts()

  // 文件模式没有活动表。返回 skipped 而不是抛错：调用方本来就不该
  // 因为「当前没配数据库」而让后台写操作失败 —— 后台本身有 hasDatabaseUrl 守卫。
  if (ports.driver === 'file') return 'skipped'

  try {
    const inserted = await ports.activity.record({
      eventType: input.eventType,
      target: input.target ?? null,
      title: input.title ?? null,
      metadata: input.metadata ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })
    return inserted ? 'recorded' : 'duplicate'
  } catch {
    return 'failed'
  }
}

/**
 * 时间轴节点保存后的事件类型。
 *
 * 关键判断：**「首次创建」与「再次保存」是两种不同事件**。
 * 用 `timeline_created` 表示新建、`timeline_updated` 表示编辑，
 * 而不是一律记 created —— 否则公开活跃流里会出现一堆「创建」，
 * 读者无法分辨哪些是真正的新内容。
 *
 * 发布状态切换由 `changeTimelineStatusAction` 单独记 `timeline_published`，
 * 因为那是不同的语义（内容可见性变了，而非内容变了）。
 */
export function timelineSaveEventType(created: boolean): ActivityEventType {
  return created ? 'timeline_created' : 'timeline_updated'
}

/**
 * 评论审核结果的对应事件。
 *
 * `approved` → `comment_approved`（公开可见，进公开活跃流）
 * `rejected` → `comment_rejected`（不进公开活跃流，但后台日志要能看到）
 * `deleted`  → 不记事件：删除是清理动作，不是「发生过什么」。
 */
export function commentModerationEventType(
  status: 'approved' | 'rejected' | 'deleted',
): ActivityEventType | null {
  if (status === 'approved') return 'comment_approved'
  if (status === 'rejected') return 'comment_rejected'
  return null
}
