'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { setTimelineStatus, upsertTimelineItem } from '@/lib/admin/repository'
import { recordAudit, requireAdmin } from '@/lib/auth/admin'
import { timelineInvalidationTags } from '@/lib/cache/tags'
import { TIMELINE_STATUSES, TIMELINE_TYPES } from '@/lib/timeline/types'

/**
 * 时间轴管理 Server Actions（设计 11-admin-timeline）。
 *
 * 每个 Action 都重新鉴权（与评论审核同理）。
 * 写操作成功后失效相关缓存 tag，使公开页及时反映变化。
 */

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function fail(code: string): never {
  redirect(`/admin/timeline?error=${code}`)
}

export async function saveTimelineAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/timeline')

  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim() || null
  const content = String(formData.get('content') ?? '').trim()
  const type = String(formData.get('type') ?? '')
  const status = String(formData.get('status') ?? '')
  const occurredAt = String(formData.get('occurredAt') ?? '').trim()
  const imageUrl = String(formData.get('imageUrl') ?? '').trim() || null
  const imageAlt = String(formData.get('imageAlt') ?? '').trim() || null
  const externalUrl = String(formData.get('externalUrl') ?? '').trim() || null

  // 校验必须与数据库 check 约束一致，否则会在 SQL 层报错且信息不友好。
  if (!ID_PATTERN.test(id) || id.length > 120) fail('bad_id')
  if (content.length < 1 || content.length > 5000) fail('bad_content')
  if (!(TIMELINE_TYPES as readonly string[]).includes(type)) fail('bad_type')
  if (!(TIMELINE_STATUSES as readonly string[]).includes(status)) fail('bad_status')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) fail('bad_date')

  // 有图必须有替代文本（可访问性要求，也与 posts_cover_alt_check 同源原则）。
  if (imageUrl && !imageAlt) fail('missing_image_alt')

  const { created } = await upsertTimelineItem({
    id,
    title,
    content,
    type,
    status,
    occurredAt,
    imageUrl,
    imageAlt,
    externalUrl,
  })

  await recordAudit({
    actorEmail: identity.email,
    action: created ? 'timeline_created' : 'timeline_updated',
    targetType: 'timeline_item',
    targetId: id,
    detail: { status, type },
  }).catch(() => {})

  for (const tag of timelineInvalidationTags(id)) revalidateTag(tag)

  redirect(`/admin/timeline?ok=${created ? 'created' : 'updated'}`)
}

export async function changeTimelineStatusAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/timeline')

  const id = String(formData.get('id') ?? '').trim()
  const status = String(formData.get('status') ?? '')

  if (!ID_PATTERN.test(id)) fail('bad_id')
  if (!(TIMELINE_STATUSES as readonly string[]).includes(status)) fail('bad_status')

  const ok = await setTimelineStatus(id, status)
  if (!ok) fail('not_found')

  await recordAudit({
    actorEmail: identity.email,
    action: `timeline_${status}`,
    targetType: 'timeline_item',
    targetId: id,
  }).catch(() => {})

  for (const tag of timelineInvalidationTags(id)) revalidateTag(tag)

  redirect(`/admin/timeline?ok=${status}`)
}
