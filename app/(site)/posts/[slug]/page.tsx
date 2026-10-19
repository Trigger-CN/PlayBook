import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { ToyButton } from '@/components/ui/toy-button'
import { renderMdx } from '@/lib/content/mdx'
import { filePostRepository, getPostBySlug, listPosts } from '@/lib/content/repository'
import { extractToc } from '@/lib/content/toc'

type Params = Promise<{ slug: string }>

export async function generateStaticParams() {
  const { items } = await listPosts({ pageSize: 50 })
  return items.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
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

/**
 * 文章详情页（设计 03）。
 * 正文在服务端编译，代码高亮在构建期完成，客户端不引入高亮运行时。
 */
export default async function PostDetailPage({ params }: { params: Params }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)

  // 不存在、草稿、未来文章统一 404，避免泄漏状态（设计 03 §4）
  if (!post) notFound()

  const { frontmatter, body, readingTime } = post
  const [{ content }, toc, related] = await Promise.all([
    renderMdx(body),
    Promise.resolve(extractToc(body)),
    filePostRepository.list({ tag: frontmatter.tags[0], pageSize: 3 }),
  ])

  const relatedPosts = related.items.filter((item) => item.slug !== frontmatter.slug).slice(0, 2)
  const showUpdated =
    frontmatter.updatedAt && frontmatter.updatedAt !== frontmatter.publishedAt

  return (
    <article>
      <nav aria-label="面包屑" className="pt-1.5 text-[13px] font-bold text-[var(--muted)]">
        <Link href="/">首页</Link> / <Link href="/posts">文章</Link> /{' '}
        <span className="text-[var(--ink)]">{frontmatter.title}</span>
      </nav>

      <header className="max-w-[760px] pt-5">
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

      <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,720px)_220px] lg:items-start lg:justify-center">
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

          <div className="prose-playbook text-base leading-[1.85]">{content}</div>

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

          <div className="mt-9">
            <ToyButton href="/posts" size="small" variant="cream">
              ← 返回文章列表
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
