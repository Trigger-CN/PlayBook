-- =============================================================================
-- 后台登录改为「邮箱 + 环境变量口令」：移除一次性令牌链路
--
-- 旧流程是「提交邮箱 → 生成一次性令牌 → 兑换成会话」。现在登录改为
-- 「ADMIN_EMAIL + INTERACTION_HASH_SALT 现算现比」，令牌这一环整体消失，
-- admin_login_tokens 不再有任何读写者。
--
-- ## 为什么显式 drop 而不是留着
--
-- 留着这张表有一个具体后果：purge_expired_admin_auth() 仍在 delete from 它，
-- 而一张没人写入的表永远只有过期行 —— 每次清理都在做无用功。更麻烦的是后来
-- 的人读 schema 会以为还存在「发链接登录」这条路径，而代码里根本没有。
--
-- 表里只有一次性令牌的 sha256 与时间戳，没有可用凭据或业务数据，删除不损失信息。
--
-- ## 会话表与审计表不动
--
-- admin_sessions 与 admin_audit_log 与新的登录方式完全兼容，继续使用。
-- =============================================================================

-- 先改造清理函数：去掉对 admin_login_tokens 的引用。
-- 顺序不能反 —— 先 drop 表再改函数，中间的窗口里调用清理函数会直接报错。
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
  delete from public.admin_sessions
   where expires_at < now() - interval '1 day' or revoked_at is not null;
  get diagnostics v_count = row_count;
  v_removed := v_removed + v_count;

  return v_removed;
end;
$$;

revoke all on function public.purge_expired_admin_auth() from public;

drop table if exists public.admin_login_tokens;
