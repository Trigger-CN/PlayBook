'use client'

import { useActionState, useId, useState } from 'react'

import { ToyButton } from '@/components/ui/toy-button'

import { login, type LoginState } from './actions'

/**
 * 登录表单（设计 16 §2.1、§7）。
 *
 * ## 两个字段都是受控的
 *
 * React 19 在 form action 提交后会自动重置非受控字段。口令登录尤其不能这样：
 * 口令输错一次，邮箱被清空、口令也没了，人得从头再打一遍。受控字段不受这套
 * 重置影响。
 *
 * - 提交中锁定按钮（ToyButton 的 loading 会 disabled 并带 aria-busy），
 *   避免重复提交。
 * - 错误用 role="status" + aria-live 宣布，并与两个输入框通过 aria-describedby 关联。
 * - autoComplete 用 email / current-password，密码管理器可以正常工作。
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState | null, FormData>(login, null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const emailId = useId()
  const passwordId = useId()
  const messageId = useId()

  const isError = state?.status === 'error' || state?.status === 'unavailable'

  return (
    <form action={formAction} className="mt-5" noValidate>
      <input type="hidden" name="next" value={next} />

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
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={isError || undefined}
        aria-describedby={messageId}
        className="w-full rounded-xl border px-3 py-2.5 text-sm"
        style={{ borderColor: isError ? 'var(--coral)' : 'var(--line)' }}
      />

      <label htmlFor={passwordId} className="mb-1 mt-4 block text-xs font-extrabold">
        口令
      </label>
      <input
        id={passwordId}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-invalid={isError || undefined}
        aria-describedby={messageId}
        className="w-full rounded-xl border px-3 py-2.5 text-sm"
        style={{ borderColor: isError ? 'var(--coral)' : 'var(--line)' }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ToyButton type="submit" size="small" loading={pending}>
          登录
        </ToyButton>
        <span className="text-xs text-[var(--muted)]">口令由服务端环境变量提供</span>
      </div>

      <div
        id={messageId}
        role="status"
        aria-live="polite"
        className="mt-4 text-xs font-bold leading-relaxed"
        style={{ color: isError ? 'var(--coral)' : 'var(--muted)' }}
      >
        {state?.message ?? ''}
      </div>
    </form>
  )
}
