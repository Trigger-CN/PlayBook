import type { Metadata } from 'next'
import Link from 'next/link'

import { Icon } from '@/components/ui/icon'
import {
  listTimelineForAdmin,
  listTimelineInteractionCounts,
  type AdminTimelineRow,
} from '@/lib/admin/repository'
import { timelineTypeStyles } from '@/config/timeline'
import { TIMELINE_STATUSES, TIMELINE_TYPES } from '@/lib/timeline/types'

import { archiveTimelineAction, changeTimelineStatusAction, saveTimelineAction } from './actions'

/**
 * 时间轴管理页（设计 11-admin-timeline）。
 *
 * 表单与列表同页：MVP 阶段节点数量有限，独立编辑页会让操作成本变高。
 * 新节点与编辑共用同一表单（id 是主键，upsert 语义）。
 *
 * 四个刻意的地方：
 *
 * 1. **筛选条件写进 query**（type / status / year / q）。刷新、返回、从编辑态回来
 *    都还能保持视图；纯内存筛选会在一次保存后全部丢失。
 * 2. **点击「编辑」回填表单**（`?edit=<id>`），并带 `expectedUpdatedAt` 版本戳。
 *    两人同时编辑同一节点时，后保存的那个会收到「已被修改」而不是静默覆盖。
 * 3. **下线前显示关联互动数量**。互动表不设外键（D-06），下线不影响已有评论，
 *    但作者需要知道这个动作会影响多少个已经在页面上的互动。
 * 4. **不提供物理删除**。归档即可，理由见 actions.ts 的注释。
 */
export const metadata: Metadata = { title: '时间轴管理' }

type Props = {
  searchParams: Promise<{
    ok?: string
    error?: string
    type?: string
    status?: string
    year?: string
    q?: string
    edit?: string
  }>
}

const ERROR_MESSAGES: Record<string, string> = {
  bad_id: '节点 ID 不合法，请刷新页面后重试。',
  bad_content: '正文长度必须在 1 到 5000 字符之间。',
  bad_type: '类型不合法。',
  bad_status: '状态不合法。',
  bad_date: '日期格式必须是 YYYY-MM-DD。',
  missing_image_alt: '填写了图片地址就必须填写图片替代文本。',
  bad_external_url: '外部链接必须以 http:// 或 https:// 开头。',
  conflict: '该节点已被其他人修改，请刷新后重新编辑，本次修改未保存。',
  not_found: '节点不存在。',
  generate_failed: '生成节点 ID 失败，请再点一次创建。',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已下线',
}

const OK_MESSAGES: Record<string, string> = {
  created: '已创建',
  updated: '已更新',
  published: '已发布',
  draft: '已转为草稿',
  archived: '已下线',
}

function normalizeType(raw: string | undefined): string | undefined {
  return raw && (TIMELINE_TYPES as readonly string[]).includes(raw) ? raw : undefined
}

function normalizeStatusFilter(raw: string | undefined): string | undefined {
  return raw && (TIMELINE_STATUSES as readonly string[]).includes(raw) ? raw : undefined
}

