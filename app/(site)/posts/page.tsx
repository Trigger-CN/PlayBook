import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Icon } from '@/components/ui/icon'
import { ToyButton } from '@/components/ui/toy-button'
import { getDataPorts } from '@/lib/data'

type SearchParams = Promise<{ q?: string; tag?: string; category?: string; sort?: string; page?: string }>

export const metadata = {
  title: '文章',
  description: '浏览全部写作，按标签、分类与关键词筛选。',
}

export default async function PostsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const page = params.page ? Number(params.page) : 1

  // 必须经端口层：有 DATABASE_URL 时文章在数据库里，直接读文件会漏掉仅存在于库的文章。
  const ports = getDataPorts()

  const result = await ports.posts.list({
    q: params.q,
    tag: params.tag,
    category: params.category,
    sort:
      params.sort === 'updated' || params.sort === 'featured' ? params.sort : 'published',
    page: Number.isFinite(page) ? page : 1,
  })

  const [tags, categories] = await Promise.all([ports.posts.listTags(), ports.posts.listCategories()])

  // 无效页码统一走 404，避免产生重复可索引页面（设计 02 §3.4）
  if (params.page && result.items.length === 0 && result.total > 0) notFound()

  const hasFilter = Boolean(params.q || params.tag || params.category)

  return (
    <>
      <h1 className="mt-2 font-display text-[clamp(34px,5vw,46px)]">文章</h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[var(--muted)]">
        浏览全部写作，或通过标签、分类与关键词找到感兴趣的内容。筛选条件写入 URL，可分享、可恢复。
      </p>
      <p aria-live="polite" className="mt-3 text-[13px] font-bold text-[var(--muted)]">
        共 {result.total} 篇文章 · 第 {result.page} / {result.totalPages} 页
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/posts"
          className="toy-button toy-button--small toy-button--cream"
          aria-current={!hasFilter ? 'page' : undefined}
        >
          <span className="toy-button__top">全部</span>
        </Link>
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/posts?category=${encodeURIComponent(category.slug)}`}
            className="toy-button toy-button--small toy-button--cream"
            aria-current={params.category === category.slug ? 'page' : undefined}
          >
            <span className="toy-button__top">
              {category.name} · {category.count}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:items-start">
        <div className="grid gap-4">
          {result.items.length === 0 ? (
            <div
              className="rounded-2xl border-2 border-dashed p-8 text-center"
              style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
            >
              <p className="mb-4 text-sm font-bold">
                {result.total === 0 ? '内容准备中' : '没有匹配的文章'}
              </p>
              <p className="mb-4 text-sm text-[var(--muted)]">
                {result.total === 0
                  ? '站点还没有发布文章，可以先看看关于页。'
                  : '当前筛选条件下没有找到内容，试试清除筛选。'}
              </p>
              {hasFilter ? (
                <ToyButton href="/posts" size="small" variant="mint">
                  清除全部筛选
                </ToyButton>
              ) : null}
            </div>
          ) : (
            result.items.map((post) => (
              /*
               * 整卡可点（决策 D-19）。卡内还有标签 chip 链接，所以不能把整张卡
               * 改成 <a>（<a> 嵌套 <a> 是非法 HTML）。改用 stretched link：
               * 标题链接用 ::after 铺满卡片，成为卡片的唯一主链接。
               */
              <article key={post.slug} className="toy-card toy-card--pressable p-4">
                <div className="grid gap-4 sm:grid-cols-[130px_1fr]">
                  <div
                    aria-hidden="true"
                    className="grid min-h-[96px] place-items-center rounded-[13px]"
                    style={{ background: 'var(--cream)' }}
                  >
                    <Icon name="auto_awesome" size={36} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--muted)]">
                      {post.publishedAt} · {post.readingTime} min read
                      {post.category ? ` · ${post.category}` : ''}
                    </div>
                    <h2 className="my-1.5 font-display text-xl leading-snug">
                      <Link href={`/posts/${post.slug}`} className="toy-card__link">
                        {post.title}
                      </Link>
                    </h2>
                    <p className="text-sm leading-relaxed text-[var(--muted)]">{post.summary}</p>
                    {post.tags.length > 0 ? (
                      <div className="toy-card__aside mt-3 flex flex-wrap gap-2">
                        {post.tags.map((tag) => (
                          <Link
                            key={tag}
                            href={`/posts?tag=${encodeURIComponent(tag)}`}
                            className="tag-chip"
                          >
                            {tag}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}

          {result.totalPages > 1 ? (
            <nav className="mt-4 flex items-center justify-center gap-4" aria-label="分页">
              {result.page > 1 ? (
                <ToyButton
                  href={`/posts?page=${result.page - 1}`}
                  size="small"
                  variant="cream"
                >
                  <Icon name="arrow_back" size={14} /> 上一页
                </ToyButton>
              ) : null}
              <span className="text-[13px] font-bold text-[var(--muted)]">
                {result.page} / {result.totalPages}
              </span>
              {result.page < result.totalPages ? (
                <ToyButton
                  href={`/posts?page=${result.page + 1}`}
                  size="small"
                  variant="cream"
                >
                  下一页 <Icon name="arrow_forward" size={14} />
                </ToyButton>
              ) : null}
            </nav>
          ) : null}
        </div>

        <aside className="grid gap-4" aria-label="辅助信息">
          <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
            <h2 className="mb-3 text-[15px] font-extrabold">热门标签</h2>
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 ? (
                <span className="text-xs text-[var(--muted)]">暂无标签</span>
              ) : (
                tags.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={`/posts?tag=${encodeURIComponent(tag.slug)}`}
                    className="tag-chip"
                    data-selected={params.tag === tag.slug ? 'true' : 'false'}
                  >
                    {tag.name} · {tag.count}
                  </Link>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
