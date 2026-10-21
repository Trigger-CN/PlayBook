import type { Metadata } from 'next'
import Link from 'next/link'

import { listTimelineForAdmin } from '@/lib/admin/repository'
import { timelineTypeStyles } from '@/config/timeline'
import { TIMELINE_STATUSES, TIMELINE_TYPES } from '@/lib/timeline/types'

import { changeTimelineStatusAction, saveTimelineAction } from './actions'

/**
 * 时间轴管理页（设计 11-admin-timeline）。
 *
 * 表单与列表同页：MVP 阶段节点数量有限，独立编辑页会让操作成本变高。
 * 新节点与编辑共用同一表单（id 是主键，upsert 语义）。
 */
export const metadata: Metadata = { title: '时间轴管理' }

type Props = {
  searchParams: Promise<{ ok?: string; error?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  bad_id: 'ID 只能是小写字母、数字与连字符，且不超过 120 字符。',
  bad_content: '正文长度必须在 1 到 5000 字符之间。',
  bad_type: '类型不合法。',
  bad_status: '状态不合法。',
  bad_date: '日期格式必须是 YYYY-MM-DD。',
  missing_image_alt: '填写了图片地址就必须填写图片替代文本。',
  not_found: '节点不存在。',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已下线',
}

export default async function AdminTimelinePage({ searchParams }: Props) {
  const { ok, error } = await searchParams
  const items = await listTimelineForAdmin()

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl">时间轴管理</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          节点 ID 是公开地址的一部分（/timeline/&lt;id&gt;），也是互动数据的目标键，发布后不宜更改。
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}
        >
          {ERROR_MESSAGES[error] ?? `操作失败（${error}）`}
        </p>
      ) : null}
      {ok ? (
        <p
          role="status"
          className="mb-4 rounded-xl border px-3 py-2 text-sm font-bold"
          style={{ borderColor: 'var(--mint)' }}
        >
          已保存：{ok}
        </p>
      ) : null}

      <section aria-labelledby="new-title" className="mb-8">
        <h2 id="new-title" className="font-display text-xl">
          新建 / 编辑节点
        </h2>
        <form
          action={saveTimelineAction}
          className="mt-3 grid gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ID（slug）" name="id" required placeholder="my-new-node" />
            <Field label="标题（可选）" name="title" placeholder="留空则用类型 + 日期合成" />
          </div>

          <div>
            <label htmlFor="content" className="mb-1 block text-xs font-extrabold">
              正文 <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="content"
              name="content"
              rows={4}
              required
              maxLength={5000}
              className="w-full rounded-xl border px-3 py-2 text-sm leading-relaxed"
              style={{ borderColor: 'var(--line)' }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="type" className="mb-1 block text-xs font-extrabold">
                类型
              </label>
              <select
                id="type"
                name="type"
                defaultValue="note"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--line)' }}
              >
                {TIMELINE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {timelineTypeStyles[type].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="status" className="mb-1 block text-xs font-extrabold">
                状态
              </label>
              <select
                id="status"
                name="status"
                defaultValue="draft"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--line)' }}
              >
                {TIMELINE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </select>
            </div>

            <Field label="发生日期" name="occurredAt" required placeholder="2026-07-17" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="图片地址（可选）" name="imageUrl" placeholder="/images/timeline/x.svg" />
            <Field label="图片替代文本" name="imageAlt" placeholder="有图时必填" />
          </div>

          <Field label="外部链接（可选）" name="externalUrl" placeholder="https://…" />

          <div>
            <button
              type="submit"
              className="rounded-lg border px-4 py-2 text-sm font-extrabold"
              style={{ borderColor: 'var(--line)', background: 'var(--cream)', color: '#4a2d11' }}
            >
              保存节点
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="list-title">
        <h2 id="list-title" className="font-display text-xl">
          全部节点（{items.length}）
        </h2>

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">还没有节点。</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border p-3.5"
                style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <b className="text-sm">{item.title ?? '（无标题）'}</b>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                      style={{ background: 'var(--cream)', color: '#4a2d11' }}
                    >
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                    <code className="text-xs text-[var(--muted)]">{item.id}</code>
                  </div>
                  <time dateTime={item.occurredAt} className="text-xs text-[var(--muted)]">
                    {item.occurredAt}
                  </time>
                </div>

                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                  {item.content}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {item.status !== 'published' ? (
                    <StatusForm id={item.id} status="published" label="发布" />
                  ) : null}
                  {item.status !== 'archived' ? (
                    <StatusForm id={item.id} status="archived" label="下线" />
                  ) : null}
                  {item.status !== 'draft' ? (
                    <StatusForm id={item.id} status="draft" label="转草稿" />
                  ) : null}
                  {item.status === 'published' ? (
                    <Link
                      href={`/timeline/${item.id}`}
                      className="text-xs font-bold underline text-[var(--muted)]"
                    >
                      查看公开页 ↗
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string
  name: string
  required?: boolean
  placeholder?: string
}) {
  const id = `field-${name}`
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-extrabold">
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </label>
      <input
        id={id}
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--line)' }}
      />
    </div>
  )
}

function StatusForm({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={changeTimelineStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="rounded-lg border px-2.5 py-1 text-xs font-extrabold"
        style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
      >
        {label}
      </button>
    </form>
  )
}
