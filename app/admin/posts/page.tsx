import type { Metadata } from 'next'
import Link from 'next/link'

import { listPostsForAdmin } from '@/lib/admin/repository'
import { hasDatabaseUrl } from '@/lib/data'

/**
 * 后台文章索引（设计 10-admin-posts）。
 *
 * 本页是**只读索引**，不是编辑器。设计 10 §1 明确：「MVP 文章为 MDX 文件时
 * 先提供只读索引和构建信息」；在线书写见 15-post-editor.md，尚未实现。
 *
 * 因此这里刻意不提供「编辑」按钮 —— 一个点了会说「暂不支持」的按钮
 * 比没有按钮更差。取而代之的是把 `source` 明确标出来，并给出该来源下
 * 正确的修改路径。
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

export default async function AdminPostsPage() {
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
            文章索引读取 posts 表。配置 DATABASE_URL 并执行 db:migrate 与 db:import 后可用。
          </p>
        </div>
      </div>
    )
  }

  const posts = await listPostsForAdmin()
  const bySource = {
    db: posts.filter((post) => post.source === 'db').length,
    file: posts.filter((post) => post.source === 'file').length,
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl">文章</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          共 {posts.length} 篇 · 正文在库 {bySource.db} 篇 · 正文在文件 {bySource.file} 篇。
          本页为只读索引，在线编辑尚未实现。
        </p>
      </header>

      {posts.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed p-8 text-center"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          <p className="text-sm font-bold">还没有文章</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            在 content/posts/ 下新建 .mdx 后执行 npm run db:import 即可入库。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <caption className="sr-only">文章列表：标题、状态、正文来源、日期与公开链接</caption>
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
                  分类
                </th>
                <th scope="col" className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                  发布
                </th>
                <th scope="col" className="border-b py-2 pr-3" style={{ borderColor: 'var(--line)' }}>
                  更新
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
                    {post.source === 'db' ? '库内正文' : 'MDX 文件'}
                  </td>
                  <td
                    className="border-b py-2.5 pr-3 text-[12px] text-[var(--muted)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {post.category ?? '—'}
                  </td>
                  <td
                    className="border-b py-2.5 pr-3 text-[12px] text-[var(--muted)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {post.publishedAt ?? '—'}
                  </td>
                  <td
                    className="border-b py-2.5 pr-3 text-[12px] text-[var(--muted)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {post.updatedAt ?? '—'}
                  </td>
                  <td
                    className="border-b py-2.5 text-[12px]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    {post.status === 'published' ? (
                      <Link href={`/posts/${post.slug}`} className="font-bold underline">
                        查看
                      </Link>
                    ) : (
                      // 未发布文章没有公开路由，不能给出一个会 404 的链接。
                      <span className="text-[var(--muted)]">未发布</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-8 max-w-[760px]" aria-labelledby="posts-workflow-title">
        <h2 id="posts-workflow-title" className="mb-2 font-display text-xl">
          当前写作流程
        </h2>
        <ol className="grid gap-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
          <li>1. 在 content/posts/ 下新建或修改 .mdx，frontmatter 校验在构建期执行。</li>
          <li>2. 执行 npm run db:import 把正文同步进 posts.body，source 变为 db。</li>
          <li>3. 内容未变则跳过，有变化 version + 1；编辑日期取自 frontmatter，不会被导入时刻覆盖。</li>
          <li>4. 发布后首页、列表、详情、sitemap 与 RSS 随缓存 tag 失效。</li>
        </ol>
        <p className="mt-3 text-[12px] text-[var(--muted)]">
          在线编辑器（设计 15-post-editor）尚未实现。这里不提供会失败的编辑入口。
        </p>
      </section>
    </div>
  )
}
