import type { MetadataRoute } from 'next'

import { siteConfig } from '@/config/site'
import { getDataPorts } from '@/lib/data'

/**
 * sitemap 只包含已发布文章、公开时间轴与静态公开页（设计 module 11 §6）。
 * 自动排除草稿、归档、后台、预览与组合搜索页。
 *
 * 必须经 getDataPorts() 而不是直接引用文件仓库：
 * 有 DATABASE_URL 时正文与元数据在数据库里，直接读文件会漏掉仅存在于库的文章，
 * 也会让 sitemap 与页面看到的「已发布集合」不一致。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url.replace(/\/$/, '')
  const ports = getDataPorts()

  const [{ items }, timelineItems] = await Promise.all([
    ports.posts.list({ pageSize: 50 }),
    ports.timeline.listPublic(),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/posts`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/timeline`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/stats`, changeFrequency: 'daily', priority: 0.5 },
  ]

  const postRoutes: MetadataRoute.Sitemap = items.map((post) => ({
    url: `${base}/posts/${post.slug}`,
    lastModified: post.updatedAt ?? post.publishedAt,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  // 时间轴节点用 occurredAt 作为 lastModified：它没有 updatedAt 语义，
  // 拿「内容发生的日期」比拿构建日期更接近真实变更时间。
  const timelineRoutes: MetadataRoute.Sitemap = timelineItems.map((item) => ({
    url: `${base}/timeline/${item.id}`,
    lastModified: item.occurredAt,
    changeFrequency: 'yearly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...postRoutes, ...timelineRoutes]
}
