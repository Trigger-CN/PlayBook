export const metadata = {
  title: '时间轴',
  description: '按年月浏览个人事件、项目进展与里程碑。',
}

/**
 * 时间轴列表页骨架（设计 04 / Phase 4）。
 * 数据层将在 Phase 5 接入 Supabase；当前先建立路由与空状态，
 * 使站点外壳、导航与构建链路可完整验证。
 */
export default function TimelinePage() {
  return (
    <>
      <h1 className="mt-2 font-display text-[clamp(34px,5vw,46px)]">时间轴</h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[var(--muted)]">
        按发生时间倒序排列的个人事件、项目进展与里程碑。节点类型以颜色与文本共同区分。
      </p>

      <div
        className="mt-8 rounded-2xl border-2 border-dashed p-10 text-center"
        style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
      >
        <p className="text-sm font-bold">时间轴数据尚未接入</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Phase 4 先以本地种子数据实现页面，Phase 5 接入 Supabase 后展示真实节点。
        </p>
      </div>
    </>
  )
}
