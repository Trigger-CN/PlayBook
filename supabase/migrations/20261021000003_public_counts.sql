-- =============================================================================
-- Phase 5 / 公开计数与去重写入函数
-- 依据：docs/design/modules/07-likes.md §6、08-page-views.md §4
--
-- 这些函数只暴露聚合结果，不返回 visitor_id 或逐行记录。
-- 供服务端 Route Handler 以 service role 调用；anon 不授予 execute。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 单目标点赞计数；p_visitor_id 用于返回该访客是否已点赞。
-- -----------------------------------------------------------------------------
create or replace function public.get_like_state(
  p_target_type text,
  p_target_id   text,
  p_visitor_id  text default null
)
returns table (like_count bigint, liked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint as like_count,
    coalesce(bool_or(l.visitor_id = p_visitor_id), false) as liked
  from public.likes l
  where l.target_type = p_target_type
    and l.target_id = p_target_id;
$$;

-- -----------------------------------------------------------------------------
-- 批量点赞计数，避免列表页 N+1（07-likes.md §6）。
-- 返回 (target_id, like_count)；无点赞的目标不出现在结果里，由调用方补 0。
-- -----------------------------------------------------------------------------
create or replace function public.get_like_counts(
  p_target_type text,
  p_target_ids  text[]
)
returns table (target_id text, like_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.target_id, count(*)::bigint as like_count
  from public.likes l
  where l.target_type = p_target_type
    and l.target_id = any(p_target_ids)
  group by l.target_id;
$$;

-- -----------------------------------------------------------------------------
-- 浏览量去重写入：同一 visitor 对同一目标 30 分钟内只计一次（08-page-views.md §4）。
-- 用单条语句完成「检查+写入」，避免先查后写的并发窗口。
-- 返回是否计入本次浏览。
-- -----------------------------------------------------------------------------
create or replace function public.record_page_view(
  p_path            text,
  p_target_type     text default null,
  p_target_id       text default null,
  p_visitor_id      text default null,
  p_ip_hash         text default null,
  p_user_agent_hash text default null,
  p_referrer        text default null,
  p_window_minutes  integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if p_visitor_id is not null and p_target_id is not null then
    select exists (
      select 1
      from public.page_views pv
      where pv.visitor_id = p_visitor_id
        and pv.target_type = p_target_type
        and pv.target_id = p_target_id
        and pv.created_at > now() - make_interval(mins => p_window_minutes)
    ) into v_exists;

    if v_exists then
      return false;
    end if;
  end if;

  insert into public.page_views (
    path, target_type, target_id, visitor_id, ip_hash, user_agent_hash, referrer
  ) values (
    p_path, p_target_type, p_target_id, p_visitor_id, p_ip_hash, p_user_agent_hash, p_referrer
  );

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 内容总数（D-07：累计总量从内容表取，不读每日聚合表）
-- -----------------------------------------------------------------------------
create or replace function public.get_content_totals()
returns table (posts_total bigint, timeline_total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::bigint from public.posts where status = 'published'),
    (select count(*)::bigint from public.timeline_items where status = 'published');
$$;

-- -----------------------------------------------------------------------------
-- 权限：撤销默认的 public 执行权，只授予 service_role。
-- 服务端 handler 使用 service role 调用这些函数。
-- -----------------------------------------------------------------------------
revoke all on function public.get_like_state(text, text, text) from public, anon, authenticated;
revoke all on function public.get_like_counts(text, text[]) from public, anon, authenticated;
revoke all on function public.record_page_view(text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_content_totals() from public, anon, authenticated;

grant execute on function public.get_like_state(text, text, text) to service_role;
grant execute on function public.get_like_counts(text, text[]) to service_role;
grant execute on function public.record_page_view(text, text, text, text, text, text, text, integer) to service_role;
grant execute on function public.get_content_totals() to service_role;
