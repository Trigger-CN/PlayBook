export const metadata = {
  title: '统计',
  description: '站点活跃度、内容规模与阅读趋势。',
}

/**
 * 公开统计页骨架（设计 07 / Phase 7）。
 * 聚合数据来自 site_daily_stats，页面只读聚合结果，不扫描原始事件表。
 */
export default function StatsPage() {
  return (
    <>
      <h1 className="mt-2 font-display text-[clamp(34px,5vw,46px)]">站点统计</h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[var(--muted)]">
        展示站点长期活跃程度与内容规模。指标来自每日聚合，非实时数据。
      </p>

      <div
        className="mt-8 rounded-2xl border-2 border-dashed p-10 text-center"
        style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
      >
        <p className="text-sm font-bold">统计数据尚未接入</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Phase 7 将接入 site_daily_stats 聚合表，并标注口径与最后聚合时间。
        </p>
      </div>
    </>
  )
}
