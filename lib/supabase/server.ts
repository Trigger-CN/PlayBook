import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import type { Database } from './database.types'
import { getSupabasePublicConfig, requireSupabasePublicConfig } from './env'

export { isSupabaseConfigured } from './env'

/**
 * 服务端 Supabase client（设计 module 12 §9）。
 * 使用 anon key + 用户会话；RLS 生效。
 *
 * 注意：本函数调用 cookies()，会让调用它的路由退化为 Dynamic。
 * 因此只应在需要会话的 Route Handler / Server Action / 后台页面中使用，
 * 公开内容页应改用 createSupabaseStaticClient 或 service role 查询。
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabasePublicConfig()
  const cookieStore = await cookies()

  return createServerClient<Database>(url, anonKey, {
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

/**
 * 不读取 cookie 的只读客户端，用于公开数据的静态/ISR 查询。
 * 没有会话，RLS 以 anon 身份执行，只能读到公开数据，因此不会让路由退化为 Dynamic。
 */
export function createSupabaseStaticClient() {
  const config = getSupabasePublicConfig()
  if (!config) {
    throw new Error(
      '缺少 Supabase 环境变量：请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY（可参考 .env.example）',
    )
  }

  return createClient<Database>(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
