'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { timelineSaveEventType, writeActivity } from '@/lib/admin/activity'
import { setTimelineStatus, upsertTimelineItem } from '@/lib/admin/repository'
import { recordAudit, requireAdmin } from '@/lib/auth/admin'
import { revalidateTimelinePaths, timelineInvalidationTags } from '@/lib/cache/tags'
import { TIMELINE_STATUSES, TIMELINE_TYPES } from '@/lib/timeline/types'

/**
 * 时间轴管理 Server Actions（设计 11-admin-timeline）。
 *
 * 每个 Action 都重新鉴权（与评论审核同理）。
 * 写操作成功后失效相关缓存 tag，使公开页及时反映变化。
 *
 * 活动事件（module 09 §4）：
 * - 新建 → `timeline_created`
 * - 编辑 → `timeline_updated`
 * - 从非发布切到发布 → `timeline_published`
 * - 归档 → `timeline_archived`
 *
 * 本项之前**完全不写**活动事件，导致公开「最近活跃」只能看到点赞里程碑。
 * 三种事件分开记而不是一律记 created：读者需要能分辨「新内容」与「改了旧内容」。
 */

/** 编辑态回传的 ID 由服务端生成，只需约束成「看起来像 ID」即可，不做业务校验。 */
const GENERATED_ID_PATTERN = /^(?:tl|post)-[0-9a-f]{12}$/

/** 外部链接协议白名单（设计 11 §3.2：禁止 `javascript:`）。 */
const SAFE_URL_PATTERN = /^https?:\/\//i

/**
 * 回跳路径白名单。
 *
 * `returnTo` 来自表单隐藏字段，客户端可改，必须约束到本页前缀并拒绝
 * `//host`、反斜杠与 `..` 段，否则这里就是开放重定向入口。
 */
function safeTimelinePath(raw: string): string {
  if (!raw.startsWith('/admin/timeline')) return '/admin/timeline'
  if (raw.startsWith('//') || raw.includes('\\')) return '/admin/timeline'
  if (raw.split('/').includes('..')) return '/admin/timeline'
  return raw
}

