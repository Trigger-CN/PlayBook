/**
 * 缓存 tag 与失效矩阵（设计 module 13 §4-5）。
 * 全部 tag 集中定义，禁止在业务代码里手写字符串。
 */

export const cacheTags = {
  siteConfig: 'site-config',
  home: 'home',
  posts: 'posts',
  post: (slug: string) => `post:${slug}`,
  tag: (slug: string) => `tag:${slug}`,
  category: (slug: string) => `category:${slug}`,
  timeline: 'timeline',
  timelineItem: (id: string) => `timeline-item:${id}`,
  comments: (targetType: string, targetId: string) => `comments:${targetType}:${targetId}`,
  statsPublic: 'stats-public',
  statsAdmin: 'stats-admin',
  rss: 'rss',
  sitemap: 'sitemap',
} as const

/** 发布/更新时间轴节点后应失效的 tag 集合。 */
export function timelineInvalidationTags(id: string): string[] {
  return [cacheTags.timelineItem(id), cacheTags.timeline, cacheTags.home, cacheTags.statsPublic]
}

/** 发布/更新文章后应失效的 tag 集合。 */
export function postInvalidationTags(slug: string, tags: string[], category?: string): string[] {
  const result = [
    cacheTags.post(slug),
    cacheTags.posts,
    cacheTags.home,
    cacheTags.rss,
    cacheTags.sitemap,
  ]
  for (const tag of tags) result.push(cacheTags.tag(tag))
  if (category) result.push(cacheTags.category(category))
  return result
}
