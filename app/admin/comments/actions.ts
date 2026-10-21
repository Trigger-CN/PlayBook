'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { getCommentById, moderateComment } from '@/lib/admin/repository'
import { recordAudit, requireAdmin } from '@/lib/auth/admin'
import { cacheTags } from '@/lib/cache/tags'
import type { CommentStatus } from '@/lib/interactions/types'

/**
 * 评论审核 Server Actions（设计 06 §5、12-admin-comments）。
 *
 * 每个 Action 都重新鉴权：layout 的守卫只保护页面渲染，
 * Server Action 是独立入口，不能假定调用方已经过 layout。
 *
 * 并发：moderateComment 带 expectedStatus 条件，两人同时操作时
 * 只有第一个成功，第二个会收到「状态已变化」而不是静默覆盖。
 */

const ALLOWED: CommentStatus[] = ['approved', 'rejected', 'deleted']

export async function moderateCommentAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/comments')

  const id = String(formData.get('id') ?? '')
  const nextStatus = String(formData.get('status') ?? '') as CommentStatus
  const expectedStatus = String(formData.get('expectedStatus') ?? '') as CommentStatus
  const reason = String(formData.get('reason') ?? '').trim() || null

  if (!id || !ALLOWED.includes(nextStatus) || !ALLOWED.includes(expectedStatus)) {
    redirect('/admin/comments?error=invalid')
  }

  const before = await getCommentById(id)
  if (!before) redirect('/admin/comments?error=not_found')

  const ok = await moderateComment({ id, status: nextStatus, expectedStatus, reason })

  if (!ok) {
    // 状态已被别人改过：提示刷新，不覆盖。
    redirect('/admin/comments?error=conflict')
  }

  await recordAudit({
    actorEmail: identity.email,
    action: `comment_${nextStatus}`,
    targetType: before.targetType,
    targetId: before.targetId,
    detail: { commentId: id, from: expectedStatus, reason },
  }).catch(() => {})

  // 审核通过后必须失效该目标的评论缓存（设计 06 §4）。
  revalidateTag(cacheTags.comments(before.targetType, before.targetId))

  redirect(`/admin/comments?ok=${nextStatus}`)
}
