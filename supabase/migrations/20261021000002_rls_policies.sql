-- =============================================================================
-- Phase 5 / RLS 策略
-- 依据：TECHNICAL_ARCHITECTURE.md 9.2、docs/design/modules/06-comments.md §9、
--       07-likes.md §5、08-page-views.md §6、09-stats-activity.md §2
--
-- 设计原则（写入 DECISIONS.md D-11）：
-- 1. 公开内容表允许 anon 只读，且只读已发布状态。
-- 2. comments / likes / page_views / activity_events 一律不向 anon 开放写权限。
--    原因：anon key 是公开的，若允许直接 insert，任何人可绕过 Turnstile、限流与
--    长度校验直写数据库。写入统一走服务端 Route Handler（service role）。
-- 3. likes 不向 anon 开放 select：行内 visitor_id 属于访客标识，公开会泄漏。
--    公开计数由服务端聚合后返回。
-- 4. 管理员通过 Supabase Auth 的 authenticated 角色 + ADMIN_EMAIL 白名单判定。
-- =============================================================================

alter table public.posts            enable row level security;
alter table public.timeline_items   enable row level security;
alter table public.comments         enable row level security;
alter table public.likes            enable row level security;
alter table public.page_views       enable row level security;
alter table public.activity_events  enable row level security;
alter table public.site_daily_stats enable row level security;

-- -----------------------------------------------------------------------------
-- 管理员判定：authenticated 且邮箱在 ADMIN_EMAIL 白名单内。
-- 白名单放在 app 元数据，避免硬编码在 SQL 里。
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = current_setting('app.admin_email', true),
    false
  ) and coalesce((select auth.role()) = 'authenticated', false);
$$;

comment on function public.is_admin() is '管理员判定：需在连接上设置 app.admin_email，且会话为 authenticated';

-- -----------------------------------------------------------------------------
-- posts：公开只读已发布；管理员全权
-- -----------------------------------------------------------------------------
drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
  for select to anon, authenticated
  using (status = 'published' and (published_at is null or published_at <= now()));

drop policy if exists posts_admin_all on public.posts;
create policy posts_admin_all on public.posts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- timeline_items：公开只读已发布；管理员全权
-- -----------------------------------------------------------------------------
drop policy if exists timeline_items_public_read on public.timeline_items;
create policy timeline_items_public_read on public.timeline_items
  for select to anon, authenticated
  using (status = 'published' and (published_at is null or published_at <= now()));

drop policy if exists timeline_items_admin_all on public.timeline_items;
create policy timeline_items_admin_all on public.timeline_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- comments：公开只读 approved 且只暴露安全字段由应用层裁剪；
-- 不开放 anon insert（见文件头原则 2）。管理员可读全部并审核。
-- -----------------------------------------------------------------------------
drop policy if exists comments_public_read on public.comments;
create policy comments_public_read on public.comments
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists comments_admin_all on public.comments;
create policy comments_admin_all on public.comments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- likes：不对 anon 开放任何策略 → 默认拒绝。
-- 计数与访客状态由服务端 handler 用 service role 读取后返回。
-- -----------------------------------------------------------------------------
drop policy if exists likes_admin_all on public.likes;
create policy likes_admin_all on public.likes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- page_views：同样默认拒绝；仅管理员可读聚合明细。
-- -----------------------------------------------------------------------------
drop policy if exists page_views_admin_read on public.page_views;
create policy page_views_admin_read on public.page_views
  for select to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- activity_events：公开可读，但只限公开事件类型，且不含访客标识。
-- -----------------------------------------------------------------------------
drop policy if exists activity_events_public_read on public.activity_events;
create policy activity_events_public_read on public.activity_events
  for select to anon, authenticated
  using (event_type in (
    'post_created', 'post_updated', 'post_published',
    'timeline_created', 'timeline_updated', 'timeline_published',
    'comment_approved', 'view_milestone_reached'
  ));

drop policy if exists activity_events_admin_all on public.activity_events;
create policy activity_events_admin_all on public.activity_events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- site_daily_stats：聚合结果公开只读；写入仅管理员/聚合任务。
-- -----------------------------------------------------------------------------
drop policy if exists site_daily_stats_public_read on public.site_daily_stats;
create policy site_daily_stats_public_read on public.site_daily_stats
  for select to anon, authenticated
  using (true);

drop policy if exists site_daily_stats_admin_all on public.site_daily_stats;
create policy site_daily_stats_admin_all on public.site_daily_stats
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
