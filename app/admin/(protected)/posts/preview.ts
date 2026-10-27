'use server'

import { requireAdmin } from '@/lib/auth/admin'
import { renderMarkdownToHtml } from '@/lib/content/markdown'

/**
 * 后台正文预览（决策 D-32）。
 *
 * 预览**不**在客户端另写一套渲染：那样预览与线上迟早会不一致，而「预览里好好的、
 * 发布后坏了」是最难查的一类问题。这里直接调用公开文章页用的同一个 processor。
 *
 * 为什么是 Server Action 而不是一条预览路由：
 * 路由要额外处理 token、noindex 与鉴权三件事；一个 Action 天然继承当前会话，
 * 也不需要把未发布的正文暴露在任何可被索引的 URL 上（包括 `noindex` 但可抓取的）。
 */

/** 单次预览的上限。超过这个长度不是写文章，是灌数据。 */
const MAX_PREVIEW_LENGTH = 200_000

export type PreviewResult = { ok: true; html: string } | { ok: false; message: string }

export async function previewBody(body: string): Promise<PreviewResult> {
  const identity = await requireAdmin()
  if (!identity) return { ok: false, message: '会话已失效，请重新登录后再预览。' }

  if (body.length > MAX_PREVIEW_LENGTH) {
    return { ok: false, message: '正文过长，预览暂时只处理 20 万字符以内的内容。' }
  }

  if (body.trim() === '') return { ok: true, html: '' }

  try {
    return { ok: true, html: await renderMarkdownToHtml(body) }
  } catch (error) {
    // 预览失败不阻断编辑，把原因说清楚就够；不回显调用栈。
    const detail = error instanceof Error ? error.message : '未知错误'
    return { ok: false, message: `渲染失败：${detail}` }
  }
}
