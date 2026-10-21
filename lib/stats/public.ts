import 'server-only'

import { getDataPorts } from '@/lib/data'
import type { DailyStatPoint, PopularItem, PublicStats } from '@/lib/data/ports'

/**
 * 公开统计页的数据组装（设计 07 §5）。
 *
 * 只调用端口层，不直接查库：这样文件模式下也能渲染，
 * 并且「哪些数字在文件模式下拿不到」这件事由端口层用 `aggregated` 显式表达，
 * 而不是在这里猜。
 */

/** 趋势窗口。设计 07 §3 允许 30/90/365，MVP 只开放 30 天。 */
export const STATS_WINDOW_DAYS = 30

/** 热门榜取前 N 条。 */
const POPULAR_LIMIT = 5

/** 热门项补上可读标题与链接，避免页面自己再猜 targetType 的含义。 */
export type RankedContent = {
  targetType: PopularItem['targetType']
  targetId: string
  title: string
  href: string
  count: number
}

async function resolveRanked(items: PopularItem[]): Promise<RankedContent[]> {
  const ports = getDataPorts()

  return Promise.all(
    items.map(async (item) => {
      if (item.targetType === 'post') {
        const post = await ports.posts.getBySlug(item.targetId)
        return {
          ...item,
          title: post?.frontmatter.title ?? item.targetId,
          href: `/posts/${item.targetId}`,
        }
      }
      const node = await ports.timeline.getPublic(item.targetId)
      return {
        ...item,
        // 时间轴节点允许没有 title（只有正文），此时退回首段，
        // 而不是显示一个裸露的 slug。
        title: node?.title ?? node?.content.slice(0, 40) ?? item.targetId,
        href: `/timeline/${item.targetId}`,
      }
    }),
  )
}

export async function loadPublicStats(days = STATS_WINDOW_DAYS): Promise<PublicStats> {
  const ports = getDataPorts()

  const [totals, series, popularPosts, popularTimeline, aggregatedAt] = await Promise.all([
    ports.stats.getSiteTotals(),
    ports.stats.getDailySeries(days),
    ports.stats.listPopular('views', POPULAR_LIMIT),
    ports.stats.listPopular('likes', POPULAR_LIMIT),
    ports.stats.getLastAggregatedDate(),
  ])

  return {
    totals,
    series,
    popularPosts,
    popularTimeline,
    aggregatedAt,
    // 「是否有聚合能力」的判据是能否拿到聚合日期，而不是 series 是否非空：
    // 有库但还没跑过聚合时 aggregatedAt 为 null，页面该提示「聚合任务尚未运行」，
    // 这与「文件模式根本没有聚合表」是两种不同的空状态。
    aggregated: aggregatedAt !== null,
  }
}

/** 同时解析浏览榜与点赞榜，供后台分析页并列展示。 */
export async function loadRankedPopular(): Promise<{
  byViews: RankedContent[]
  byLikes: RankedContent[]
}> {
  const ports = getDataPorts()
  const [byViews, byLikes] = await Promise.all([
    ports.stats.listPopular('views', POPULAR_LIMIT),
    ports.stats.listPopular('likes', POPULAR_LIMIT),
  ])
  return {
    byViews: await resolveRanked(byViews),
    byLikes: await resolveRanked(byLikes),
  }
}

/** 序列求和，用于「近 30 天」小计。 */
export function sumSeries(series: DailyStatPoint[]): {
  views: number
  likes: number
  comments: number
} {
  return series.reduce(
    (acc, point) => ({
      views: acc.views + point.views,
      likes: acc.likes + point.likes,
      comments: acc.comments + point.comments,
    }),
    { views: 0, likes: 0, comments: 0 },
  )
}

/**
 * 把序列补齐成连续 N 天。
 *
 * 聚合表只会有「跑过聚合的那几天」的行，缺的日子不该从图表里消失
 * ——否则趋势线的横轴会跳过空白天，视觉上把稀疏数据读成连续增长。
 *
 * 这里用 UTC 逐日递减是安全的：入参 `today` 已经是 YYYY-MM-DD 字符串，
 * 我们只在「日期字符串」上做算术，不把任何 Date 转回本地时区。
 */
export function fillSeriesGaps(
  series: DailyStatPoint[],
  days: number,
  today: string,
): DailyStatPoint[] {
  const byDate = new Map(series.map((point) => [point.date, point]))
  const result: DailyStatPoint[] = []
  const end = Date.parse(`${today}T00:00:00Z`)

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end - offset * 86_400_000).toISOString().slice(0, 10)
    result.push(byDate.get(date) ?? { date, views: 0, likes: 0, comments: 0 })
  }

  return result
}
