import { timelineSeed } from '@/lib/timeline/seed'
import type { TimelineItem } from '@/lib/timeline/types'
import { sortTimelineItems } from '@/lib/timeline/view'

/** 只有 published 进入公开页面；draft 与 archived 都不展示。 */
function isPublic(item: TimelineItem): boolean {
  return item.status === 'published'
}

export function listPublicTimelineItems(): TimelineItem[] {
  return sortTimelineItems(timelineSeed.filter(isPublic))
}

export function getPublicTimelineItem(id: string): TimelineItem | undefined {
  return timelineSeed.find((item) => item.id === id && isPublic(item))
}

/** 列表按发生时间倒序，因此前一项更新、后一项更早。 */
export function getAdjacentTimelineItems(id: string): {
  newer?: TimelineItem
  older?: TimelineItem
} {
  const items = listPublicTimelineItems()
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return {}
  return {
    newer: index > 0 ? items[index - 1] : undefined,
    older: index < items.length - 1 ? items[index + 1] : undefined,
  }
}