function withParam(base: string, key: string, value: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`
}

export async function saveTimelineAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/timeline')

  const returnTo = safeTimelinePath(String(formData.get('returnTo') ?? ''))
  const fail = (code: string): never => redirect(withParam(returnTo, 'error', code))

  // 新建时表单不带 ID（也没有输入框），服务端生成；编辑时带回原值。
  const submittedId = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim() || null
  const content = String(formData.get('content') ?? '').trim()
  const type = String(formData.get('type') ?? '')
  const status = String(formData.get('status') ?? '')
  const occurredAt = String(formData.get('occurredAt') ?? '').trim()
  const imageUrl = String(formData.get('imageUrl') ?? '').trim() || null
  const imageAlt = String(formData.get('imageAlt') ?? '').trim() || null
  const externalUrl = String(formData.get('externalUrl') ?? '').trim() || null
  // 编辑时由表单带上旧版本戳；为空表示新建，不做并发检查。
  const expectedUpdatedAt = String(formData.get('expectedUpdatedAt') ?? '').trim() || null

  // 校验必须与数据库 check 约束一致，否则会在 SQL 层报错且信息不友好。
  const id: string | null = submittedId === '' ? null : submittedId
  if (id !== null && (id.length > 120 || !GENERATED_ID_PATTERN.test(id))) fail('bad_id')
  if (content.length < 1 || content.length > 5000) fail('bad_content')
  if (!(TIMELINE_TYPES as readonly string[]).includes(type)) fail('bad_type')
  if (!(TIMELINE_STATUSES as readonly string[]).includes(status)) fail('bad_status')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) fail('bad_date')

  // 有图必须有替代文本（可访问性要求，与 posts_cover_alt_check 同源原则）。
  if (imageUrl && !imageAlt) fail('missing_image_alt')

  // 外链只允许 http/https：javascript: 与 data: 在卡片里是可点击的，
  // 不做协议校验就等于给了作者一个自伤 XSS 入口。
  if (externalUrl && !SAFE_URL_PATTERN.test(externalUrl)) fail('bad_external_url')

  const result = await upsertTimelineItem({
    id,
    title,
    content,
    type,
    status,
    occurredAt,
    imageUrl,
    imageAlt,
    externalUrl,
    expectedUpdatedAt,
  })

  const savedId = result.id
  if (savedId === null) return fail('generate_failed')

  // 版本戳不符：别人的修改已经落库，本次不覆盖。
  if (result.conflict) fail('conflict')

  await recordAudit({
    actorEmail: identity.email,
    action: result.created ? 'timeline_created' : 'timeline_updated',
    targetType: 'timeline_item',
    targetId: savedId,
    detail: { status, type },
  }).catch(() => {})

  await writeActivity({
    eventType: timelineSaveEventType(result.created),
    target: { type: 'timeline_item', id: savedId },
    title: title ?? content.slice(0, 60),
  })

  // 从非发布切到发布：可见性变了，这是另一种语义的事件。
  // 用 dedupeKey 保证同一节点只记一次「发布」，避免反复改字段刷屏。
  if (status === 'published' && result.previousStatus !== 'published') {
    await writeActivity({
      eventType: 'timeline_published',
      target: { type: 'timeline_item', id: savedId },
      title: title ?? content.slice(0, 60),
      dedupeKey: `timeline_published:${savedId}`,
    })
  }

  for (const tag of timelineInvalidationTags(savedId)) revalidateTag(tag)
  // 直连 pg 时只有按路径失效真正生效，原因见 lib/cache/tags 的说明。
  for (const path of revalidateTimelinePaths(savedId)) revalidatePath(path)
  revalidatePath('/stats')

  redirect(withParam(returnTo, 'ok', result.created ? 'created' : 'updated'))
}

export async function changeTimelineStatusAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/timeline')

  const returnTo = safeTimelinePath(String(formData.get('returnTo') ?? ''))
  const fail = (code: string): never => redirect(withParam(returnTo, 'error', code))

  const id = String(formData.get('id') ?? '').trim()
  const status = String(formData.get('status') ?? '')

  if (!GENERATED_ID_PATTERN.test(id)) fail('bad_id')
  if (!(TIMELINE_STATUSES as readonly string[]).includes(status)) fail('bad_status')

  const result = await setTimelineStatus(id, status)
  if (!result.ok) fail('not_found')

  await recordAudit({
    actorEmail: identity.email,
    action: `timeline_${status}`,
    targetType: 'timeline_item',
    targetId: id,
  }).catch(() => {})

  // 只有「真的从非发布变成发布」才记发布事件。
  // 原本就是发布态时重复点发布，不该再产生一条活动记录。
  if (status === 'published' && result.previousStatus !== 'published') {
    await writeActivity({
      eventType: 'timeline_published',
      target: { type: 'timeline_item', id },
      title: result.title,
      dedupeKey: `timeline_published:${id}`,
    })
  }

  for (const tag of timelineInvalidationTags(id)) revalidateTag(tag)
  for (const path of revalidateTimelinePaths(id)) revalidatePath(path)
  revalidatePath('/stats')

  redirect(withParam(returnTo, 'ok', status))
}

/**
 * 下线时间轴节点。
 *
 * 设计 11 §3.3 要求「删除前显示关联评论/点赞数量；默认归档或软删除」。
 * 这里只做**归档**（status → archived），不物理删除：
 * 物理删除会留下孤儿评论与点赞，而 D-06 明确互动表不设外键，
 * 数据库不会替我们拦住这件事。
 *
 * 真正的永久删除需要独立的确认流程，本页不提供 —— 一个「点了就没了」
 * 的按钮在后台是最容易造成不可恢复损失的东西。
 */
export async function archiveTimelineAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/timeline')

  const returnTo = safeTimelinePath(String(formData.get('returnTo') ?? ''))
  const id = String(formData.get('id') ?? '').trim()
  if (!GENERATED_ID_PATTERN.test(id)) redirect(withParam(returnTo, 'error', 'bad_id'))

  const result = await setTimelineStatus(id, 'archived')
  if (!result.ok) redirect(withParam(returnTo, 'error', 'not_found'))

  await recordAudit({
    actorEmail: identity.email,
    action: 'timeline_archived',
    targetType: 'timeline_item',
    targetId: id,
  }).catch(() => {})

  await writeActivity({
    eventType: 'timeline_archived',
    target: { type: 'timeline_item', id },
    title: result.title,
    dedupeKey: `timeline_archived:${id}`,
  })

  for (const tag of timelineInvalidationTags(id)) revalidateTag(tag)
  for (const path of revalidateTimelinePaths(id)) revalidatePath(path)
  revalidatePath('/stats')

  redirect(withParam(returnTo, 'ok', 'archived'))
}
