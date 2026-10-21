import Link from 'next/link'

import { ActivityFeed } from '@/components/site/activity-feed'
import { TrendBars } from '@/components/stats/trend-bars'
import { StatBlock } from '@/components/ui/stat-block'
import { getDataPorts, hasDatabaseUrl } from '@/lib/data'
import {
  STATS_WINDOW_DAYS,
  fillSeriesGaps,
  loadPublicStats,
  loadRankedPopular,
  sumSeries,
} from '@/lib/stats/public'

export const metadata = {
  title: '统计',
  description: '站点活跃度、内容规模与阅读趋势。指标来自每日聚合，非实时数据。',
}

/**
 * 统计页（设计 07）。
 *
 * 缓存 15 分钟：设计 07 §6 要求「Server Component + ISR，缓存 15 分钟到 1 小时」。
 * 聚合数据本身就是按天粒度的，秒级新鲜度没有意义，而每次访问都扫一遍表
 * 才是真的浪费。
 */
export const revalidate = 900

function formatUpdated(isoDate: string | null): string {
  return isoDate ?? '尚未聚合'
}

export default async function StatsPage() {
  const dbEnabled = hasDatabaseUrl()
  const stats = await loadPublicStats()
  const ranked = await loadRankedPopular()

  // 补齐窗口：以「最后一次聚合日期」为锚点，而不是今天。
  // 用今天做锚点会在聚合任务没跑时画出一段全零的尾巴，
  // 让人以为那几天真的没人访问 —— 那是假的。
  const series = stats.aggregatedAt
    ? fillSeriesGaps(stats.series, STATS_WINDOW_DAYS, stats.aggregatedAt)
    : []
  const windowTotals = sumSeries(series)

  const ports = getDataPorts()
  const [tags, categories] = await Promise.all([
    ports.posts.listTags(),
    ports.posts.listCategories(),
  ])

  return (
    <>
      <h1 className="mt-2 font-display text-[clamp(34px,5vw,46px)]">站点统计</h1>
      <p className="mt-2 max-w-[680px] text-[15px] leading-relaxed text-[var(--muted)]">
        展示站点长期活跃程度与内容规模。数字来自每日聚合表，不是实时计数，
        也不包含任何访客标识。
      </p>
      <p className="mt-2 text-[13px] font-bold text-[var(--muted)]">
        数据更新至：{formatUpdated(stats.aggregatedAt)}
        {dbEnabled ? '' : '（当前为文件模式，未接入数据库）'}
      </p>

      <section className="mt-8" aria-labelledby="totals-title">
        <h2 id="totals-title" className="mb-4 font-display text-2xl">
          累计指标
        </h2>
        <div className="stats">
          <StatBlock value={String(stats.totals.views)} label="累计浏览" tone="sky" />
          <StatBlock value={String(stats.totals.likes)} label="累计点赞" tone="coral" />
          <StatBlock value={String(stats.totals.comments)} label="已通过评论" tone="mint" />
          <StatBlock value={String(stats.totals.postsTotal)} label="已发布文章" tone="cream" />
          <StatBlock value={String(stats.totals.timelineTotal)} label="时间轴记录" tone="pink" />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">
          浏览为去重后的有效次数（同一访客 30 分钟内重复访问只计一次）；
          评论只统计已审核通过的公开评论，待审核数不对外公开。
        </p>
      </section>

      <section className="mt-10" aria-labelledby="trend-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <h2 id="trend-title" className="font-display text-2xl">
            近 {STATS_WINDOW_DAYS} 天趋势
          </h2>
          {stats.aggregated ? (
            <p className="text-[13px] font-bold text-[var(--muted)]">
              窗口内合计：浏览 {windowTotals.views} · 点赞 {windowTotals.likes} · 评论{' '}
              {windowTotals.comments}
            </p>
          ) : null}
        </div>

        {stats.aggregated ? (
          <div
            className="grid gap-8 rounded-2xl border p-5 lg:grid-cols-2"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <TrendBars series={series} label="浏览" metric="views" tone="sky" />
            <TrendBars series={series} label="点赞" metric="likes" tone="coral" />
          </div>
        ) : (
          <div
            className="rounded-2xl border-2 border-dashed p-8 text-center"
            style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
          >
            <p className="text-sm font-bold">趋势数据积累中</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {dbEnabled
                ? '每日聚合任务尚未运行。执行 npm run db:aggregate 后这里会出现趋势。'
                : '文件模式没有每日聚合表。配置 DATABASE_URL 并运行聚合任务后，这里会出现趋势。'}
            </p>
            {/* 数据不足时不画趋势线：一条全零的线会被读成「那段时间没人访问」，
                而真实原因是「根本没有聚合数据」。 */}
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="popular-title">
        <h2 id="popular-title" className="mb-4 font-display text-2xl">
          热门内容
        </h2>
        {ranked.byViews.length === 0 && ranked.byLikes.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            还没有足够的互动数据。内容被浏览或点赞后，这里会按真实计数排名。
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-[15px] font-extrabold">按浏览</h3>
              {ranked.byViews.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">暂无浏览记录。</p>
              ) : (
                <ol className="grid gap-2">
                  {ranked.byViews.map((item, index) => (
                    <li
                      key={`${item.targetType}-${item.targetId}`}
                      className="flex items-baseline gap-3 rounded-xl px-3 py-2"
                      style={{ background: 'var(--soft)' }}
                    >
                      <span className="w-5 shrink-0 text-sm font-extrabold text-[var(--muted)]">
                        {index + 1}
                      </span>
                      <Link href={item.href} className="min-w-0 flex-1 truncate text-sm font-bold">
                        {item.title}
                      </Link>
                      <span className="shrink-0 text-sm font-extrabold">{item.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-[15px] font-extrabold">按点赞</h3>
              {ranked.byLikes.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">暂无点赞记录。</p>
              ) : (
                <ol className="grid gap-2">
                  {ranked.byLikes.map((item, index) => (
                    <li
                      key={`${item.targetType}-${item.targetId}`}
                      className="flex items-baseline gap-3 rounded-xl px-3 py-2"
                      style={{ background: 'var(--soft)' }}
                    >
                      <span className="w-5 shrink-0 text-sm font-extrabold text-[var(--muted)]">
                        {index + 1}
                      </span>
                      <Link href={item.href} className="min-w-0 flex-1 truncate text-sm font-bold">
                        {item.title}
                      </Link>
                      <span className="shrink-0 text-sm font-extrabold">{item.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="distribution-title">
        <h2 id="distribution-title" className="mb-4 font-display text-2xl">
          内容分布
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 text-[15px] font-extrabold">按分类</h3>
            {categories.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">暂无分类。</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <li key={category.slug} className="tag-chip">
                    {category.name} · {category.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-3 text-[15px] font-extrabold">按标签</h3>
            {tags.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">暂无标签。</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <li key={tag.slug} className="tag-chip">
                    {tag.name} · {tag.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="activity-title">
        <h2 id="activity-title" className="mb-4 font-display text-2xl">
          最近活跃
        </h2>
        <ActivityFeed limit={10} />
      </section>

      <section className="mt-10 max-w-[720px]" aria-labelledby="privacy-title">
        <h2 id="privacy-title" className="mb-3 font-display text-2xl">
          口径与隐私
        </h2>
        <ul className="grid gap-2 text-[13px] leading-relaxed text-[var(--muted)]">
          <li>· 累计浏览、点赞、评论为库内真实行数；文章与时间轴为已发布数量，来自内容源。</li>
          <li>· 趋势序列只读每日聚合表，不扫描原始事件，也不在页面侧做二次聚合。</li>
          <li>
            · 每日聚合的 posts_count / timeline_count 是「当日新增发布数」（增量），
            不是累计总数，因此不在这页展示为总量。
          </li>
          <li>· 不展示 IP / UA 哈希、referrer 明细、单访客轨迹与待审核评论数。</li>
          <li>· 聚合任务按天运行，数据更新至上方标注的日期，不是实时。</li>
        </ul>
      </section>
    </>
  )
}
