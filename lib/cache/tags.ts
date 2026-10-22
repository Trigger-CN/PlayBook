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

/**
 * ## 为什么光有 tag 不够，还必须按路径失效
 *
 * `revalidateTag(tag)` 只能失效**带该 tag 的缓存条目** —— 也就是用
 * `fetch(url, { next: { tags } })` 或 `unstable_cache(fn, keys, { tags })`
 * 建立的条目。
 *
 * 本项目的公开页面**全部经 `getDataPorts()` 直连 `pg` 查询**，既不是 `fetch`
 * 也不是 `unstable_cache`，因此**没有任何缓存条目携带这些 tag**。
 * 于是 `revalidateTag` 在这里是一次空操作：调用不会报错，但静态页
 * （`/`、`/posts/[slug]`、`/rss.xml`、`/sitemap.xml`）会继续拿构建期的
 * 旧 HTML，直到进程重启。
 *
 * 表现是：在后台把一篇文章归档，`/posts` 列表立刻不再显示它（该页是
 * Dynamic），但 `/posts/<slug>` 仍然 200、首页仍然列着它、RSS 里还在。
 * 这类「一半生效」最难被发现。
 *
 * 正确的失效手段是按**路径**失效路由缓存，所以下面这组函数与 tag 并列
 * 维护在同一个模块里 —— 两者必须一起改，否则又会出现「改了但没生效」。
 */
export function revalidatePostPaths(slug: string): string[] {
  return ['/', '/posts', `/posts/${slug}`, '/rss.xml', '/sitemap.xml']
}

/** 时间轴节点变动时受影响的路由（`/[id]` 与列表、首页）。 */
export function revalidateTimelinePaths(id: string): string[] {
  return ['/', '/timeline', `/timeline/${id}`, '/sitemap.xml']
}

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
