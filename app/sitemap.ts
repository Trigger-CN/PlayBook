import type { MetadataRoute } from 'next'

import { siteConfig } from '@/config/site'
import { listPosts } from '@/lib/content/repository'

/**
 * sitemap 只包含已发布文章与静态公开页（设计 module 11 §6）。
 * 自动排除草稿、归档、后台与组合搜索页。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url.replace(/\/$/, '')
  const { items } = await listPosts({ pageSize: 50 })

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

  return [...staticRoutes, ...postRoutes]
}
