'use client'

/**
 * 后台错误边界（设计 08 §3.5）。
 *
 * 只显示 error.digest，绝不渲染 message / stack / SQL —— 后台错误里
 * 可能包含查询片段或表名，泄漏给浏览器等于免费给出攻击面。
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div role="alert" className="mx-auto max-w-[520px] py-10">
      <h1 className="font-display text-2xl">后台操作出错</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        已记录这次错误。可以重试，或返回概览页继续其它操作。
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-[var(--muted)]">错误编号：{error.digest}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border px-4 py-2 text-sm font-extrabold"
          style={{ borderColor: 'var(--line)', background: 'var(--cream)', color: 'var(--on-accent)' }}
        >
          重试
        </button>
        <a
          href="/admin"
          className="rounded-lg border px-4 py-2 text-sm font-extrabold"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          返回概览
        </a>
      </div>
    </div>
  )
}
