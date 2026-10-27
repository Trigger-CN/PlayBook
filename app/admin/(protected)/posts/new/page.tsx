import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { isAdminConfigured, requireAdmin } from '@/lib/auth/admin'

import { PostEditor } from '../post-editor'

/**
 * 新建文章（设计 15-post-editor §1 路由 `/admin/posts/new`）。
 *
 * 守卫在这里再做一次：layout 会挡未登录，但页面被单独渲染时
 * 不能假定守卫一定跑过 —— 每个入口各自鉴权是这套后台的统一口径。
 */
export const metadata: Metadata = {
  title: '新建文章',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>
}

/**
 * 今天，按本地时区取日期部分。
 *
 * 不能用 `toISOString().slice(0,10)` —— 实测过：库在 Asia/Shanghai、
 * 本地时区 +08:00 时，那样取出来会少一天。
 */
function todayLocal(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default async function NewPostPage({ searchParams }: Props) {
  if (!isAdminConfigured()) redirect('/admin/login')
  const identity = await requireAdmin()
  if (!identity) redirect('/admin/login?next=/admin/posts/new')

  const { error, message } = await searchParams

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl">新建文章</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          正文用 Markdown 书写。支持 $公式$、$$公式块$$ 与 mermaid 图表；保存草稿随时可以，发布前会做一次渲染校验。
        </p>
      </header>

      {error === 'slug' && message ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
        >
          {message}
        </p>
      ) : null}

      <PostEditor
        isNew
        flash={null}
        initial={{
          slug: '',
          title: '',
          summary: '',
          cover: '',
          coverAlt: '',
          tags: '',
          category: '',
          featured: false,
          status: 'draft',
          publishedAt: todayLocal(),
          body: '',
          expectedVersion: '',
        }}
      />
    </div>
  )
}
