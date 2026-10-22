'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { commentModerationEventType, writeActivity } from '@/lib/admin/activity'
import { getCommentById, moderateComment } from '@/lib/admin/repository'
import { recordAudit, requireAdmin } from '@/lib/auth/admin'
import { cacheTags } from '@/lib/cache/tags'
import { COMMENT_STATUSES, isTargetType, type CommentStatus } from '@/lib/interactions/types'

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
 * 两个不同的白名单，之前把它们合成了一个 —— 这就是「点审核就提示参数不合法」的成因。
 *
 * - **目标状态**只能是三个：审核动作不可能把评论改回 `pending`。
 * - **期望状态**必须是全部四个：列表页按行当前状态原样回传，而待审行
 *   传的就是 `pending`。把它挡在白名单外，等于所有待审评论都无法处理 ——
 *   而待审队列正是这个页面存在的理由。
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

/** 期望状态允许全部四种：`pending` 是待审行的正常起点。 */
function isCommentStatus(value: string): value is CommentStatus {
  return (COMMENT_STATUSES as readonly string[]).includes(value)
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

  if (!id || !isModerationStatus(rawStatus) || !isCommentStatus(rawExpected)) {
    redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}error=invalid`)
  }

  const nextStatus: ModerationStatus = rawStatus
  const expectedStatus: CommentStatus = rawExpected

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
  // 同上：直连 pg 的场景下只有 revalidatePath 真正生效。评论只出现在
  // 目标详情页（文章或时间轴）上，首页的活跃流也要跟着变。
  // 不失效的后果很容易被误判成「审核没成功」：评论已入库，页面上看不到。
  revalidatePath(rowPath(before.targetType, before.targetId))
  revalidatePath('/')

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

/**
 * 评论所属目标的公开路径。
 *
 * `targetType` 在库里是裸 text，可能含历史脏值；认不出来就退化为首页
 * （首页的「最近活跃」也包含评论事件）。不抛错：审核本身已经成功了。
 */
function rowPath(targetType: string, targetId: string): string {
  if (targetType === 'post') return `/posts/${encodeURIComponent(targetId)}`
  if (targetType === 'timeline_item') return `/timeline/${encodeURIComponent(targetId)}`
  return '/'
}
