-- =============================================================================
-- Phase 7 / 活跃事件写入与每日聚合 ——【可移植：自建库与 Supabase 通用】
-- 依据：docs/design/modules/09-stats-activity.md §4/§5
--
-- 设计要点：
-- 1. 活动事件写入幂等：同一 dedupe_key 只保留一条（module 09 §4「事件写入需幂等」）。
--    高频浏览不逐条进活动流，只生成里程碑 —— 由 record_view_activity 控制。
-- 2. 聚合可重复运行同一日期并得到同一结果（module 09 §5、§9 第一条）。
--    因此用 upsert + 绝对值覆盖，而不是 += 累加。
-- 3. 只使用标准 SQL 对象，不引用 auth.* / service_role。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 幂等键：同一天同一类型同一目标只记一条活动事件。
-- 浏览里程碑用日期桶，避免每个访客每次浏览都刷屏。
-- -----------------------------------------------------------------------------
alter table public.activity_events
  add column if not exists dedupe_key text;

create unique index if not exists activity_events_dedupe_idx
  on public.activity_events (dedupe_key)
  where dedupe_key is not null;

comment on column public.activity_events.dedupe_key is
  '幂等键：非空时唯一，重复写入被 on conflict do nothing 吞掉';

-- -----------------------------------------------------------------------------
-- 写入一条活动事件（幂等）。
-- 返回是否真的插入了新事件。
-- -----------------------------------------------------------------------------
create or replace function public.record_activity(
  p_event_type text,
  p_target_type text default null,
  p_target_id text default null,
  p_title text default null,
  p_metadata jsonb default null,
  p_dedupe_key text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into public.activity_events (event_type, target_type, target_id, title, metadata, dedupe_key)
  values (p_event_type, p_target_type, p_target_id, p_title, p_metadata, p_dedupe_key)
  on conflict (dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- 浏览里程碑：某目标累计浏览达到 10/50/100/500/1000 时各记一次。
-- 高频浏览本身不进活动流（module 09 §4）。
-- -----------------------------------------------------------------------------
create or replace function public.record_view_milestone(
  p_target_type text,
  p_target_id text,
  p_title text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_milestone integer;
  v_hit integer;
begin
  select count(*) into v_total
    from public.page_views
   where target_type = p_target_type and target_id = p_target_id;

  foreach v_milestone in array array[10, 50, 100, 500, 1000] loop
    if v_total >= v_milestone then
      v_hit := v_milestone;
    end if;
  end loop;

  if v_hit is null then
    return false;
  end if;

  -- dedupe_key 含目标与里程碑值：同一目标每个里程碑只记一次，且幂等。
  return public.record_activity(
    'view_milestone_reached',
    p_target_type,
    p_target_id,
    p_title,
    jsonb_build_object('milestone', v_hit, 'total', v_total),
    format('milestone:%s:%s:%s', p_target_type, p_target_id, v_hit)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 每日聚合（module 09 §5）。
--
-- 幂等性来自两点：
--   * 用绝对值 upsert（set x = excluded.x），重复跑同一天结果一致；
--   * 统计窗口固定为「该日 00:00 到次日 00:00」的本地日期桶。
--
-- p_date 为 null 时聚合「昨天」，避免当天数据还在增长导致数字反复变化。
-- -----------------------------------------------------------------------------
create or replace function public.aggregate_daily_stats(p_date date default null)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, (current_date - 1));
  v_start timestamptz := v_date::timestamp;
  v_end timestamptz := (v_date + 1)::timestamp;
begin
  insert into public.site_daily_stats as s (
    date, views_count, likes_count, comments_count, posts_count, timeline_count
  )
  select
    v_date,
    (select count(*) from public.page_views
      where created_at >= v_start and created_at < v_end),
    (select count(*) from public.likes
      where created_at >= v_start and created_at < v_end),
    (select count(*) from public.comments
      where status = 'approved' and created_at >= v_start and created_at < v_end),
    -- D-07：posts_count / timeline_count 是「当日新增发布数」，不是累计
    (select count(*) from public.posts
      where status = 'published' and published_at >= v_start and published_at < v_end),
    (select count(*) from public.timeline_items
      where status = 'published' and published_at >= v_start and published_at < v_end)
  on conflict (date) do update set
    views_count    = excluded.views_count,
    likes_count    = excluded.likes_count,
    comments_count = excluded.comments_count,
    posts_count    = excluded.posts_count,
    timeline_count = excluded.timeline_count;

  return v_date;
end;
$$;

-- -----------------------------------------------------------------------------
-- 回填最近 N 天（迟到事件通过重算纳入，module 09 §5）。
-- -----------------------------------------------------------------------------
create or replace function public.backfill_daily_stats(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_offset integer;
begin
  for v_offset in 0..(v_days - 1) loop
    perform public.aggregate_daily_stats(current_date - v_offset);
  end loop;
  return v_days;
end;
$$;

-- -----------------------------------------------------------------------------
-- 公开活跃列表：只返回公开事件类型且不含访客标识（module 09 §4）。
-- -----------------------------------------------------------------------------
create or replace function public.list_public_activity(p_limit integer default 10)
returns table (
  event_type text,
  target_type text,
  target_id text,
  title text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.event_type, e.target_type, e.target_id, e.title, e.created_at
    from public.activity_events e
   where e.event_type in (
     'post_created', 'post_updated', 'post_published',
     'timeline_created', 'timeline_updated', 'timeline_published',
     'comment_approved', 'view_milestone_reached'
   )
   order by e.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;
