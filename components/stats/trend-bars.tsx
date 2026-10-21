import type { DailyStatPoint } from '@/lib/data/ports'

/**
 * 近 N 天浏览趋势（设计 07 §2.1「趋势区」、§7「图表可访问性」）。
 *
 * 刻意不引入图表库：
 * - 只有一条序列（浏览），柱状已经能表达清楚，多引一个客户端库会让这个
 *   本来可以是纯静态的页面变成需要 hydration 的页面。
 * - 设计 07 §7 要求「每张图表提供标题、文字摘要和可访问数据表」。
 *   这里用 Tailwind 的 sr-only 表格提供等价信息，而不是只给一个 aria-label
 *   ——后者只能说明「这是图」，说不出每天的具体数字。
 *
 * 颜色之外还用高度与数值标签区分，不依赖单一视觉通道。
 */

const MAX_BARS = 30

export type TrendBarsProps = {
  series: DailyStatPoint[]
  /** 指标名，用于标题与表头，例如「浏览」。 */
  label: string
  /** 取序列里的哪个字段。 */
  metric: 'views' | 'likes' | 'comments'
  tone?: 'mint' | 'coral' | 'sky'
}

function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return month && day ? `${month}.${day}` : isoDate
}

export function TrendBars({ series, label, metric, tone = 'sky' }: TrendBarsProps) {
  const points = series.slice(-MAX_BARS)
  const peak = points.reduce((max, point) => Math.max(max, point[metric]), 0)
  const total = points.reduce((sum, point) => sum + point[metric], 0)

  if (points.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        暂无{label}数据。每日聚合任务尚未产出记录。
      </p>
    )
  }

  // 峰值归零时所有柱子都应为 0 高度，而不是除零后变成 NaN 或全高。
  const scale = (value: number) => (peak === 0 ? 0 : Math.round((value / peak) * 100))

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-[13px] font-bold text-[var(--muted)]">
        近 {points.length} 天{label} · 合计 {total} · 单日峰值 {peak}
      </figcaption>

      <div
        className="flex h-[132px] items-end gap-[3px]"
        aria-hidden="true"
        style={{ borderBottom: '2px solid var(--line)' }}
      >
        {points.map((point) => (
          <div
            key={point.date}
            className="flex-1 rounded-t-[3px]"
            style={{
              height: `${Math.max(scale(point[metric]), point[metric] > 0 ? 4 : 0)}%`,
              background: `var(--${tone})`,
              minWidth: '3px',
            }}
            title={`${point.date}：${point[metric]}`}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[11px] font-bold text-[var(--muted)]">
        <span>{shortDate(points[0]!.date)}</span>
        <span>{shortDate(points[points.length - 1]!.date)}</span>
      </div>

      {/* 屏幕阅读器等价内容：图表本身 aria-hidden，数字从这里读。 */}
      <table className="sr-only">
        <caption>近 {points.length} 天每日{label}</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">{label}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{point[metric]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
