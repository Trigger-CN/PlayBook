import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CommentSection } from '@/components/interactions/comment-section'
import { LikeButton } from '@/components/interactions/like-button'
import { ViewTracker } from '@/components/interactions/view-tracker'
import { ToyButton } from '@/components/ui/toy-button'
import { ToyCard } from '@/components/ui/toy-card'
import { timelineTypeStyles } from '@/config/timeline'
import { getDataPorts } from '@/lib/data'
import { loadInteractionSnapshot } from '@/lib/interactions/snapshot'
import { formatTimelineDate } from '@/lib/timeline/view'

type TimelineDetailProps = {
  params: Promise<{ id: string }>
}

export async function generateStaticParams() {
  const items = await getDataPorts().timeline.listPublic()
  return items.map((item) => ({ id: item.id }))
}

export async function generateMetadata({ params }: TimelineDetailProps): Promise<Metadata> {
  const { id } = await params
  const item = await getDataPorts().timeline.getPublic(id)
  if (!item) return { title: '记录未找到' }

  const typeStyle = timelineTypeStyles[item.type]
  const title = item.title ?? `${typeStyle.label} · ${item.occurredAt}`
  const description = item.content.replace(/\s+/g, ' ').slice(0, 80)

  return {
    title,
    description,
    alternates: { canonical: `/timeline/${item.id}` },
    openGraph: { title, description, type: 'article', publishedTime: item.occurredAt },
  }
}

function externalHost(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export default async function TimelineDetailPage({ params }: TimelineDetailProps) {
  const { id } = await params
  const ports = getDataPorts()
  const item = await ports.timeline.getPublic(id)
  if (!item) notFound()

  const typeStyle = timelineTypeStyles[item.type]
  const [{ newer, older }, interactions] = await Promise.all([
    ports.timeline.getAdjacent(item.id),
    loadInteractionSnapshot('timeline_item', item.id),
  ])
  const paragraphs = item.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
  const host = item.externalUrl ? externalHost(item.externalUrl) : null

  return (
    <article className="pb-6 pt-6">
      <ViewTracker
        path={`/timeline/${item.id}`}
        targetType="timeline_item"
        targetId={item.id}
        enabled={interactions.enabled}
      />

      <nav
        aria-label="面包屑"
        className="mb-6 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--muted)]"
      >
        <Link href="/" className="hover:text-[var(--ink)]">
          首页
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/timeline" className="hover:text-[var(--ink)]">
          时间轴
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-[var(--ink)]">
          {item.title ?? typeStyle.label}
        </span>
      </nav>

      <header className="max-w-[760px]">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
            style={{ background: `var(--${typeStyle.tone})`, color: '#211522' }}
          >
            <span aria-hidden="true">{typeStyle.icon}</span>
            {typeStyle.label}
          </span>
          <time dateTime={item.occurredAt} className="text-xs font-bold text-[var(--muted)]">
            {formatTimelineDate(item.occurredAt)}
          </time>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4.6vw,46px)] leading-[1.1]">
          {item.title ?? `${typeStyle.label} · ${formatTimelineDate(item.occurredAt)}`}
        </h1>
      </header>

      {item.imageUrl ? (
        <figure className="mt-7">
          <img
            src={item.imageUrl}
            alt={item.imageAlt ?? ''}
            className="w-full rounded-[18px] border border-[var(--line)]"
          />
          {item.imageAlt ? (
            <figcaption className="mt-2 text-xs text-[var(--muted)]">{item.imageAlt}</figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="mt-6 max-w-[760px] text-[16px] leading-[1.85]">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="mb-4">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-8 max-w-[760px] flex flex-wrap items-center gap-4">
        <LikeButton
          targetType="timeline_item"
          targetId={item.id}
          initial={interactions.likes ?? undefined}
          enabled={interactions.enabled}
        />
      </div>

      {item.externalUrl ? (
        <div className="mt-6">
          <ToyButton
            href={item.externalUrl}
            variant="sky"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看相关链接 ↗
          </ToyButton>
          {host ? <p className="mt-2 text-xs text-[var(--muted)]">{host}</p> : null}
        </div>
      ) : null}

      <CommentSection
        targetType="timeline_item"
        targetId={item.id}
        initialComments={interactions.comments}
        initialTotal={interactions.commentTotal}
        enabled={interactions.enabled}
      />

      <nav aria-label="相邻记录" className="mt-12 flex flex-wrap gap-4">
        {newer ? (
          <ToyCard
            href={`/timeline/${newer.id}`}
            base="cream"
            className="min-w-[240px] flex-1 p-4"
          >
            <span className="text-xs font-bold text-[var(--muted)]">↑ 更新的一条</span>
            <p className="mt-1 font-display text-base leading-snug">
              {newer.title ?? timelineTypeStyles[newer.type].label}
            </p>
          </ToyCard>
        ) : null}
        {older ? (
          <ToyCard
            href={`/timeline/${older.id}`}
            base="cream"
            className="min-w-[240px] flex-1 p-4"
          >
            <span className="text-xs font-bold text-[var(--muted)]">↓ 更早的一条</span>
            <p className="mt-1 font-display text-base leading-snug">
              {older.title ?? timelineTypeStyles[older.type].label}
            </p>
          </ToyCard>
        ) : null}
      </nav>

      <div className="mt-10">
        <ToyButton href="/timeline" variant="cream">
          ← 回到时间轴
        </ToyButton>
      </div>
    </article>
  )
}
