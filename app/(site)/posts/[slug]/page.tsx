import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { CommentSection } from '@/components/interactions/comment-section'
import { LikeButton } from '@/components/interactions/like-button'
import { ViewTracker } from '@/components/interactions/view-tracker'
import { MermaidRoot } from '@/components/content/mermaid-root'
import { Icon } from '@/components/ui/icon'
import { ToyButton } from '@/components/ui/toy-button'
import { getDataPorts } from '@/lib/data'
import { renderMarkdownToHtml } from '@/lib/content/markdown'
import { extractToc } from '@/lib/content/toc'
import { loadInteractionSnapshot } from '@/lib/interactions/snapshot'

type Params = Promise<{ slug: string }>

/**
 * 文章详情页（设计 03）。
 *
 * 数据来源：经 getDataPorts() 取，正文已迁入 posts.body（source = 'db'）。
 * 正文在服务端编译，代码高亮在构建期完成，客户端不引入高亮运行时。
 *
 * 渲染策略：本页仍是 SSG（generateStaticParams + 无 cookie 读取）。
 * 互动区首屏由服务端预取计数，访客维度的 liked 状态由客户端补一次 GET，
 * 这样避免为了一个布尔值把整页退化成 Dynamic。
 */
export async function generateStaticParams() {
  const { items } = await getDataPorts().posts.list({ pageSize: 50 })
  return items.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const post = await getDataPorts().posts.getBySlug(slug)
  if (!post) return { title: '文章不存在' }

  const { frontmatter } = post
  return {
    title: frontmatter.title,
    description: frontmatter.summary,
    alternates: { canonical: `/posts/${frontmatter.slug}` },
    openGraph: {
      type: 'article',
      title: frontmatter.title,
      description: frontmatter.summary,
      publishedTime: frontmatter.publishedAt,
      modifiedTime: frontmatter.updatedAt,
      tags: frontmatter.tags,
    },
  }
}

