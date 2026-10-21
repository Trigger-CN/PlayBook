import type { Metadata } from 'next'
import Link from 'next/link'

import { TrendBars } from '@/components/stats/trend-bars'
import { StatBlock } from '@/components/ui/stat-block'
import { getAdminAnalytics } from '@/lib/admin/repository'
import { fillSeriesGaps, loadRankedPopular } from '@/lib/stats/public'

/**
 * 后台分析（设计 13-admin-analytics）。
 *
 * 与公开统计页的关键区别：
 * - 能看到**待审核**评论数（公开页刻意不展示）。
 * - 时间窗口是 7/30/90 天可切换（设计 §3），公开页固定 30 天。
 * - 排行同时给浏览榜与点赞榜，便于判断「被看到」和「被认可」的差异。
 *
 * 图表仍然复用 `TrendBars`：后台不需要第二套图表实现，
 * 而且它自带 sr-only 数据表，满足设计 §7「每个图表提供等价文字和数据表」。
 */

export const metadata: Metadata = {
  title: '分析',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/** 窗口白名单：非法值回退 30 天，不执行查询（设计 §4「自定义范围非法」）。 */
const ALLOWED_WINDOWS = [7, 30, 90] as const
const DEFAULT_WINDOW = 30

function parseWindow(raw: string | undefined): number {
  const parsed = Number(raw)
  return (ALLOWED_WINDOWS as readonly number[]).includes(parsed) ? parsed : DEFAULT_WINDOW
}

type SearchParams = Promise<{ days?: string }>

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const days = parseWindow(params.days)

  const [analytics, ranked] = await Promise.all([getAdminAnalytics(days), loadRankedPopular()])

  // 以「最后聚合日期」为锚点补齐窗口，而不是今天：
  // 聚合任务停跑时不该画出一段全零尾巴冒充「没人访问」。
  const series = analytics.aggregatedAt
    ? fillSeriesGaps(analytics.series, days, analytics.aggregatedAt)
    : []

  const windowViews = series.reduce((sum, point) => sum + point.views, 0)
  const windowLikes = series.reduce((sum, point) => sum + point.likes, 0)

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl">分析</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          数据更新至 {analytics.aggregatedAt ?? '尚未聚合'}。趋势只读每日聚合表，
          不扫描原始事件；累计量直接统计真实表。
        </p>
      </header>

      <nav aria-label="时间范围" className="mb-6 flex flex-wrap gap-2">
        {ALLOWED_WINDOWS.map((value) => {
          const active = value === days
          return (
            <Link
              key={value}
              href={`/admin/analytics?days=${value}`}
              aria-current={active ? 'page' : undefined}
              className="rounded-xl border px-3 py-2 text-sm font-bold"
              style={{
                borderColor: active ? 'var(--ink)' : 'var(--line)',
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              近 {value} 天
            </Link>
          )
        })}
      </nav>

      <section aria-labelledby="admin-totals-title">
        <h2 id="admin-totals-title" className="mb-3 font-display text-xl">
          核心指标
        </h2>
        <div className="stats">
          <StatBlock value={String(analytics.totals.views)} label="累计浏览" tone="sky" />
          <StatBlock value={String(analytics.totals.likes)} label="累计点赞" tone="coral" />
          <StatBlock value={String(analytics.totals.pendingComments)} label="待审核评论" tone="cream" />
          <StatBlock value={String(analytics.totals.approvedComments)} label="已通过评论" tone="mint" />
        </div>
        <div className="stats mt-4">
          <StatBlock value={String(analytics.totals.publishedPosts)} label="已发布文章" tone="sky" />
          <StatBlock
            value={String(analytics.totals.publishedTimeline)}
            label="已发布节点"
            tone="mint"
          />
          <StatBlock value={String(windowViews)} label={`近 ${days} 天浏览`} tone="cream" />
          <StatBlock value={String(windowLikes)} label={`近 ${days} 天点赞`} tone="coral" />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">
          「近 N 天」是聚合表窗口内求和，可能与「累计」不等：累计包含聚合开始之前的历史行。
          两者都是真实值，不是取整误差。
        </p>
      </section>

      <section className="mt-8" aria-labelledby="admin-trend-title">
        <h2 id="admin-trend-title" className="mb-3 font-display text-xl">
          趋势
        </h2>
        {series.length === 0 ? (
          <div
            className="rounded-2xl border-2 border-dashed p-8 text-center"
            style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
          >
            <p className="text-sm font-bold">聚合任务尚未产出数据</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              执行 npm run db:aggregate 或 npm run db:aggregate -- --days {days} 后刷新此页。
            </p>
          </div>
        ) : (
          <div
            className="grid gap-8 rounded-2xl border p-5 lg:grid-cols-3"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <TrendBars series={series} label="浏览" metric="views" tone="sky" />
            <TrendBars series={series} label="点赞" metric="likes" tone="coral" />
            <TrendBars series={series} label="评论" metric="comments" tone="mint" />
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="admin-rank-title">
        <h2 id="admin-rank-title" className="mb-3 font-display text-xl">
          内容排行
        </h2>
        <p className="mb-3 text-[12px] text-[var(--muted)]">
          浏览榜反映「被看到」，点赞榜反映「被认可」。两榜不同属于正常现象。
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-extrabold">按浏览</h3>
            {ranked.byViews.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">暂无浏览记录。</p>
            ) : (
              <ol className="grid gap-1.5">
                {ranked.byViews.map((item, index) => (
                  <li
                    key={`v-${item.targetType}-${item.targetId}`}
                    className="flex items-baseline gap-2 rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
                  >
                    <span className="w-4 shrink-0 font-extrabold text-[var(--muted)]">
                      {index + 1}
                    </span>
                    <Link href={item.href} className="min-w-0 flex-1 truncate font-bold">
                      {item.title}
                    </Link>
                    <span className="shrink-0 font-extrabold">{item.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-extrabold">按点赞</h3>
            {ranked.byLikes.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">暂无点赞记录。</p>
            ) : (
              <ol className="grid gap-1.5">
                {ranked.byLikes.map((item, index) => (
                  <li
                    key={`l-${item.targetType}-${item.targetId}`}
                    className="flex items-baseline gap-2 rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
                  >
                    <span className="w-4 shrink-0 font-extrabold text-[var(--muted)]">
                      {index + 1}
                    </span>
                    <Link href={item.href} className="min-w-0 flex-1 truncate font-bold">
                      {item.title}
                    </Link>
                    <span className="shrink-0 font-extrabold">{item.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 max-w-[720px]" aria-labelledby="admin-notes-title">
        <h2 id="admin-notes-title" className="mb-2 font-display text-xl">
          口径说明
        </h2>
        <ul className="grid gap-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
          <li>· 浏览为去重后的有效次数（同一访客 30 分钟窗口内只计一次）。</li>
          <li>· 评论趋势只统计当日「已通过」的评论；待审核不计入趋势，但计入上方「待审核评论」。</li>
          <li>· 每日聚合的 posts_count / timeline_count 是当日新增发布数（增量），不是累计。</li>
          <li>· 本页不下发任何逐条原始事件、访客标识或 IP / UA 哈希。</li>
          <li>· 来源与设备细分需要足够样本，当前版本未采集，因此不展示。</li>
        </ul>
      </section>
    </div>
  )
}
