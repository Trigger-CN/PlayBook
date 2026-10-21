import { NextResponse } from 'next/server'

import { getDataPorts, hasDatabaseUrl } from '@/lib/data'
import { checkRateLimit } from '@/lib/interactions/rate-limit'
import { requestFingerprint, hashValue } from '@/lib/interactions/server-context'
import { isTargetType, type TargetType } from '@/lib/interactions/types'
import { commentInputSchema } from '@/lib/interactions/validators'

/**
 * 统一评论接口（设计 module 06 §6）。
 *
 * GET  /api/comments?target_type=post&target_id=...
 * POST /api/comments { targetType, targetId, authorName, content, authorEmail? }
 *
 * 安全要点：
 * - 新评论恒为 pending，服务端强制，不接受客户端传入 status（module 06 §3）。
 * - 响应不返回邮箱 / IP / 内部审核状态（module 06 §6）。
 * - 统一成功文案，降低目标枚举与审核策略泄漏（module 06 §7）。
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

function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { error: 'invalid_request', message, details },
    { status: 400, headers: NO_STORE },
  )
}

async function targetExists(type: TargetType, id: string): Promise<boolean> {
  const ports = getDataPorts()
  if (type === 'post') return (await ports.posts.getBySlug(id)) !== null
  return (await ports.timeline.getPublic(id)) !== undefined
}

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) return unavailable()

  const url = new URL(request.url)
  const targetType = url.searchParams.get('target_type')
  const targetId = url.searchParams.get('target_id')

  if (!isTargetType(targetType) || !targetId) {
    return badRequest('缺少或非法的 target_type / target_id')
  }

  const limitParam = Number(url.searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 100) : 50

  const ports = getDataPorts()
  const [comments, total] = await Promise.all([
    ports.interactions.listApprovedComments({ type: targetType, id: targetId }, limit),
    ports.interactions.countApprovedComments({ type: targetType, id: targetId }),
  ])

  return NextResponse.json({ comments, total }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) return unavailable()

  // 限制请求体大小，防止超大 payload（module 06 §6）。
  const raw = await request.text()
  if (raw.length > 8_000) return badRequest('请求体过大')

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return badRequest('请求体不是合法 JSON')
  }

  const parsed = commentInputSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(
      '评论内容不合法',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  const { targetType, targetId, authorName, content, authorEmail } = parsed.data

  if (!(await targetExists(targetType, targetId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const { ipHash, userAgentHash } = requestFingerprint(request.headers)

  // 多维限流：IP 与目标各自计数（module 06 §7）。
  const ipKey = ipHash ?? 'unknown'
  const perIp = checkRateLimit(`comment:ip:${ipKey}`, 5, 10 * 60_000)
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: '提交过于频繁，请稍后再试。' },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(perIp.retryAfterSeconds) } },
    )
  }
  const perTarget = checkRateLimit(`comment:target:${targetType}:${targetId}`, 20, 60 * 60_000)
  if (!perTarget.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', message: '该内容评论较多，请稍后再试。' },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(perTarget.retryAfterSeconds) } },
    )
  }

  const ports = getDataPorts()
  await ports.interactions.createComment({
    target: { type: targetType, id: targetId },
    authorName,
    content,
    // 邮箱只存哈希，不存明文（module 06 §7）。
    authorEmailHash: authorEmail ? hashValue(`email:${authorEmail.toLowerCase()}`) : null,
    ipHash,
    userAgentHash,
  })

  // 统一成功文案：不透露内部评分、不确认目标是否存在之外的信息。
  return NextResponse.json(
    { ok: true, message: '评论已提交，将在审核后显示。' },
    { status: 201, headers: NO_STORE },
  )
}
