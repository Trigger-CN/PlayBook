import type { Metadata } from 'next'

import { TimelineExplorer } from '@/components/site/timeline-explorer'
import { getDataPorts } from '@/lib/data'

export const metadata: Metadata = {
  title: '时间轴',
  description: '按时间顺序记录的项目、旅行、阅读与随手记。',
}

export default async function TimelinePage() {
  const items = await getDataPorts().timeline.listPublic()

  return (
    <>
      <header className="pb-8 pt-8">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-[7px] text-xs font-extrabold"
          style={{ background: 'var(--cream)', color: 'var(--on-accent)' }}
        >
          TIMELINE / 时间轴
        </span>
        <h1 className="mt-5 font-display text-[clamp(34px,5vw,52px)] leading-[1.05]">
          一条可以回看的线
        </h1>
        <p className="mt-3 max-w-[640px] text-[17px] leading-relaxed text-[var(--muted)]">
          把零散的更新按时间排在一起。可以按类型筛选，也可以直接从年份跳过去。
        </p>
      </header>

      <TimelineExplorer items={items} />
    </>
  )
}
