import Link from 'next/link'

import { ToyButton } from '@/components/ui/toy-button'
import { getEnabledQuickLinks, siteConfig } from '@/config/site'
import { filePostRepository } from '@/lib/content/repository'

export default async function HomePage() {
  const { items } = await filePostRepository.list({ pageSize: 3 })
  const quickLinks = getEnabledQuickLinks()

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
          <h1 className="mt-5 font-display text-[clamp(40px,6vw,68px)] leading-[1.02]">
            把每一次更新，做成可以按下的故事。
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
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="toy-button toy-button--cream min-h-[112px] text-left"
              >
                <span className="toy-button__top flex h-[112px] flex-col items-start justify-between">
                  <b className="text-xl leading-none">{link.icon}</b>
                  <span>
                    <b className="block text-base">{link.title}</b>
                    {link.description ? (
                      <small className="block text-xs font-semibold opacity-70">
                        {link.description}
                      </small>
                    ) : null}
                  </span>
                </span>
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="toy-button toy-button--cream min-h-[112px] text-left"
              >
                <span className="toy-button__top flex h-[112px] flex-col items-start justify-between">
                  <b className="text-xl leading-none">{link.icon}</b>
                  <span>
                    <b className="block text-base">{link.title}</b>
                    {link.description ? (
                      <small className="block text-xs font-semibold opacity-70">
                        {link.description}
                      </small>
                    ) : null}
                  </span>
                </span>
              </Link>
            ),
          )}
        </div>
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
            {items.map((post) => (
              <Link key={post.slug} href={`/posts/${post.slug}`} className="toy-card p-4">
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
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
