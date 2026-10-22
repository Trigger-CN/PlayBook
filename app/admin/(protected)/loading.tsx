/**
 * 后台加载态（设计 08 §3.5：与内容同尺寸的骨架，避免 CLS）。
 * 不显示后台数据，只占位结构。
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载</span>
      <div className="mb-6 h-8 w-40 animate-pulse rounded-lg" style={{ background: 'var(--soft)' }} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[86px] animate-pulse rounded-2xl"
            style={{ background: 'var(--soft)' }}
          />
        ))}
      </div>
      <div className="mt-6 grid gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[74px] animate-pulse rounded-xl"
            style={{ background: 'var(--soft)' }}
          />
        ))}
      </div>
    </div>
  )
}
