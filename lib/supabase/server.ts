import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * 服务端 Supabase client（设计 module 12 §9）。
 * 使用 anon key + 用户会话；service role 只在明确的 server-only helper 中使用，
 * 且永远不进入客户端 bundle。
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      '缺少 Supabase 环境变量：请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Component 中无法写 cookie；会话刷新由 middleware 负责。
        }
      },
    },
  })
}

/** 判断 Supabase 是否已配置，供页面优雅降级使用。 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