function normalizeYear(raw: string | undefined): string | undefined {
  return raw && /^\d{4}$/.test(raw) ? raw : undefined
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export default async function AdminTimelinePage({ searchParams }: Props) {
  const params = await searchParams
  const ok = params.ok
  const error = params.error

  const filters = {
    type: normalizeType(params.type),
    status: normalizeStatusFilter(params.status),
    year: normalizeYear(params.year),
    q: params.q?.trim() || undefined,
  }
  const hasFilter = Boolean(filters.type || filters.status || filters.year || filters.q)

  const items = await listTimelineForAdmin(filters)

  // 编辑目标：优先在筛选结果里找；被筛掉了就回退到全量查一次，
  // 否则「点了编辑但表单是空的」会被误认为节点不存在。
  let editing: AdminTimelineRow | null = null
  if (params.edit) {
    editing = items.find((item) => item.id === params.edit) ?? null
    if (!editing) {
      const all = await listTimelineForAdmin()
      editing = all.find((item) => item.id === params.edit) ?? null
    }
  }

  // 互动计数一次取完（避免每行一个查询）。
  const counts = await listTimelineInteractionCounts(items.map((item) => item.id))

  // 保留筛选的基准路径：编辑、保存后都回到同一个视图。
  const listQuery = buildQuery(filters)

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl">时间轴管理</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          节点 ID 由系统自动生成（形如 tl-3f9a2b1c5d7e），创建后不可修改 —— 它是公开地址的一部分，也是互动数据的目标键。
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
          {OK_MESSAGES[ok] ?? `已保存：${ok}`}
        </p>
      ) : null}

      <section aria-labelledby="form-title" className="mb-8">
        <h2 id="form-title" className="font-display text-xl">
          {editing ? `编辑节点：${editing.id}` : '新建节点'}
        </h2>
        {editing ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            正在编辑已有节点。
            <Link href={`/admin/timeline${listQuery}`} className="ml-1 font-bold underline">
              取消编辑，改为新建
            </Link>
          </p>
        ) : null}

        <form
          action={saveTimelineAction}
          className="mt-3 grid gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          {/*
            版本戳：编辑时带上打开表单那一刻的 updated_at。
            Server Action 会拿它与库中当前值比对，不一致就拒绝覆盖。
          */}
          {editing?.updatedAtStamp ? (
            <input type="hidden" name="expectedUpdatedAt" value={editing.updatedAtStamp} />
          ) : null}
          <input type="hidden" name="returnTo" value={`/admin/timeline${listQuery}`} />

          {editing ? (
            <div>
              <input type="hidden" name="id" value={editing.id} />
              <p className="text-xs text-[var(--muted)]">
                节点 ID <code className="font-bold">{editing.id}</code>
                {' · '}
                由系统生成，不可修改。
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="标题（可选）"
              name="title"
              placeholder="留空则用类型 + 日期合成"
              defaultValue={editing?.title ?? ''}
            />
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
              defaultValue={editing?.content ?? ''}
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
                defaultValue={editing?.type ?? 'note'}
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
                defaultValue={editing?.status ?? 'draft'}
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

            <Field
              label="发生日期"
              name="occurredAt"
              required
              placeholder="2026-07-17"
              defaultValue={editing?.occurredAt}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="图片地址（可选）"
              name="imageUrl"
              placeholder="/images/timeline/x.svg"
              defaultValue={editing?.imageUrl ?? ''}
            />
            <Field
              label="图片替代文本"
              name="imageAlt"
              placeholder="有图时必填"
              defaultValue={editing?.imageAlt ?? ''}
            />
          </div>

          <Field
            label="外部链接（可选）"
            name="externalUrl"
            placeholder="https://…"
            defaultValue={editing?.externalUrl ?? ''}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-lg border px-4 py-2 text-sm font-extrabold"
              style={{ borderColor: 'var(--line)', background: 'var(--cream)', color: 'var(--on-accent)' }}
            >
              {editing ? '保存修改' : '创建节点'}
            </button>
            {editing ? (
              <Link
                href={`/admin/timeline${listQuery}`}
                className="rounded-lg border px-4 py-2 text-sm font-extrabold"
                style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
              >
                取消
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section aria-labelledby="list-title">
        <h2 id="list-title" className="font-display text-xl">
          节点列表（{items.length}）
        </h2>

        <form
          method="get"
          className="mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-5"
          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
        >
          <div>
            <label htmlFor="filter-type" className="mb-1 block text-[11px] font-extrabold">
              类型
            </label>
            <select
              id="filter-type"
              name="type"
              defaultValue={filters.type ?? ''}
              className="w-full rounded-lg border px-2 py-1.5 text-xs"
              style={{ borderColor: 'var(--line)' }}
            >
              <option value="">全部</option>
              {TIMELINE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {timelineTypeStyles[type].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-status" className="mb-1 block text-[11px] font-extrabold">
              状态
            </label>
            <select
              id="filter-status"
              name="status"
              defaultValue={filters.status ?? ''}
              className="w-full rounded-lg border px-2 py-1.5 text-xs"
              style={{ borderColor: 'var(--line)' }}
            >
              <option value="">全部</option>
              {TIMELINE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status] ?? status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-year" className="mb-1 block text-[11px] font-extrabold">
              年份
            </label>
            <input
              id="filter-year"
              name="year"
              inputMode="numeric"
              placeholder="2026"
              defaultValue={filters.year ?? ''}
              className="w-full rounded-lg border px-2 py-1.5 text-xs"
              style={{ borderColor: 'var(--line)' }}
            />
          </div>
          <div>
            <label htmlFor="filter-q" className="mb-1 block text-[11px] font-extrabold">
              关键字
            </label>
            <input
              id="filter-q"
              name="q"
              placeholder="标题 / 正文 / ID"
              defaultValue={filters.q ?? ''}
              className="w-full rounded-lg border px-2 py-1.5 text-xs"
              style={{ borderColor: 'var(--line)' }}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg border px-3 py-1.5 text-xs font-extrabold"
              style={{ borderColor: 'var(--line)', background: 'var(--cream)', color: 'var(--on-accent)' }}
            >
              筛选
            </button>
            {hasFilter ? (
              <Link
                href="/admin/timeline"
                className="rounded-lg border px-3 py-1.5 text-xs font-extrabold"
                style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
              >
                清除
              </Link>
            ) : null}
          </div>
        </form>

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            {hasFilter ? '没有符合条件的节点。' : '还没有节点。'}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {items.map((item) => {
              const stat = counts[item.id] ?? { comments: 0, likes: 0 }
              return (
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
                        style={{ background: 'var(--cream)', color: 'var(--on-accent)' }}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--muted)]">
                        {timelineTypeStyles[item.type as keyof typeof timelineTypeStyles]?.label ??
                          item.type}
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
                    <Link
                      href={`/admin/timeline${buildQuery({ ...filters, edit: item.id })}`}
                      className="rounded-lg border px-2.5 py-1 text-xs font-extrabold"
                      style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
                    >
                      编辑
                    </Link>
                    {item.status !== 'published' ? (
                      <StatusForm id={item.id} status="published" label="发布" returnTo={listQuery} />
                    ) : null}
                    {item.status !== 'draft' ? (
                      <StatusForm id={item.id} status="draft" label="转草稿" returnTo={listQuery} />
                    ) : null}
                    {/*
                      下线按钮上直接写出会影响多少条互动：
                      互动表不设外键，下线不会删数据，但作者应该知道影响面。
                    */}
                    {item.status !== 'archived' ? (
                      <form action={archiveTimelineAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="returnTo" value={`/admin/timeline${listQuery}`} />
                        <button
                          type="submit"
                          className="rounded-lg border px-2.5 py-1 text-xs font-extrabold"
                          style={{ borderColor: 'var(--line)', background: 'var(--soft)' }}
                        >
                          下线
                          {stat.comments > 0 || stat.likes > 0
                            ? `（${stat.comments} 评论 / ${stat.likes} 赞）`
                            : ''}
                        </button>
                      </form>
                    ) : null}
                    {item.status === 'published' ? (
                      <Link
                        href={`/timeline/${item.id}`}
                        className="text-xs font-bold underline text-[var(--muted)]"
                      >
                        查看公开页 <Icon name="north_east" size={11} />
                      </Link>
                    ) : null}
                  </div>

                  <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                    互动：{stat.comments} 条评论 / {stat.likes} 个赞
                    {item.updatedAtStamp ? ` · 最后修改 ${item.updatedAtStamp}` : ''}
                  </p>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
          「下线」只把状态改成 archived，不做物理删除 —— 互动表按设计不设外键，
          物理删除会留下孤儿评论与点赞，数据库不会拦住这件事。
        </p>
      </section>
    </div>
  )
}

function Field({
  label,
  name,
  required,
  placeholder,
  defaultValue,
  readOnly,
  hint,
}: {
  label: string
  name: string
  required?: boolean
  placeholder?: string
  defaultValue?: string
  readOnly?: boolean
  hint?: string
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
        defaultValue={defaultValue}
        readOnly={readOnly}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-xl border px-3 py-2 text-sm"
        style={{
          borderColor: 'var(--line)',
          background: readOnly ? 'var(--soft)' : undefined,
          color: readOnly ? 'var(--muted)' : undefined,
        }}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[11px] text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function StatusForm({
  id,
  status,
  label,
  returnTo,
}: {
  id: string
  status: string
  label: string
  returnTo: string
}) {
  return (
    <form action={changeTimelineStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={`/admin/timeline${returnTo}`} />
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
