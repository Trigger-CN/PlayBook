/**
 * Supabase 环境变量读取（客户端与服务端共用，不含 server-only）。
 *
 * 设计要点：
 * - 只暴露 anon key；service role key 的读取放在 lib/supabase/admin.ts 且带 server-only。
 * - 全部函数在缺变量时返回 null 或抛出可读错误，不把 undefined 传进 createClient。
 * - 空字符串与纯空白视为未配置，避免 .env 里留空值被误判为已配置。
 */

export type SupabasePublicConfig = {
  url: string
  anonKey: string
}

function readEnv(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** 读取公开配置（NEXT_PUBLIC_*，可安全进入浏览器 bundle）。 */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = readEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = readEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (!url || !anonKey) return null
  return { url, anonKey }
}

/** 是否已配置 Supabase 公开凭据；供页面优雅降级。 */
export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null
}

/** 取公开配置，缺失时抛出带指引的错误。 */
export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig()
  if (!config) {
    throw new Error(
      '缺少 Supabase 环境变量：请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY（可参考 .env.example）',
    )
  }
  return config
}
