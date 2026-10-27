'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import type { ActivityEventType } from '@/lib/activity/events'
import { writeActivity } from '@/lib/admin/activity'
import { getPostForEdit, setPostStatus, upsertPost } from '@/lib/admin/repository'
import { recordAudit, requireAdmin } from '@/lib/auth/admin'
import { cacheTags, postInvalidationTags, revalidatePostPaths } from '@/lib/cache/tags'
import { renderMdx } from '@/lib/content/mdx'
import { estimateReadingTime } from '@/lib/content/repository'

import type { PostFormState } from './form-state'

/**
 * 文章书写 Server Actions（设计 15-post-editor）。
 *
 * 三条不自证的前提，与评论审核一致：
 *
 * 1. **每个 Action 独立鉴权**。layout 的守卫只保护页面渲染，Server Action
 *    是独立入口，调用方不一定经过 layout。
 * 2. **服务端二次校验**。客户端表单只是便利，校验在服务端重做一遍。
 * 3. **失败不丢正文**。这是 `savePostAction` 用 `useActionState` 而不是
 *    redirect 的唯一原因 —— redirect 会丢掉刚写的正文，而设计 15 §8 的
 *    验收标准明确要求「保存/发布失败不丢失正文」。返回状态让受控表单
 *    原地保留输入。
 *
 * ## slug 不由用户输入
 *
 * 表单里没有 slug 字段（决策 D-31）。新建时服务端生成一个 `post-<12位hex>`，
 * 编辑时用隐藏字段带回原值作为定位条件。因此下面完全不再校验 slug 的格式 ——
 * 它不再是「用户可能填错的东西」，而是「服务端自己产出的东西」。
 */

const POST_STATUSES = ['draft', 'published', 'archived'] as const
type PostStatus = (typeof POST_STATUSES)[number]

function isPostStatus(value: string): value is PostStatus {
  return (POST_STATUSES as readonly string[]).includes(value)
}

/** 只允许回跳自己的文章页，防开放重定向（与 timeline / comments 同口径）。 */
function safePostsPath(raw: string): string {
  if (!raw.startsWith('/admin/posts')) return '/admin/posts'
  if (raw.startsWith('//') || raw.includes('\\')) return '/admin/posts'
  if (raw.split('/').includes('..')) return '/admin/posts'
  return raw
}

function withParam(base: string, key: string, value: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

/** 标签输入：一行一个或逗号分隔都接受。去空、去重、保序。 */
function parseTags(raw: string): string[] {
  const parts = raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return [...new Set(parts)]
}

/** 编辑器表单的返回状态见 `./form-state`：`'use server'` 文件只能导出
 * async 函数，导出常量对象会让 `next build` 在收集页面数据阶段失败。 */

/**
 * 保存前校验（设计 15 §3.4）。
 *
 * 必填项约束的是「发布」，不是「保存」：草稿允许只有标题的半成品，
 * 这正是草稿的意义。
 *
 * 只返回第一条问题：一次列十条的清单在移动端会把表单挤出屏幕，
 * 而修完第一条再看到第二条的体验更顺。
 */
async function validate(input: {
  title: string
  summary: string
  cover: string | null
  coverAlt: string | null
  status: PostStatus
  publishedAt: string
  body: string
}): Promise<{ field: string; message: string } | null> {
  if (input.title === '') return { field: 'title', message: '标题不能为空' }

  // 发布日期只要填了就必须是合法格式；草稿可以不填。
  if (input.publishedAt !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt)) {
    return { field: 'publishedAt', message: '发布日期必须是 YYYY-MM-DD 格式' }
  }

  // 以下是发布闸门：草稿不拦，允许半成品。
  if (input.status !== 'published') return null

  if (input.summary === '') {
    return { field: 'summary', message: '摘要不能为空（它会出现在列表与搜索结果里）' }
  }
  if (input.publishedAt === '') {
    return { field: 'publishedAt', message: '发布前要填发布日期' }
  }
  if (input.cover && !input.coverAlt) {
    return { field: 'coverAlt', message: '填了封面就必须填封面替代文字（无障碍要求）' }
  }
  if (input.body.trim() === '') return { field: 'body', message: '正文不能为空' }

  try {
    await renderMdx(input.body)
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知错误'
    return { field: 'body', message: `MDX 编译失败：${detail}` }
  }

  return null
}

/**
 * 保存文章。
 *
 * `intent` 由点哪个按钮决定：
 *   - `draft`   → 存成草稿
 *   - `publish` → 存成已发布
 *
 * 新建时表单不带 slug（也没有 slug 输入框），服务端生成；编辑时隐藏字段带回
 * 原 slug，仅作为定位条件，永远不会被写进 UPDATE 的 SET 里。
 *
 * 成功时 redirect 到编辑页（带 `?ok=saved`）；失败时返回状态、原地保留输入。
 */