export default async function PostDetailPage({ params }: { params: Params }) {
  const { slug } = await params
  const ports = getDataPorts()
  const post = await ports.posts.getBySlug(slug)

  // 不存在、草稿、未来文章统一 404，避免泄漏状态（设计 03 §4）
  if (!post) notFound()

  const { frontmatter, body, readingTime } = post
  const [content, toc, related, interactions] = await Promise.all([
    renderMarkdownToHtml(body),
    Promise.resolve(extractToc(body)),
    ports.posts.list({ tag: frontmatter.tags[0], pageSize: 3 }),
    loadInteractionSnapshot('post', frontmatter.slug),
  ])

  const relatedPosts = related.items.filter((item) => item.slug !== frontmatter.slug).slice(0, 2)
  const showUpdated =
    frontmatter.updatedAt && frontmatter.updatedAt !== frontmatter.publishedAt
  // 目录为空时不给右列留位，否则文章会白空 220px（见下方阅读区注释）。
  const hasToc = toc.length > 0

  return (
    <article>
      <ViewTracker path={`/posts/${frontmatter.slug}`} targetType="post" targetId={frontmatter.slug} enabled={interactions.enabled} />

      <nav aria-label="面包屑" className="pt-1.5 text-[13px] font-bold text-[var(--muted)]">
        <Link href="/">首页</Link> / <Link href="/posts">文章</Link> /{' '}
        <span className="text-[var(--ink)]">{frontmatter.title}</span>
      </nav>

      {/* 标题块原来写的是 max-w-[760px]：正文拉满后再限制它，标题与正文的右缘就会错开。 */}
      <header className="pt-5">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] font-bold text-[var(--muted)]">
          {frontmatter.category ? (
            <Link
              href={`/posts?category=${encodeURIComponent(frontmatter.category)}`}
              className="tag-chip"
              style={{ background: 'color-mix(in srgb, var(--coral) 25%, var(--surface))' }}
            >
              {frontmatter.category}
            </Link>
          ) : null}
          <span>{frontmatter.publishedAt} 发布</span>
          {showUpdated ? <span>· 更新于 {frontmatter.updatedAt}</span> : null}
          <span>· 约 {readingTime} 分钟</span>
        </div>
        <h1 className="my-3 font-display text-[clamp(32px,5vw,50px)] leading-[1.08]">
          {frontmatter.title}
        </h1>
        <p className="max-w-[640px] text-base leading-relaxed text-[var(--muted)]">
          {frontmatter.summary}
        </p>
      </header>

      {/*
       * 阅读区（D-36）：左右边界与页头页脚对齐。
       *
       * 旧值是 `minmax(0,720px) 220px` + `justify-center`：720+28+220=968px 被居中
       * 放进 1180px 的 .page-shell 里，于是正文左边缘比页头右移 106px、右边缘左移
       * 354px（1440 视口实测值）；正文与它自己的标题块（左缘 130px）也不在一条线上。
       *
       * 现在正文列吃满剩余宽度（minmax(0,1fr)）：正文左缘 = 标题左缘 = 页头左缘，
       * 目录右缘 = 页头右缘，中间不再有 `justify-*` 留下的死空。
       *
       * minmax(0,…) 而不是 1fr：正文里有 pre / table / 长 URL，不加 0 下限时
       * 网格轨道会被内容顶宽，导致页面级横向溢出。
       *
       * 目录列是**有条件的**：toc 为空时文章不能白白空出 220px 的右列
       * （实测 /posts/pan 就因此仍然左窄右空，正文 932px 但右缘差 248px）。
       *
       * 为何不给单列加 `max-w` 限制：设计文档 03-post-detail 的 680~760px
       * 是「正文推荐宽度」，而用户明确要求宽度与页头页脚一致。两者冲突时，
       * 以用户当轮指令为准；可读性靠 1.85 行高与大字号保证（见 MermaidRoot 的
       * `leading-[1.85]`）。
       */}
      <div
        className={`mt-8 grid gap-7 lg:items-start ${
          hasToc ? 'lg:grid-cols-[minmax(0,1fr)_220px]' : 'lg:grid-cols-1'
        }`}
      >
        <div className="min-w-0">
          {frontmatter.cover ? (
            <figure className="mb-7">
              {/* 封面使用普通 img 以避免为远程域名额外配置优化白名单 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frontmatter.cover}
                alt={frontmatter.coverAlt ?? ''}
                className="w-full rounded-[26px]"
              />
              {frontmatter.coverAlt ? (
                <figcaption className="mt-2 text-center text-xs font-bold text-[var(--muted)]">
                  {frontmatter.coverAlt}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <MermaidRoot
            html={content}
            className="prose-playbook text-base leading-[1.85]"
          />

          {/* 互动区：点赞 + 浏览量说明 */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <LikeButton
              targetType="post"
              targetId={frontmatter.slug}
              initial={interactions.likes ?? undefined}
              enabled={interactions.enabled}
            />
            <span className="text-xs font-bold text-[var(--muted)]">
              阅读约 {readingTime} 分钟
            </span>
          </div>

          <div
            className="mt-9 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4"
            style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
          >
            <div className="flex flex-wrap gap-2">
              {frontmatter.tags.map((tag) => (
                <Link key={tag} href={`/posts?tag=${encodeURIComponent(tag)}`} className="tag-chip">
                  {tag}
                </Link>
              ))}
            </div>
            {showUpdated ? (
              <span className="text-xs font-bold text-[var(--muted)]">
                最后更新于 {frontmatter.updatedAt}
              </span>
            ) : null}
          </div>

          {relatedPosts.length > 0 ? (
            <section className="mt-10" aria-labelledby="related-title">
              <h2 id="related-title" className="font-display text-2xl">
                相关文章
              </h2>
              <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                {relatedPosts.map((item) => (
                  <Link key={item.slug} href={`/posts/${item.slug}`} className="toy-card p-4">
                    <b className="text-[15px] leading-snug">{item.title}</b>
                    <small className="mt-1.5 block text-xs font-bold text-[var(--muted)]">
                      {item.publishedAt} · {item.readingTime} min
                    </small>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <CommentSection
            targetType="post"
            targetId={frontmatter.slug}
            initialComments={interactions.comments}
            initialTotal={interactions.commentTotal}
            enabled={interactions.enabled}
          />

          <div className="mt-9">
            <ToyButton href="/posts" size="small" variant="cream">
              <Icon name="arrow_back" size={14} /> 返回文章列表
            </ToyButton>
          </div>
        </div>

        {toc.length > 0 ? (
          <nav
            aria-label="本文目录"
            className="hidden rounded-2xl border p-5 lg:sticky lg:top-6 lg:block"
            style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          >
            <h2 className="mb-3 text-[13px] font-extrabold tracking-wide">目录</h2>
            <ol className="text-[13px] leading-8 text-[var(--muted)]">
              {toc.map((entry) => (
                <li key={entry.id} style={{ paddingLeft: entry.depth === 3 ? 12 : 0 }}>
                  <a href={`#${entry.id}`} className="hover:text-[var(--ink)]">
                    {entry.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </div>
    </article>
  )
}
