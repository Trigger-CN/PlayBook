import type { TimelineItem } from '@/lib/timeline/types'

/** 按发生时间倒序，同日用 id 倒序做稳定兜底（module 05 §5）。 */
export function sortTimelineItems(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1
    if (a.id === b.id) return 0
    return a.id < b.id ? 1 : -1
  })
}

export function formatTimelineDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (!year || !month || !day) return isoDate
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
}

export function formatTimelineDay(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return isoDate
  return `${Number(month)} 月 ${Number(day)} 日`
}

/** 列表只展示首段，避免长正文把卡片撑高。 */
export function firstParagraph(content: string): string {
  const [first] = content.split(/\n{2,}/)
  return (first ?? '').trim()
}

export type TimelineMonthGroup = {
  key: string
  label: string
  items: TimelineItem[]
}

export type TimelineYearGroup = {
  key: string
  label: string
  count: number
  months: TimelineMonthGroup[]
}

/** 输入必须已按 sortTimelineItems 排序；分组保持原有顺序。 */
export function groupTimelineItems(items: TimelineItem[]): TimelineYearGroup[] {
  const years: TimelineYearGroup[] = []
  const yearIndex = new Map<string, TimelineYearGroup>()
  const monthIndex = new Map<string, TimelineMonthGroup>()

  for (const item of items) {
    const yearKey = item.occurredAt.slice(0, 4)
    const monthKey = item.occurredAt.slice(0, 7)

    let yearGroup = yearIndex.get(yearKey)
    if (!yearGroup) {
      yearGroup = { key: yearKey, label: `${yearKey} 年`, count: 0, months: [] }
      yearIndex.set(yearKey, yearGroup)
      years.push(yearGroup)
    }

    let monthGroup = monthIndex.get(monthKey)
    if (!monthGroup) {
      monthGroup = { key: monthKey, label: `${Number(monthKey.slice(5, 7))} 月`, items: [] }
      monthIndex.set(monthKey, monthGroup)
      yearGroup.months.push(monthGroup)
    }

    monthGroup.items.push(item)
    yearGroup.count += 1
  }

  return years
}
