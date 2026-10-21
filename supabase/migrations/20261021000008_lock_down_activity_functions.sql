-- =============================================================================
-- 收紧 Phase 7 新增函数的执行权限 ——【可移植：自建库与 Supabase 通用】
--
-- 与 000004 同理：PostgreSQL 对新建函数默认把 EXECUTE 授予 PUBLIC，
-- 而这些函数都是 security definer（以属主身份执行，可绕过表级权限）。
-- 若不撤销，任何能连上库的角色都能直接调用，例如：
--   * record_activity  → 伪造任意活动事件
--   * aggregate_daily_stats / backfill_daily_stats → 触发昂贵聚合
--
-- 本文件只使用标准 SQL（revoke ... from public），自建库与 Supabase 都能执行。
-- Supabase 侧的显式授权（grant ... to service_role）在 000002 里做。
-- =============================================================================

revoke all on function public.record_activity(text, text, text, text, jsonb, text) from public;
revoke all on function public.record_view_milestone(text, text, text) from public;
revoke all on function public.aggregate_daily_stats(date) from public;
revoke all on function public.backfill_daily_stats(integer) from public;

-- 公开活跃列表是给匿名访客看的，因此保留 PUBLIC 可执行是刻意的。
-- 它内部已过滤公开事件类型且不返回访客标识。
grant execute on function public.list_public_activity(integer) to public;
