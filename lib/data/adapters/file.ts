import 'server-only'

import { filePostRepository } from '@/lib/content/repository'
import { timelineSeed } from '@/lib/timeline/seed'
import type { TimelineItem } from '@/lib/timeline/types'
import { sortTimelineItems } from '@/lib/timeline/view'

import type { DataPorts } from '../ports'

/**
 * 文件 / 种子适配器：未配置数据库时的默认实现。
 * 未配置数据库时整站走这里，保证无外部依赖也能构建与运行。
 */

function isPublic(item: TimelineItem): boolean {
  return item.status === 'published'
}

function publicItems(): TimelineItem[] {
  return sortTimelineItems(timelineSeed.filter(isPublic))
}

/**
 * 互动数据无法落在文件里，读写都明确报错而不是假装成功。
 * 刻意不返回 0 / 空数组：那会让前端看起来正常但数据永远不增长，
 * 从而掩盖「未配置数据库」这一事实（决策 D-12 决策二）。
 */
function interactionsUnavailable(): never {
  throw new Error(
    '互动数据需要数据库：请配置 DATABASE_URL 后使用 PostgreSQL 实现（当前为文件/种子模式）',
  )
}

export const filePorts: DataPorts = {
  driver: 'file',

  posts: {
    list: (query) => filePostRepository.list(query),
    getBySlug: (slug) => filePostRepository.getBySlug(slug),
    listTags: () => filePostRepository.listTags(),
    listCategories: () => filePostRepository.listCategories(),
  },

  timeline: {
    listPublic: async () => publicItems(),
    getPublic: async (id) => publicItems().find((item) => item.id === id),
    getAdjacent: async (id) => {
      const items = publicItems()
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) return {}
      return {
        newer: index > 0 ? items[index - 1] : undefined,
        older: index < items.length - 1 ? items[index + 1] : undefined,
      }
    },
  },

  interactions: {
    getLikeState: async () => interactionsUnavailable(),
    getLikeCounts: async () => interactionsUnavailable(),
    addLike: async () => interactionsUnavailable(),
    removeLike: async () => interactionsUnavailable(),
    recordView: async () => interactionsUnavailable(),
    listApprovedComments: async () => interactionsUnavailable(),
    countApprovedComments: async () => interactionsUnavailable(),
    createComment: async () => interactionsUnavailable(),
  },

  stats: {
    getContentTotals: async () => {
      const posts = await filePostRepository.list({ pageSize: 1 })
      return {
        postsTotal: posts.total,
        timelineTotal: publicItems().length,
      }
    },
    // 无数据库时浏览/点赞/评论恒为 0，这是真实值而非占位符：
    // 文件模式确实没有这些数据，且互动写入本身会抛错。
    getSiteTotals: async () => {
      const posts = await filePostRepository.list({ pageSize: 1 })
      return {
        views: 0,
        likes: 0,
        comments: 0,
        postsTotal: posts.total,
        timelineTotal: publicItems().length,
      }
    },
    listPopular: async () => [],
    listRecentActivity: async () => [],
    // 文件模式没有每日聚合表，因此序列恒为空、聚合日期恒为 null。
    // 返回空数组而不是造一条全零序列：后者会被误读为「那几天真的没人看」。
    getDailySeries: async () => [],
    getLastAggregatedDate: async () => null,
  },

  activity: {
    // 活动事件与每日聚合都是纯数据库概念，文件模式下无法表达。
    record: async () => interactionsUnavailable(),
    recordViewMilestone: async () => interactionsUnavailable(),
    backfillDailyStats: async () => interactionsUnavailable(),
  },
}
