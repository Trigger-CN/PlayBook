import type { Metadata } from 'next'
import Link from 'next/link'

import { listPostsForAdmin } from '@/lib/admin/repository'
import { hasDatabaseUrl } from '@/lib/data'

import { changePostStatusAction } from './actions'

/**
 * 后台文章列表（设计 10-admin-posts）。
 *
 * 本页从「只读索引」升级为可操作列表：新增「写新文章」入口、每行的
 * 编辑链接，以及发布/归档/转草稿的快捷动作。正文编辑在
 * `/admin/posts/new` 与 `/admin/posts/[slug]/edit`（设计 15-post-editor）。
 *
 * 状态动作是 `<form>` + Server Action，不是 GET 链接 —— 避免邮件/聊天
 * 工具预取链接导致误发布（与评论审核同口径）。
 */
export const metadata: Metadata = {
  title: '文章',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
}

const POST_STATUSES = ['draft', 'published', 'archived'] as const

function normalizeStatus(raw: string | undefined): string | undefined {
  return raw && (POST_STATUSES as readonly string[]).includes(raw) ? raw : undefined
}

function errorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'conflict':
      return '文章状态已被其他操作改变，请刷新后重试。'
    case 'not_found':
      return '文章不存在。'
    case 'invalid':
      return '请求参数不合法。'
    default:
      return null
  }
}

type Props = {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>
}

