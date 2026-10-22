import type { TimelineType } from '@/lib/timeline/types'
import type { IconName } from '@/components/ui/icon'

export type TimelineTone = 'coral' | 'pink' | 'cream' | 'mint' | 'sky' | 'lilac'

export type TimelineTypeStyle = {
  /** 类型的中文名，必须与颜色同时出现，不能只靠颜色区分类型。 */
  label: string
  /** Material Symbols 图标名（内联 SVG，见 components/ui/icon.tsx）。 */
  icon: IconName
  /** 主题色对名称，同时用于卡片底座与节点圆点。 */
  tone: TimelineTone
}

/**
 * 类型到标签、图标、色对的唯一映射：列表、筛选、详情都从这里取。
 *
 * 图标只做视觉强化，语义由 label 承担 —— 设计 module 02 §7 要求
 * 图标缺失时仍有文字，所以两者必须同时出现，不允许只渲染图标。
 */
export const timelineTypeStyles = {
  note: { label: '随手记', icon: 'edit_note', tone: 'cream' },
  milestone: { label: '里程碑', icon: 'emoji_events', tone: 'coral' },
  project: { label: '项目', icon: 'folder_special', tone: 'sky' },
  release: { label: '发布', icon: 'rocket_launch', tone: 'pink' },
  travel: { label: '旅行', icon: 'flight', tone: 'mint' },
  reading: { label: '阅读', icon: 'menu_book', tone: 'lilac' },
} satisfies Record<TimelineType, TimelineTypeStyle>
