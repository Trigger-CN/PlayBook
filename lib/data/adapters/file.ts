import 'server-only'

import { filePostRepository } from '@/lib/content/repository'
import { timelineSeed } from '@/lib/timeline/seed'
import type { TimelineItem } from '@/lib/timeline/types'
import { sortTimelineItems } from '@/lib/timeline/view'

import type { DataPorts } from '../ports'

/**
 * 文件 / 种子适配器：当前默认实现。
 * 未配置数据库时整站走这里，保证无外部依赖也能构建与运行。
 */

function isPublic(item: TimelineItem): boolean {
  return item.status === 'published'
}

function publicItems(): TimelineItem[] {
  return sortTimelineItems(timelineSeed.filter(isPublic))
}

/** 互动数据无法落在文件里，读写都明确报错而不是假装成功。 */
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
    recordView: async () => interactionsUnavailable(),
    listApprovedComments: async () => interactionsUnavailable(),
  },

  stats: {
    getContentTotals: async () => {
      const posts = await filePostRepository.list({ pageSize: 1 })
      return {
        postsTotal: posts.total,
        timelineTotal: publicItems().length,
      }
    },
  },
}