export async function savePostAction(
  _prevState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/posts')

  const rawIntent = text(formData, 'intent')
  const intent: PostStatus = rawIntent === 'publish' ? 'published' : 'draft'

  const submittedSlug = text(formData, 'slug')
  const title = text(formData, 'title')
  const summary = text(formData, 'summary')
  const cover = text(formData, 'cover') || null
  const coverAlt = text(formData, 'coverAlt') || null
  const category = text(formData, 'category') || null
  const featured = text(formData, 'featured') === 'on'
  const publishedAt = text(formData, 'publishedAt')
  const body = String(formData.get('body') ?? '')
  const tags = parseTags(String(formData.get('tags') ?? ''))

  const rawExpectedVersion = text(formData, 'expectedVersion')
  const expectedVersion =
    rawExpectedVersion === '' ? null : Number.parseInt(rawExpectedVersion, 10)
  if (expectedVersion !== null && !Number.isInteger(expectedVersion)) {
    return { error: '版本戳不合法，请刷新页面后重试。', field: null }
  }

  // 新建必须没有 slug、编辑必须有 slug：两者由 expectedVersion 是否为空决定。
  // 这条判断是防「拿编辑表单当新建提交」这类手工构造请求，而不是防用户误操作。
  const slug = expectedVersion === null ? null : submittedSlug
  if (expectedVersion !== null && slug === null) {
    return { error: '缺少文章标识，请刷新页面后重试。', field: null }
  }

  const problem = await validate({ title, summary, cover, coverAlt, status: intent, publishedAt, body })
  if (problem) return { error: problem.message, field: problem.field }

  const result = await upsertPost({
    slug,
    title,
    summary,
    cover,
    coverAlt,
    tags,
    category,
    featured,
    status: intent,
    publishedAt,
    body,
    readingTime: estimateReadingTime(body),
    expectedVersion,
  })

  if (!result.ok) {
    if (result.reason === 'conflict') {
      return {
        error: '这篇文章已被其他操作修改（可能你在别处保存过）。请刷新页面后再改，避免覆盖。',
        field: null,
      }
    }
    return { error: '生成文章标识失败，请再点一次保存。', field: null }
  }

  const savedSlug = result.slug

  await recordAudit({
    actorEmail: identity.email,
    action: result.created ? 'post_created' : 'post_updated',
    targetType: 'post',
    targetId: savedSlug,
    detail: { status: intent, source: 'admin' },
  }).catch(() => {})

  // 新建记 created、再次保存记 updated；发布另外记 published。
  // published 带幂等键 —— 同一篇文章反复保存不该刷出一串「发布」。
  const saveEvent: ActivityEventType = result.created ? 'post_created' : 'post_updated'
  await writeActivity({
    eventType: saveEvent,
    target: { type: 'post', id: savedSlug },
    title,
  })

  if (intent === 'published' && (result.created || result.previousStatus !== 'published')) {
    await writeActivity({
      eventType: 'post_published',
      target: { type: 'post', id: savedSlug },
      title,
      dedupeKey: `post_published:${savedSlug}`,
    })
  }

  // tag 失效留给将来改用 fetch/unstable_cache 缓存时用；
  // 当前直连 pg，真正生效的是按路径失效（见 lib/cache/tags 的说明）。
  for (const tag of postInvalidationTags(savedSlug, tags, category ?? undefined)) {
    revalidateTag(tag)
  }
  revalidateTag(cacheTags.statsAdmin)
  for (const path of revalidatePostPaths(savedSlug)) {
    revalidatePath(path)
  }
  revalidatePath('/stats')

  redirect(withParam(`/admin/posts/${encodeURIComponent(savedSlug)}/edit`, 'ok', 'saved'))
}

/**
 * 列表页的状态快捷动作：发布 / 归档 / 转草稿。
 *
 * 与 `savePostAction` 分开：不动正文，也不需要重跑「摘要填没填」这类
 * 发布前置校验（内容早就在库里）。仍带 `version` 条件，避免把别人
 * 刚保存的正文连带回滚到旧状态。
 *
 * 这里可以安全地用 redirect：没有正文输入会因此丢失。
 */
export async function changePostStatusAction(formData: FormData): Promise<void> {
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/posts')

  const slug = text(formData, 'slug')
  const rawStatus = text(formData, 'status')
  const rawVersion = text(formData, 'expectedVersion')
  const returnTo = safePostsPath(text(formData, 'returnTo') || '/admin/posts')

  const version = Number.parseInt(rawVersion, 10)
  if (!slug || !isPostStatus(rawStatus) || !Number.isInteger(version)) {
    redirect(withParam(returnTo, 'error', 'invalid'))
  }

  const nextStatus: PostStatus = rawStatus
  const before = await getPostForEdit(slug)
  if (!before) redirect(withParam(returnTo, 'error', 'not_found'))

  const result = await setPostStatus({ slug, status: nextStatus, expectedVersion: version })
  if (!result.ok) redirect(withParam(returnTo, 'error', 'conflict'))

  await recordAudit({
    actorEmail: identity.email,
    action: `post_${nextStatus}`,
    targetType: 'post',
    targetId: slug,
    detail: { from: result.previousStatus, to: nextStatus },
  }).catch(() => {})

  if (nextStatus === 'archived') {
    await writeActivity({
      eventType: 'post_archived',
      target: { type: 'post', id: slug },
      title: result.title,
      dedupeKey: `post_archived:${slug}`,
    })
  } else if (nextStatus === 'published') {
    await writeActivity({
      eventType: 'post_published',
      target: { type: 'post', id: slug },
      title: result.title,
      dedupeKey: `post_published:${slug}`,
    })
  } else {
    await writeActivity({
      eventType: 'post_updated',
      target: { type: 'post', id: slug },
      title: result.title,
    })
  }

  // 同上：直连 pg 的场景下只有 revalidatePath 真正起作用。
  for (const tag of postInvalidationTags(slug, before.tags, before.category ?? undefined)) {
    revalidateTag(tag)
  }
  revalidateTag(cacheTags.statsAdmin)
  for (const path of revalidatePostPaths(slug)) {
    revalidatePath(path)
  }
  revalidatePath('/stats')

  redirect(withParam(returnTo, 'ok', nextStatus))
}
