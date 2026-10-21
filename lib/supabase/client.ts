'use client'

import { createBrowserClient } from '@supabase/ssr'

import type { Database } from './database.types'
import { requireSupabasePublicConfig } from './env'

export { isSupabaseConfigured } from './env'

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>

let client: BrowserClient | null = null

/**
 * 浏览器端 Supabase client（设计 module 12 §2）。
 * 只使用 anon key；service role 永不下发（见 lib/supabase/admin.ts 的 server-only 守卫）。
 * 惰性创建并复用实例，避免每次渲染新建连接。
 */
export function getSupabaseBrowserClient(): BrowserClient {
  if (client) return client

  const { url, anonKey } = requireSupabasePublicConfig()
  client = createBrowserClient<Database>(url, anonKey)
  return client
}
