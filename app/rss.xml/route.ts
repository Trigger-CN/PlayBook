import { siteConfig } from '@/config/site'
import { getDataPorts } from '@/lib/data'

/**
 * RSS 2.0 feed（设计 module 11 §7）。
 *
 * 设计取舍：
 * - **只输出摘要，不输出全文**。设计 §7 明确「推荐摘要降低 MDX 自定义组件问题」；
 *   全文 feed 需要把 MDX 编译成 HTML 再塞进 XML，自定义组件一旦引入客户端
 *   交互就会产生非法标记。
 * - **只包含已发布且非未来的文章**。端口层的 `list()` 已经用
 *   `status='published' and (published_at is null or published_at <= now())`
 *   过滤过，这里不再重复判断 —— 两处各判一次只会让规则漂移。
 * - **链接使用绝对 canonical**，来源是 `NEXT_PUBLIC_SITE_URL`。
 * - 手动 XML 转义：标题与摘要里可能出现 `&`、`<`、`"`，RSS 是 XML，
 *   不转义就会生成解析失败的 feed。
 */

/** 与页面共用同一个数据源；缓存一小时，随文章发布失效。 */
export const revalidate = 3600

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * RSS 的 pubDate 必须是 RFC 822 格式（如 `Thu, 17 Jul 2026 00:00:00 GMT`）。
 * 纯日期没有时刻，统一按 UTC 零点输出，避免同一篇文章在不同部署时区
 * 显示成不同日期。
 */
function toRfc822(isoDate: string): string {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed)) return new Date(0).toUTCString()
  return new Date(parsed).toUTCString()
}

export async function GET() {
  const base = siteConfig.url.replace(/\/$/, '')
  const ports = getDataPorts()
  const { items } = await ports.posts.list({ pageSize: 20 })

  const lastBuildDate =
    items.length > 0
      ? toRfc822(items[0]!.updatedAt ?? items[0]!.publishedAt)
      : new Date(0).toUTCString()

  const entries = items
    .map((post) => {
      const url = `${base}/posts/${post.slug}`
      // 去重：category 常常与 tags 里的某一项同名（本项目现有文章就是如此），
      // 不去重会输出两个相同的 <category>，在阅读器里显示为重复标签。
      const categories = Array.from(
        new Set(
          [post.category, ...post.tags].filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      )

      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${toRfc822(post.publishedAt)}</pubDate>`,
        `      <description>${escapeXml(post.summary)}</description>`,
        ...categories.map((category) => `      <category>${escapeXml(category)}</category>`),
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(siteConfig.name)}</title>`,
    `    <link>${escapeXml(base)}</link>`,
    `    <description>${escapeXml(siteConfig.bio)}</description>`,
    '    <language>zh-CN</language>',
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${base}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    entries,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      // 与 revalidate 一致：feed 是聚合结果，秒级新鲜度没有意义，
      // 但也不该被 CDN 长期钉住。
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=600',
    },
  })
}
