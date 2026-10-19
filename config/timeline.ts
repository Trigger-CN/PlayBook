import type { TimelineType } from '@/lib/timeline/types'

export type TimelineTone = 'coral' | 'pink' | 'cream' | 'mint' | 'sky' | 'lilac'

export type TimelineTypeStyle = {
  /** 类型的中文名，必须与颜色同时出现，不能只靠颜色区分类型。 */
  label: string
  icon: string
  /** 主题色对名称，同时用于卡片底座与节点圆点。 */
  tone: TimelineTone
}

/** 类型到标签、图标、色对的唯一映射：列表、筛选、详情都从这里取。 */
export const timelineTypeStyles = {
  note: { label: '随手记', icon: '✎', tone: 'cream' },
  milestone: { label: '里程碑', icon: '✦', tone: 'coral' },
  project: { label: '项目', icon: '◆', tone: 'sky' },
  release: { label: '发布', icon: '▲', tone: 'pink' },
  travel: { label: '旅行', icon: '➤', tone: 'mint' },
  reading: { label: '阅读', icon: '❏', tone: 'lilac' },
} satisfies Record<TimelineType, TimelineTypeStyle>
