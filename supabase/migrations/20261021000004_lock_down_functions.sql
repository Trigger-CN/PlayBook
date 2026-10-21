-- =============================================================================
-- Phase 5 / 收紧公开计数函数的执行权限 —— 【可移植：自建库与 Supabase 通用】
--
-- 背景：PostgreSQL 对新建函数默认把 EXECUTE 授予 PUBLIC，
-- 而 000003 里的四个函数都是 security definer（以属主身份执行，
-- 可绕过表级权限）。若不撤销，任何能连上库的角色都能直接调用它们，
-- 例如以任意 visitor_id 写入 page_views 或读取点赞聚合。
--
-- 本文件只使用标准 SQL：revoke ... from public，不引用 anon /
-- authenticated / service_role，因此自建库与 Supabase 都能执行。
--
-- 与 000002 的关系：Supabase 上 000002 末尾已把 EXECUTE 显式授予
-- service_role。revoke ... from public 只撤销 PUBLIC 这个伪角色上的
-- 默认授权，不会影响对 service_role 的显式授权，因此两者可共存。
--
-- 自建库若改用最小权限应用角色（而非库属主连接），需要额外执行：
--   grant execute on function ... to <app_role>;
-- 本文件不做此授予，因为角色名与是否存在只能由部署方决定，
-- 写死在迁移里会让未创建该角色的环境直接失败。
-- =============================================================================

revoke all on function public.get_like_state(text, text, text) from public;
revoke all on function public.get_like_counts(text, text[]) from public;
revoke all on function public.record_page_view(text, text, text, text, text, text, text, integer) from public;
revoke all on function public.get_content_totals() from public;
