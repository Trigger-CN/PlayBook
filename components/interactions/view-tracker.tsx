'use client'

import { useEffect, useRef } from 'react'

/**
 * 浏览量上报（设计 module 08 §3）。
 *
 * 为什么是独立极小 Client Component：
 * 不引入任何 analytics SDK，只在页面渲染成功后上报一次（module 08 §8）。
 * 失败静默，不重试、不阻塞阅读（module 08 §3「记录失败不重试风暴」）。
 *
 * 用 keepalive 而不是 sendBeacon：本组件在页面已经加载完成时才触发，
 * 不需要赶在卸载前发送；keepalive 在两种情况下都能工作且能用 fetch 的
 * 语义（sendBeacon 无法自定义 content-type 为 application/json）。
 */

type Props = {
  path: string
  targetType?: 'post' | 'timeline_item'
  targetId?: string
  /** 无数据库时完全不上报，避免产生必然失败的请求。 */
  enabled?: boolean
}

export function ViewTracker({ path, targetType, targetId, enabled = true }: Props) {
  // 防止 React 严格模式下 effect 双执行导致重复上报。
  // 真正的去重仍在服务端（30 分钟窗口），这里只是减少无效请求。
  const reported = useRef(false)

  useEffect(() => {
    if (!enabled || reported.current) return
    reported.current = true

    const body = JSON.stringify({
      path,
      ...(targetType && targetId ? { targetType, targetId } : {}),
    })

    void fetch('/api/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // 静默：浏览计数失败不影响阅读体验，也不值得打扰访客。
    })
  }, [enabled, path, targetType, targetId])

  return null
}
