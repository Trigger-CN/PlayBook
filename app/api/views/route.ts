import { NextResponse } from 'next/server'

import { getDataPorts, hasDatabaseUrl } from '@/lib/data'
import { checkRateLimit } from '@/lib/interactions/rate-limit'
import { ensureVisitorId, requestFingerprint } from '@/lib/interactions/server-context'
import { viewInputSchema } from '@/lib/interactions/validators'

/**
 * 浏览量上报（设计 module 08 §6）。
 *
 * POST /api/views { path, targetType?, targetId? }
 * Response: { counted: boolean }
 *
 * 去重由数据库函数 record_page_view 在单条语句内完成（module 08 §4）：
 * 同一 visitor 对同一目标 30 分钟内只计一次，避免「先查后写」的并发窗口。
 *
 * 隐私：不存明文 IP，只存加盐哈希；referrer 只保留 origin（module 08 §9）。
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' } as const

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    // 浏览量在文件模式下无法记录，但这不是错误状态：
    // 页面正常阅读，只是计数不增长。返回 204 避免前端报错噪音。
    return new NextResponse(null, { status: 204, headers: NO_STORE })
  }

  const raw = await request.text()
  if (raw.length > 2_000) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  const parsed = viewInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  const { path, targetType, targetId } = parsed.data

  // targetType 与 targetId 必须成对出现（与 page_views_target_pair_check 对齐）。
  if ((targetType === undefined) !== (targetId === undefined)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers: NO_STORE })
  }

  const { visitorId } = await ensureVisitorId()
  const { ipHash, userAgentHash, referrer } = requestFingerprint(request.headers)

  // 防止脚本狂刷：同一访客每分钟最多 60 次上报。
  const limit = checkRateLimit(`view:${visitorId}`, 60, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { counted: false, error: 'rate_limited' },
      { status: 429, headers: { ...NO_STORE, 'retry-after': String(limit.retryAfterSeconds) } },
    )
  }

  const counted = await getDataPorts().interactions.recordView({
    path,
    target: targetType && targetId ? { type: targetType, id: targetId } : undefined,
    visitorId,
    ipHash,
    userAgentHash,
    referrer,
  })

  // 浏览本身不进活动流（否则会被刷屏），只在达到里程碑时记一条
  // （module 09 §4「高频浏览不逐条进入活动流，只生成里程碑」）。
  // 只在真正计入时才检查里程碑，去重被拦下的重复请求不触发。
  if (counted && targetType && targetId) {
    const ports = getDataPorts()
    const target = { type: targetType, id: targetId }
    const title =
      targetType === 'post'
        ? (await ports.posts.getBySlug(targetId))?.frontmatter.title ?? null
        : (await ports.timeline.getPublic(targetId))?.title ?? null

    await ports.activity.recordViewMilestone(target, title).catch(() => {
      // 静默：里程碑不是浏览记录的必要条件。
    })
  }

  return NextResponse.json({ counted }, { headers: NO_STORE })
}
