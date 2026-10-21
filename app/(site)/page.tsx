import Link from 'next/link'
import type { CSSProperties } from 'react'

import { ActivityFeed } from '@/components/site/activity-feed'
import { QuickLinkBar } from '@/components/site/quick-link-bar'
import { TimelineCard } from '@/components/timeline/timeline-card'
import { StatBlock } from '@/components/ui/stat-block'
import { ToyButton } from '@/components/ui/toy-button'
import { ToyCard } from '@/components/ui/toy-card'
import { siteConfig } from '@/config/site'
import { timelineTypeStyles } from '@/config/timeline'
import { getDataPorts, hasDatabaseUrl } from '@/lib/data'

const recentCardBases = ['coral', 'mint', 'sky'] as const

/** 首页展示最近 5 条时间轴节点（路线图 Phase 3）。 */
const HOME_TIMELINE_LIMIT = 5

function formatMonthDay(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return '—'
  return `${month}.${day}`
}

export default async function HomePage() {
  const ports = getDataPorts()
  const [{ items, total: postTotal }, timelineItems, totals] = await Promise.all([
    ports.posts.list({ pageSize: 3 }),
    ports.timeline.listPublic(),
    ports.stats.getSiteTotals(),
  ])
  const recentTimeline = timelineItems.slice(0, HOME_TIMELINE_LIMIT)
  const dbEnabled = hasDatabaseUrl()

  const yearsCovered = new Set(timelineItems.map((item) => item.occurredAt.slice(0, 4))).size
  const latestCandidates = [
    ...items.map((post) => post.updatedAt ?? post.publishedAt),
    ...recentTimeline.slice(0, 1).map((item) => item.occurredAt),
  ]
    .filter((value) => value.length > 0)
    .sort()
  const latestDate =
    latestCandidates.length > 0 ? latestCandidates[latestCandidates.length - 1] : ''

  return (
    <>
      <section className="grid gap-12 pb-14 pt-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-[7px] text-xs font-extrabold"
            style={{ background: 'var(--cream)', color: '#4a2d11' }}
          >
            PERSONAL WEB / PLAYBOOK
          </span>
          <h1 className="mt-5 font-display text-[clamp(30px,5.4vw,54px)] leading-[1.08]">
            把每一次更新，
            <br />
            做成可以按下的故事。
          </h1>
          <p className="mt-4 max-w-[570px] text-[17px] leading-relaxed text-[var(--muted)]">
            {siteConfig.bio}
          </p>
          <div className="mt-7 flex flex-wrap gap-4">
            <ToyButton href="/posts">开始阅读 →</ToyButton>
            <ToyButton href="/about" variant="pink">
              关于我 ✦
            </ToyButton>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative grid min-h-[290px] place-items-center overflow-hidden rounded-[34px] lg:min-h-[360px]"
          style={{ background: 'var(--shell)' }}
        >
          <div
            className="relative z-10 w-[min(310px,78%)] rotate-[4deg] rounded-[30px] p-6"
            style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
          >
            <div className="mb-5 flex items-center justify-between text-xs font-extrabold">
              <span>NOW PLAYING</span>
              <span className="flex gap-[7px]">
                <i className="block h-[9px] w-[9px] rounded-full bg-[var(--coral)]" />
                <i className="block h-[9px] w-[9px] rounded-full bg-[var(--cream)]" />
                <i className="block h-[9px] w-[9px] rounded-full bg-[var(--mint)]" />
              </span>
            </div>
            <div
              className="grid min-h-[118px] place-items-center rounded-[19px] text-[44px] font-black"
              style={{ background: 'var(--cream)', color: '#352111' }}
            >
              2026
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <h2 id="quick-title" className="font-display text-3xl">
            快捷入口
          </h2>
          <p className="max-w-[560px] text-sm text-[var(--muted)]">
            站内或站外链接以统一的立体按键阵列出现，按配置排序、可增删。
          </p>
        </div>
        <QuickLinkBar />
      </section>

      <section className="mt-12" aria-labelledby="recent-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <h2 id="recent-title" className="font-display text-3xl">
            最近文章
          </h2>
          <Link href="/posts" className="text-sm font-bold text-[var(--muted)] hover:text-[var(--ink)]">
            查看全部 →
          </Link>
        </div>

        {items.length === 0 ? (
          <p
            className="rounded-2xl border-2 border-dashed p-8 text-center text-sm text-[var(--muted)]"
            style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
          >
            内容准备中，很快就来。
          </p>
        ) : (
          <div className="grid gap-4">
            {items.map((post, index) => (
              <ToyCard
                key={post.slug}
                href={`/posts/${post.slug}`}
                base={recentCardBases[index % recentCardBases.length]}
                className="p-4"
              >
                <div className="grid gap-4 sm:grid-cols-[145px_1fr]">
                  <div
                    aria-hidden="true"
                    className="grid min-h-[100px] place-items-center rounded-[13px] text-5xl"
                    style={{ background: 'var(--cream)' }}
                  >
                    ✹
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--muted)]">
                      {post.publishedAt} · {post.readingTime} min read
                      {post.category ? ` · ${post.category}` : ''}
                    </div>
                    <h3 className="my-1.5 font-display text-xl leading-snug">{post.title}</h3>
                    <p className="text-sm leading-relaxed text-[var(--muted)]">{post.summary}</p>
                    {post.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {post.tags.map((tag) => (
                          <span key={tag} className="tag-chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </ToyCard>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12" aria-labelledby="home-timeline-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <h2 id="home-timeline-title" className="font-display text-3xl">
            最近时间轴
          </h2>
          <Link
            href="/timeline"
            className="text-sm font-bold text-[var(--muted)] hover:text-[var(--ink)]"
          >
            查看全部 →
          </Link>
        </div>

        {recentTimeline.length === 0 ? (
          <p
            className="rounded-2xl border-2 border-dashed p-8 text-center text-sm text-[var(--muted)]"
            style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
          >
            还没有记录，第一条正在路上。
          </p>
        ) : (
          <ol className="timeline-rail grid gap-4">
            {recentTimeline.map((item) => {
              const typeStyle = timelineTypeStyles[item.type]
              const nodeStyle = {
                '--node-tone': `var(--${typeStyle.tone})`,
                '--node-base': `var(--${typeStyle.tone}-base)`,
              } as CSSProperties

              return (
                <li key={item.id} className="timeline-node" style={nodeStyle}>
                  <TimelineCard item={item} />
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="mt-12" aria-labelledby="overview-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <h2 id="overview-title" className="font-display text-3xl">
            站点概览
          </h2>
          <p className="max-w-[560px] text-sm text-[var(--muted)]">
            {dbEnabled
              ? '浏览、点赞、评论为当前累计有效值；文章与时间轴为已发布数。'
              : '文章与时间轴数字来自内容源；浏览、点赞、评论需要数据库，当前显示 0。'}
          </p>
        </div>
        <div className="stats">
          <StatBlock value={String(postTotal)} label="已发布文章" tone="mint" />
          <StatBlock value={String(timelineItems.length)} label="时间轴记录" tone="coral" />
          <StatBlock value={`${yearsCovered} 年`} label="记录跨度" tone="cream" />
          <StatBlock value={formatMonthDay(latestDate)} label="最近更新" tone="sky" />
        </div>
        <div className="stats mt-4">
          <StatBlock value={String(totals.views)} label="累计浏览" tone="sky" />
          <StatBlock value={String(totals.likes)} label="累计点赞" tone="coral" />
          <StatBlock value={String(totals.comments)} label="已通过评论" tone="mint" />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="activity-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <h2 id="activity-title" className="font-display text-3xl">
            最近活跃
          </h2>
          <p className="max-w-[560px] text-sm text-[var(--muted)]">
            来自真实事件记录，不含待审核内容与访客标识。
          </p>
        </div>
        <ActivityFeed limit={8} />
      </section>
    </>
  )
}
