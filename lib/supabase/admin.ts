import 'server-only'

import { createClient } from '@supabase/supabase-js'

import type { Database } from './database.types'

/**
 * service role 客户端（设计 module 13 §3「service role 查询封装 server-only」）。
 *
 * 安全约束：
 * - 本文件顶部有 `import 'server-only'`，任何客户端组件引用都会在构建期失败，
 *   因此 SUPABASE_SERVICE_ROLE_KEY 不可能进入浏览器 bundle。
 * - 变量名不带 NEXT_PUBLIC_ 前缀，Next.js 也不会内联到客户端。
 * - 只能在 Route Handler、Server Action 或服务端脚本中使用，禁止用于页面渲染数据。
 */
export type SupabaseAdminClient = ReturnType<typeof createAdminClient>

function readRequired(name: string): string {
  const value = process.env[name]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `缺少环境变量 ${name}：service role 客户端只在服务端使用，请在 .env.local 中配置（可参考 .env.example）`,
    )
  }
  return value.trim()
}

/**
 * 创建 service role 客户端。绕过 RLS，因此调用方必须自行完成授权与输入校验。
 * 惰性创建：每次调用返回新实例，避免在模块级持有长连接。
 */
export function createAdminClient() {
  const url = readRequired('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = readRequired('SUPABASE_SERVICE_ROLE_KEY')

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      // service role 不需要用户会话，也不应持久化任何凭证
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

/** 是否已配置 service role；用于在缺少凭据时给出可读提示而不是崩溃。 */
export function isSupabaseAdminConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return (
    typeof url === 'string' && url.trim().length > 0 &&
    typeof key === 'string' && key.trim().length > 0
  )
}
