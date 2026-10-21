-- =============================================================================
-- Phase 8 / 管理员认证（自建库过渡方案）——【可移植：自建库与 Supabase 通用】
--
-- 为什么不是 Supabase Auth：
--   设计文档 08/16 要求用 Supabase Auth 的魔法链接。当前处于「自建 PostgreSQL
--   过渡」阶段，没有 Supabase 项目凭据，因此这里提供一套等价的过渡实现：
--     * 仍然不存密码（设计要求「不自建密码存储」）。
--     * 仍用「邮箱 → 一次性链接」的魔法链接流程。
--     * 会话仍由服务端校验，不是把权限判断放在前端。
--   将来切到 Supabase Auth 时，只需替换 lib/auth/ 的实现，
--   这两张表可以整体弃用（不参与公开内容读取）。
--
-- 安全设计：
-- 1. 令牌只存哈希（sha256），不存明文 —— 与 comments.author_email_hash 同一原则。
-- 2. 令牌一次性：used_at 非空即失效。
-- 3. 令牌有短期有效期（默认 15 分钟）。
-- 4. 会话同样只存哈希，且可单独撤销。
-- 5. 邮箱白名单来自环境变量 ADMIN_EMAIL，不写死在表里。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 登录令牌
-- -----------------------------------------------------------------------------
create table if not exists public.admin_login_tokens (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  constraint admin_login_tokens_email_check check (char_length(email) between 3 and 254),
  constraint admin_login_tokens_hash_check check (char_length(token_hash) between 16 and 128)
);

create index if not exists admin_login_tokens_expiry_idx
  on public.admin_login_tokens (expires_at desc);

-- -----------------------------------------------------------------------------
-- 管理员会话
-- -----------------------------------------------------------------------------
create table if not exists public.admin_sessions (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint admin_sessions_email_check check (char_length(email) between 3 and 254),
  constraint admin_sessions_hash_check check (char_length(token_hash) between 16 and 128)
);

create index if not exists admin_sessions_expiry_idx
  on public.admin_sessions (expires_at desc)
  where revoked_at is null;

-- -----------------------------------------------------------------------------
-- 审计日志：审核、删除、发布、设置变更（设计 08 §5）
-- -----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now(),
  constraint admin_audit_log_action_check check (char_length(action) between 1 and 64)
);

create index if not exists admin_audit_log_recent_idx
  on public.admin_audit_log (created_at desc);

-- -----------------------------------------------------------------------------
-- 清理过期令牌与会话（可重复执行）
-- -----------------------------------------------------------------------------
create or replace function public.purge_expired_admin_auth()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer := 0;
  v_count integer;
begin
  delete from public.admin_login_tokens
   where expires_at < now() - interval '1 day' or used_at is not null;
  get diagnostics v_count = row_count;
  v_removed := v_removed + v_count;

  delete from public.admin_sessions
   where expires_at < now() - interval '1 day' or revoked_at is not null;
  get diagnostics v_count = row_count;
  v_removed := v_removed + v_count;

  return v_removed;
end;
$$;

revoke all on function public.purge_expired_admin_auth() from public;