export default async function AdminPostsPage({ searchParams }: Props) {
  const { status: statusParam, ok, error } = await searchParams
  const status = normalizeStatus(statusParam)
  const dbEnabled = hasDatabaseUrl()

  if (!dbEnabled) {
    return (
      <div>
        <header className="mb-6">
          <h1 className="font-display text-2xl">文章</h1>
        </header>
        <div
          className="rounded-2xl border-2 border-dashed p-8 text-center"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          <p className="text-sm font-bold">需要数据库</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            在线书写与文章列表都读写 posts 表。配置 DATABASE_URL 并执行 db:migrate 后可用。
          </p>
        </div>
      </div>
    )
  }

  const posts = await listPostsForAdmin({ status: status ?? null })
  const bySource = {
    admin: posts.filter((post) => post.source === 'admin').length,
    db: posts.filter((post) => post.source === 'db').length,
    file: posts.filter((post) => post.source === 'file').length,
  }
  const currentListPath = status ? `/admin/posts?status=${status}` : '/admin/posts'
  const err = errorMessage(error)

  const returnToFor = (target: string) =>
    `${currentListPath}${currentListPath.includes('?') ? '&' : '?'}ok=${target}`

  return (
    <div>
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl">文章</h1>
          <Link
            href="/admin/posts/new"
            className="rounded-xl border px-3 py-2 text-sm font-extrabold"
            style={{ borderColor: 'var(--line)', background: 'var(--ink)', color: 'var(--canvas)' }}
          >
            + 写新文章
          </Link>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          共 {posts.length} 篇 · 后台编辑 {bySource.admin} 篇 · MDX 导入 {bySource.db} 篇
          {bySource.file > 0 ? ` · 文件 ${bySource.file} 篇` : ''}。
        </p>
      </header>

      {err ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
        >
          {err}
        </p>
      ) : null}
      {ok ? (
        <p
          role="status"
          className="mb-4 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: 'var(--mint)' }}
        >
          操作成功：{STATUS_LABELS[ok] ?? ok}
        </p>
      ) : null}

      {/* 状态筛选写进 query：仪表盘的「N 篇文章仍是草稿」待办条会直接链到
          ?status=draft，这里必须能接住它并保持可恢复。 */}
      <nav aria-label="按状态筛选" className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/admin/posts"
          aria-current={status ? undefined : 'page'}
          className="rounded-full px-3 py-1.5 text-xs font-extrabold"
          style={{
            background: status ? 'var(--surface)' : 'var(--ink)',
            color: status ? 'var(--muted)' : 'var(--canvas)',
            border: '1px solid var(--line)',
          }}
        >
          全部
        </Link>
        {POST_STATUSES.map((value) => {
          const active = value === status
          return (
            <Link
              key={value}
              href={`/admin/posts?status=${value}`}
              aria-current={active ? 'page' : undefined}
              className="rounded-full px-3 py-1.5 text-xs font-extrabold"
              style={{
                background: active ? 'var(--ink)' : 'var(--surface)',
                color: active ? 'var(--canvas)' : 'var(--muted)',
                border: '1px solid var(--line)',
              }}
            >
              {STATUS_LABELS[value] ?? value}
            </Link>
          )
        })}
      </nav>

      {posts.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed p-8 text-center"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          <p className="text-sm font-bold">
            {status ? `没有${STATUS_LABELS[status] ?? status}的文章` : '还没有文章'}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {status ? (
              '换个状态筛选看看，或清除筛选查看全部。'
            ) : (
              <Link href="/admin/posts/new" className="font-bold underline">
                写第一篇
              </Link>
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <caption className="sr-only">
              文章列表：标题、状态、正文来源、日期、公开链接与操作
            </caption>
            <thead>
              <tr className="text-left text-[12px] font-extrabold text-[var(--muted)]">
                <th scope="col" className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                  标题
                </th>
                <th scope="col" className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                  状态
                </th>
                <th scope="col" className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                  正文来源
                </th>
                <th scope="col" className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                  发布
                </th>
                <th scope="col" className="border-b py-2" style={{ borderColor: 'var(--line)' }}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.slug} className="align-top">
                  <th
                    scope="row"
                    className="border-b py-2.5 pr-3 text-left font-bold"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {post.title}
                    <span className="ml-2 text-[11px] font-normal text-[var(--muted)]">
                      {post.slug}
                    </span>
                    {post.featured ? (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'var(--cream)' }}
                      >
                        精选
                      </span>
                    ) : null}
                  </th>
                  <td
                    className="border-b py-2.5 pr-3 text-[12px] font-bold"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {STATUS_LABELS[post.status] ?? post.status}
                  </td>
                  <td
                    className="border-b py-2.5 pr-3 text-[12px]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {post.source === 'admin' ? '后台编辑' : post.source === 'db' ? 'MDX 导入' : '文件'}
                  </td>
                  <td
                    className="border-b py-2.5 pr-3 text-[12px] text-[var(--muted)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {post.publishedAt ?? '—'}
                  </td>
                  <td className="border-b py-2.5 text-[12px]" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/posts/${encodeURIComponent(post.slug)}/edit`}
                        className="font-bold underline"
                      >
                        编辑
                      </Link>

                      {post.status === 'published' ? (
                        <Link href={`/posts/${post.slug}`} className="font-bold underline">
                          查看
                        </Link>
                      ) : (
                        // 未发布文章没有公开路由，不能给出一个会 404 的链接。
                        <span className="text-[var(--muted)]">未发布</span>
                      )}

                      {post.status !== 'published' ? (
                        <StatusAction
                          slug={post.slug}
                          version={post.version}
                          status="published"
                          label="发布"
                          returnTo={returnToFor('published')}
                        />
                      ) : null}
                      {post.status !== 'draft' ? (
                        <StatusAction
                          slug={post.slug}
                          version={post.version}
                          status="draft"
                          label="转草稿"
                          returnTo={returnToFor('draft')}
                        />
                      ) : null}
                      {post.status !== 'archived' ? (
                        <StatusAction
                          slug={post.slug}
                          version={post.version}
                          status="archived"
                          label="归档"
                          returnTo={returnToFor('archived')}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-8 max-w-[760px]" aria-labelledby="posts-workflow-title">
        <h2 id="posts-workflow-title" className="mb-2 font-display text-xl">
          两种写作方式
        </h2>
        <ol className="grid gap-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
          <li>
            1. <b>在线书写</b>（推荐）：点「写新文章」，保存后正文来源标记为「后台编辑」。
            <code>npm run db:import</code> 会跳过它，不会用文件覆盖。
          </li>
          <li>
            2. <b>MDX 文件</b>：在 content/posts/ 下新建或修改 .mdx，然后
            <code>npm run db:import</code> 同步进库，来源标记为「MDX 导入」。
          </li>
          <li>
            3. 一篇正文只有一个权威来源，由最后写入方决定；两种方式不会互相覆盖。
          </li>
          <li>4. 发布后首页、列表、详情、sitemap 与 RSS 随缓存 tag 失效。</li>
        </ol>
      </section>
    </div>
  )
}

function StatusAction({
  slug,
  version,
  status,
  label,
  returnTo,
}: {
  slug: string
  version: number
  status: string
  label: string
  returnTo: string
}) {
  return (
    <form action={changePostStatusAction} className="inline">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className="rounded-lg border px-2 py-1 text-[11px] font-extrabold"
        style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
      >
        {label}
      </button>
    </form>
  )
}
