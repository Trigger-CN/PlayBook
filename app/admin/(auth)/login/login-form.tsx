'use client'

import { useActionState, useId } from 'react'

import { ToyButton } from '@/components/ui/toy-button'

import { requestLoginLink, type LoginState } from './actions'

/**
 * 登录表单（设计 16 §2.1、§7）。
 *
 * 状态机：idle → sending → sent | error | unavailable。
 * - 提交中锁定按钮并保持宽度（aria-busy），避免重复请求。
 * - 错误通过 aria-live 宣布，并与输入框关联。
 * - 邮箱用 autocomplete="email"，键盘可完成全流程。
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState | null, FormData>(
    requestLoginLink,
    null,
  )

  const emailId = useId()
  const messageId = useId()

  const isError = state?.status === 'error' || state?.status === 'unavailable'

  return (
    <form action={formAction} className="mt-5" noValidate>
      <label htmlFor={emailId} className="mb-1 block text-xs font-extrabold">
        管理员邮箱
      </label>
      <input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        aria-invalid={isError || undefined}
        aria-describedby={messageId}
        className="w-full rounded-xl border px-3 py-2.5 text-sm"
        style={{ borderColor: isError ? 'var(--coral)' : 'var(--line)' }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ToyButton type="submit" size="small" loading={pending}>
          发送登录链接
        </ToyButton>
        <span className="text-xs text-[var(--muted)]">不需要密码</span>
      </div>

      <div
        id={messageId}
        role="status"
        aria-live="polite"
        className="mt-4 text-xs font-bold leading-relaxed"
        style={{ color: isError ? 'var(--coral)' : 'var(--muted)' }}
      >
        {state?.message ?? ''}

        {state?.devLink ? (
          <span className="mt-2 block">
            <span className="text-[var(--muted)]">本地开发用登录链接：</span>
            <a
              href={state.devLink}
              className="ml-1 break-all underline"
              style={{ color: 'var(--ink)' }}
            >
              {state.devLink}
            </a>
          </span>
        ) : null}
      </div>
    </form>
  )
}
