'use client'

import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

/**
 * 浏览器端 Supabase client（设计 module 12 §2）。
 * 只使用 anon key；service role 永不下发。惰性创建避免每次渲染新建连接。
 */
export function getSupabaseBrowserClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      '缺少 Supabase 环境变量：请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }

  client = createBrowserClient(url, anonKey)
  return client
}
