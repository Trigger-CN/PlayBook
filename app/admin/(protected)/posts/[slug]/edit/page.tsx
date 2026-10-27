import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { getPostForEdit } from '@/lib/admin/repository'
import { isAdminConfigured, requireAdmin } from '@/lib/auth/admin'

import { PostEditor } from '../../post-editor'

/**
 * 编辑已有文章（设计 15-post-editor §1 路由 `/admin/posts/[id]/edit`）。
 *
 * 用 slug 而不是 uuid：slug 是公开路由上可寻址的标识（D-06），
 * 编辑页的 URL 与公开页一一对应，排查时不用在两种 id 之间换算。
 */
export const metadata: Metadata = {
  title: '编辑文章',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}

export default async function EditPostPage({ params, searchParams }: Props) {
  if (!isAdminConfigured()) redirect('/admin/login')
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/posts')

  const { slug } = await params
  const { ok, error } = await searchParams

  const post = await getPostForEdit(slug)
  if (!post) notFound()

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl">编辑文章</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          <span className="font-bold">{post.slug}</span>
          {' · '}
          当前状态 {post.status === 'published' ? '已发布' : post.status === 'draft' ? '草稿' : '已归档'}
          {' · '}
          正文来源 {post.source === 'admin' ? '后台编辑' : post.source === 'db' ? '文件导入' : '文件'}
          {' · '}
          版本 {post.version}
        </p>
        {post.source === 'db' ? (
          <p
            className="mt-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed"
            style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
          >
            这篇正文目前由 Markdown 文件导入。在下面保存一次后，来源会变成「后台编辑」，
            之后 <code>npm run db:import</code> 会跳过它，不再用文件覆盖你的修改。
          </p>
        ) : null}
      </header>

      <PostEditor
        isNew={false}
        flash={{ ok: ok ?? undefined, error: error ?? undefined }}
        initial={{
          slug: post.slug,
          title: post.title,
          summary: post.summary,
          cover: post.cover ?? '',
          coverAlt: post.coverAlt ?? '',
          tags: post.tags.join('\n'),
          category: post.category ?? '',
          featured: post.featured,
          status: post.status,
          publishedAt: post.publishedAt ?? '',
          body: post.body,
          expectedVersion: String(post.version),
        }}
      />
    </div>
  )
}
