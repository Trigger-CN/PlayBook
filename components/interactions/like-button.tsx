'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import { ToyButton } from '@/components/ui/toy-button'
import type { LikeState, TargetType } from '@/lib/interactions/types'

/**
 * 点赞按钮（设计 module 07 §8）。
 *
 * 行为要点：
 * - 乐观更新：点击立即 count±1、pressed 翻转（module 07 §4.2）。
 * - 失败回滚并用礼貌提示，不只改变颜色（module 07 §8）。
 * - 服务端返回权威 count 后以权威值覆盖，避免并发漂移。
 * - `aria-pressed` 表达已赞状态；loading 用 aria-busy 且保持宽度。
 * - 选中态不保持物理按下位移，只改文案与色对（module 07 §3）。
 */

type Props = {
  targetType: TargetType
  targetId: string
  /** 服务端初始聚合值；无数据库时为 undefined，按钮退化为不可用。 */
  initial?: LikeState
  /** 无数据库时置 false：按钮仍可见但不可点，并说明原因。 */
  enabled?: boolean
}

type Status = 'idle' | 'pending' | 'error'

export function LikeButton({ targetType, targetId, initial, enabled = true }: Props) {
  const [state, setState] = useState<LikeState>(initial ?? { count: 0, liked: false })
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  // 防止连点造成请求乱序：只保留最后一次意图（module 07 §9）。
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    // 服务端无法知道「当前访客是否已赞」（读 cookie 会让路由退化为 Dynamic），
    // 因此挂载后补一次 GET 拿访客维度的 liked（module 07 §4.1）。
    // 只拿状态，不改计数——计数已由服务端首屏渲染给出。
    if (enabled) {
      void fetch(`/api/likes?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`)
        .then(async (response) => {
          if (!response.ok) return null
          return (await response.json()) as LikeState
        })
        .then((server) => {
          if (!mounted.current || !server) return
          // 仅在用户尚未操作时采纳服务端状态，避免覆盖刚点的乐观值。
          if (!inFlight.current) setState(server)
        })
        .catch(() => {
          // 静默：拿不到 liked 状态不影响点赞本身。
        })
    }

    return () => {
      mounted.current = false
    }
  }, [enabled, targetType, targetId])

  const send = useCallback(
    async (nextLiked: boolean) => {
      const response = await fetch('/api/likes', {
        method: nextLiked ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId }),
      })

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(detail?.message ?? '操作失败')
      }

      return (await response.json()) as LikeState
    },
    [targetType, targetId],
  )

  const toggle = useCallback(() => {
    if (!enabled || inFlight.current) return

    const previous = state
    const nextLiked = !previous.liked
    const optimistic: LikeState = {
      liked: nextLiked,
      count: Math.max(0, previous.count + (nextLiked ? 1 : -1)),
    }

    setState(optimistic)
    setStatus('pending')
    setMessage(null)
    inFlight.current = true

    void send(nextLiked)
      .then((authoritative) => {
        if (!mounted.current) return
        // 服务端是权威：即使本地乐观值与之不同也以服务端为准。
        setState(authoritative)
        setStatus('idle')
      })
      .catch((error: unknown) => {
        if (!mounted.current) return
        setState(previous)
        setStatus('error')
        setMessage(error instanceof Error ? error.message : '操作失败，请稍后再试')
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [enabled, state, send])

  if (!enabled) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <ToyButton size="small" variant="cream" disabled>
          点赞功能需要数据库
        </ToyButton>
        <span className="text-xs font-bold text-[var(--muted)]">配置 DATABASE_URL 后可用</span>
      </div>
    )
  }

  const label = state.liked ? `已赞 ${state.count}` : `点赞 ${state.count}`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToyButton
        size="small"
        variant={state.liked ? 'coral' : 'cream'}
        pressed={state.liked}
        loading={status === 'pending'}
        onClick={toggle}
        aria-label={
          state.liked ? `取消点赞，当前 ${state.count} 个赞` : `点赞，当前 ${state.count} 个赞`
        }
      >
        <Icon name={state.liked ? 'favorite' : 'heart_minus'} size={15} /> {label}
      </ToyButton>

      {/* 错误用 aria-live 播报，且不只依赖颜色（module 07 §8）。 */}
      <p role="status" aria-live="polite" className="text-xs font-bold text-[var(--muted)]">
        {status === 'error' ? message : ''}
      </p>
    </div>
  )
}
