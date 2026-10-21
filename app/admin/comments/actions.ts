'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { commentModerationEventType, writeActivity } from '@/lib/admin/activity'
import { getCommentById, moderateComment } from '@/lib/admin/repository'
import { recordAudit, requireAdmin } from '@/lib/auth/admin'
import { cacheTags } from '@/lib/cache/tags'
import { isTargetType } from '@/lib/interactions/types'

/**
 * 评论审核 Server Actions（设计 06 §5、12-admin-comments）。
 *
 * 每个 Action 都重新鉴权：layout 的守卫只保护页面渲染，
 * Server Action 是独立入口，不能假定调用方已经过 layout。
 *
 * 并发：moderateComment 带 expectedStatus 条件，两人同时操作时
 * 只有第一个成功，第二个会收到「状态已变化」而不是静默覆盖。
 */

/**
 * 审核动作只允许这三个目标状态。
 *
 * 用字面量元组 + 类型守卫，而不是 `CommentStatus[]`：
 * 数组包含检查不会把类型窄化掉，后续 `commentModerationEventType()`
 * 与 `InteractionTargetRef` 都会因此收到过宽的 `CommentStatus`。
 */
const MODERATION_STATUSES = ['approved', 'rejected', 'deleted'] as const
type ModerationStatus = (typeof MODERATION_STATUSES)[number]

function isModerationStatus(value: string): value is ModerationStatus {
  return (MODERATION_STATUSES as readonly string[]).includes(value)
}


export async function moderateCommentAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/comments')

  const id = String(formData.get('id') ?? '')
  const rawStatus = String(formData.get('status') ?? '')
  const rawExpected = String(formData.get('expectedStatus') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null
  // 处理完保留当前筛选，否则审核完一条就跳回全部，失去队列上下文（设计 12 §3）。
  const returnTo = safeCommentListPath(String(formData.get('returnTo') ?? ''))

  if (!id || !isModerationStatus(rawStatus) || !isModerationStatus(rawExpected)) {
    redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}error=invalid`)
  }

  const nextStatus: ModerationStatus = rawStatus
  const expectedStatus: ModerationStatus = rawExpected

  const before = await getCommentById(id)
  if (!before) redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}error=not_found`)

  const ok = await moderateComment({ id, status: nextStatus, expectedStatus, reason })

  if (!ok) {
    // 状态已被别人改过：提示刷新，不覆盖。
    redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}error=conflict`)
  }

  await recordAudit({
    actorEmail: identity.email,
    action: `comment_${nextStatus}`,
    targetType: before.targetType,
    targetId: before.targetId,
    detail: { commentId: id, from: expectedStatus, reason },
  }).catch(() => {})

  // 审核通过/拒绝要进活动流水（module 09 §4）。
  // 本项之前完全没写 —— 公开「最近活跃」因此只能看到点赞里程碑。
  // 幂等键带 commentId：同一条评论只能通过一次，重复写入被吞掉。
  //
  // targetType 在库里是裸 text（历史行可能是脏值），这里先窄化再写，
  // 不合格就跳过活动事件 —— 评论状态本身已经改成功了，不该因此报错。
  const eventType = commentModerationEventType(nextStatus)
  if (eventType && isTargetType(before.targetType)) {
    await writeActivity({
      eventType,
      target: { type: before.targetType, id: before.targetId },
      title: before.authorName,
      dedupeKey: `${eventType}:${id}`,
    })
  }

  // 审核通过后必须失效该目标的评论缓存（设计 06 §4）。
  revalidateTag(cacheTags.comments(before.targetType, before.targetId))

  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}ok=${nextStatus}`)
}

/**
 * 只允许回跳自己的评论列表页。
 *
 * 不做开放重定向：表单里的 returnTo 是客户端可改的，
 * 必须白名单到固定前缀，否则就变成了「点一下跳到任意站」的入口。
 */
function safeCommentListPath(raw: string): string {
  if (!raw.startsWith('/admin/comments')) return '/admin/comments'
  if (raw.startsWith('//') || raw.includes('\\')) return '/admin/comments'
  if (raw.split('/').includes('..')) return '/admin/comments'
  return raw
}
