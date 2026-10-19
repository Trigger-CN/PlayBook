import type { MetadataRoute } from 'next'

import { siteConfig } from '@/config/site'

/**
 * robots（设计 module 11 §6）。
 * robots 只是爬虫约定，不是权限控制；后台仍有服务端授权。
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteConfig.url.replace(/\/$/, '')

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/preview/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
