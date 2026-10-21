import { NextResponse } from 'next/server'

import { getDataPorts, hasDatabaseUrl } from '@/lib/data'
import { checkRateLimit } from '@/lib/interactions/rate-limit'
import {
  ensureVisitorId,
  readVisitorId,
  requestFingerprint,
} from '@/lib/interactions/server-context'
import type { TargetType } from '@/lib/interactions/types'
import { likeTargetSchema } from '@/lib/interactions/validators'

/**
 * 统一点赞接口（设计 module 07 §5）。
 *
 * GET    /api/likes?target_type=post&target_id=...
 * POST   /api/likes { targetType, targetId }
 * DELETE /api/likes { targetType, targetId }
 *
 * 响应恒为 { count, liked }，不返回 visitor_id / ip_hash / 点赞记录（module 07 §5）。
 * 计数来自数据库聚合，前端乐观值只用于即时反馈。
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' } as const

function unavailable() {
  return NextResponse.json(
    {
      error: 'interactions_unavailable',
      message: '互动功能需要数据库支持，请配置 DATABASE_URL。',
    },
    { status: 503, headers: NO_STORE },
  )
}

function badRequest(message: string) {
  return NextResponse.json({ error: 'invalid_request', message }, { status: 400, headers: NO_STORE })
}

/** 目标必须存在且公开（module 07 §7：防止对任意 id 灌点赞）。 */
async function targetExists(type: TargetType, id: string): Promise<boolean> {
  const ports = getDataPorts()
  if (type === 'post') return (await ports.posts.getBySlug(id)) !== null
  return (await ports.timeline.getPublic(id)) !== undefined
}

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) return unavailable()

  const url = new URL(request.url)
  const parsed = likeTargetSchema.safeParse({
    targetType: url.searchParams.get('target_type'),
    targetId: url.searchParams.get('target_id'),
  })
  if (!parsed.success) return badRequest('缺少或非法的 target_type / target_id')

  if (!(await targetExists(parsed.data.targetType, parsed.data.targetId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  // GET 不创建 cookie：只读取已有标识，避免列表页浏览时批量下发 cookie。
  const visitorId = await readVisitorId()
  const state = await getDataPorts().interactions.getLikeState(
    { type: parsed.data.targetType, id: parsed.data.targetId },
    visitorId,
  )

  return NextResponse.json(state, { headers: NO_STORE })
}

async function mutate(request: Request, action: 'add' | 'remove') {
  if (!hasDatabaseUrl()) return unavailable()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('请求体不是合法 JSON')
  }

  const parsed = likeTargetSchema.safeParse(body)
  if (!parsed.success) return badRequest('targetType 或 targetId 不合法')

  const { targetType, targetId } = parsed.data

  if (!(await targetExists(targetType, targetId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const { visitorId } = await ensureVisitorId()
  const { ipHash } = requestFingerprint(request.headers)

  // 点赞可撤销，但高频切换仍属异常；阈值放宽到每分钟 30 次。
  const limit = checkRateLimit(`like:${visitorId}`, 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: '操作过于频繁，请稍后再试。' },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(limit.retryAfterSeconds) } },
    )
  }

  const ports = getDataPorts()
  const target = { type: targetType, id: targetId }
  const state =
    action === 'add'
      ? await ports.interactions.addLike(target, visitorId, ipHash)
      : await ports.interactions.removeLike(target, visitorId)

  // 只在新增点赞时记活动事件，且用「目标 + 访客」作幂等键：
  // 同一访客反复取消/重新点赞不会刷屏（module 07 §6、09 §4）。
  // 写活动失败不影响点赞本身，因此单独兜底。
  if (action === 'add' && state.liked) {
    await ports.activity
      .record({
        eventType: 'like_created',
        target,
        dedupeKey: `like:${targetType}:${targetId}:${visitorId}`,
      })
      .catch(() => {
        // 静默：活动流不是点赞的必要条件。
      })
  }

  return NextResponse.json(state, { headers: NO_STORE })
}

export async function POST(request: Request) {
  return mutate(request, 'add')
}

export async function DELETE(request: Request) {
  return mutate(request, 'remove')
}
