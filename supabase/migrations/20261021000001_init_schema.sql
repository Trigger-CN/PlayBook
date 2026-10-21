-- =============================================================================
-- Phase 5 / 初始 schema
-- 依据：TECHNICAL_ARCHITECTURE.md 8.1–8.7、docs/architecture/DECISIONS.md D-04/D-05/D-06
-- 本迁移可重复执行（全部使用 if not exists / or replace）。
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 共用：updated_at 自动维护
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8.1 posts
-- 文件型 MVP 只写元数据；body 供数据库正文模式使用（D-05）。
-- -----------------------------------------------------------------------------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  summary       text,
  cover_url     text,
  cover_alt     text,
  tags          text[] not null default '{}',
  category      text,
  featured      boolean not null default false,
  reading_time  integer,
  body          text,
  source        text not null default 'file',
  status        text not null default 'published',
  version       integer not null default 1,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  constraint posts_source_check check (source in ('file', 'db')),
  constraint posts_status_check check (status in ('draft', 'published', 'archived')),
  constraint posts_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint posts_cover_alt_check check (cover_url is null or cover_alt is not null),
  constraint posts_reading_time_check check (reading_time is null or reading_time > 0)
);

comment on column public.posts.source is 'file=正文在 MDX 文件；db=正文在 body 字段';
comment on column public.posts.version is '后台编辑乐观锁版本号';

create index if not exists posts_published_idx
  on public.posts (published_at desc nulls last)
  where status = 'published';
create index if not exists posts_tags_idx on public.posts using gin (tags);
create index if not exists posts_category_idx on public.posts (category)
  where category is not null;

-- -----------------------------------------------------------------------------
-- 8.2 timeline_items
-- 与架构 8.2 的差异（决策 D-06 优先）：id 由 uuid 改为 text slug。
-- 原因：D-06 要求 target_id 是「公开路由上可寻址的字符串」，时间轴节点用
-- timeline_items.id 作为互动目标键；slug 同时是 /timeline/[id] 的路由参数。
-- -----------------------------------------------------------------------------
create table if not exists public.timeline_items (
  id            text primary key,
  title         text,
  content       text not null,
  type          text not null default 'note',
  status        text not null default 'draft',
  image_url     text,
  image_alt     text,
  external_url  text,
  occurred_at   timestamptz not null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  constraint timeline_items_id_check check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(id) <= 120),
  constraint timeline_items_type_check check (type in ('note', 'milestone', 'project', 'release', 'travel', 'reading')),
  constraint timeline_items_status_check check (status in ('draft', 'published', 'archived')),
  constraint timeline_items_content_check check (char_length(content) between 1 and 5000),
  constraint timeline_items_published_at_check check (status <> 'published' or published_at is not null)
);

comment on column public.timeline_items.id is '公开 slug，同时是互动 target_id（D-06）';

create index if not exists timeline_items_occurred_idx
  on public.timeline_items (occurred_at desc, id desc)
  where status = 'published';
create index if not exists timeline_items_type_idx
  on public.timeline_items (type)
  where status = 'published';

-- -----------------------------------------------------------------------------
-- 8.3 comments
-- target_id 不设外键（D-06）：目标存在性由服务端写入前校验。
-- -----------------------------------------------------------------------------
create table if not exists public.comments (
  id                 uuid primary key default gen_random_uuid(),
  target_type        text not null,
  target_id          text not null,
  parent_id          uuid references public.comments (id) on delete cascade,
  author_name        text not null,
  author_email_hash  text,
  author_avatar_url  text,
  content            text not null,
  status             text not null default 'pending',
  ip_hash            text,
  user_agent_hash    text,
  moderated_at       timestamptz,
  moderated_by       uuid,
  moderation_reason  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  constraint comments_target_type_check check (target_type in ('post', 'timeline_item')),
  constraint comments_target_id_check check (char_length(target_id) between 1 and 200),
  constraint comments_status_check check (status in ('pending', 'approved', 'rejected', 'deleted')),
  constraint comments_author_name_check check (char_length(author_name) between 1 and 40),
  constraint comments_content_check check (char_length(content) between 1 and 500),
  constraint comments_no_self_parent_check check (parent_id is null or parent_id <> id)
);

comment on column public.comments.author_email_hash is '只存哈希，不存明文邮箱';
comment on column public.comments.ip_hash is '只存哈希，不存明文 IP';

-- 公开列表查询：只取 approved，按时间正序分页
create index if not exists comments_public_idx
  on public.comments (target_type, target_id, created_at)
  where status = 'approved';
-- 后台审核队列
create index if not exists comments_moderation_idx
  on public.comments (status, created_at desc);

-- -----------------------------------------------------------------------------
-- 8.4 likes
-- D-04：visitor_id 必须 not null，否则唯一约束对匿名点赞失效。
-- -----------------------------------------------------------------------------
create table if not exists public.likes (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id   text not null,
  visitor_id  text not null,
  user_id     uuid,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  constraint likes_target_type_check check (target_type in ('post', 'timeline_item')),
  constraint likes_target_id_check check (char_length(target_id) between 1 and 200),
  constraint likes_visitor_id_check check (char_length(visitor_id) between 8 and 128),
  constraint likes_unique_visitor unique (target_type, target_id, visitor_id)
);

create index if not exists likes_target_idx on public.likes (target_type, target_id);
create index if not exists likes_visitor_idx on public.likes (visitor_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 8.5 page_views
-- 索引依据 docs/design/modules/08-page-views.md §5。
-- -----------------------------------------------------------------------------
create table if not exists public.page_views (
  id               uuid primary key default gen_random_uuid(),
  path             text not null,
  target_type      text,
  target_id        text,
  visitor_id       text,
  ip_hash          text,
  user_agent_hash  text,
  referrer         text,
  created_at       timestamptz not null default now(),
  constraint page_views_path_check check (path like '/%' and char_length(path) <= 300),
  constraint page_views_target_type_check check (target_type is null or target_type in ('post', 'timeline_item')),
  constraint page_views_target_pair_check check ((target_type is null) = (target_id is null))
);

create index if not exists page_views_target_idx
  on public.page_views (target_type, target_id, created_at desc);
create index if not exists page_views_visitor_idx
  on public.page_views (visitor_id, target_type, target_id, created_at desc);
create index if not exists page_views_created_idx on public.page_views (created_at desc);

-- -----------------------------------------------------------------------------
-- 8.6 activity_events
-- event_type 枚举与 lib/activity/events.ts 的 ACTIVITY_EVENT_TYPES 一一对应（D-03）。
-- -----------------------------------------------------------------------------
create table if not exists public.activity_events (
  id          uuid primary key default gen_random_uuid(),
  event_type  text not null,
  target_type text,
  target_id   text,
  title       text,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  constraint activity_events_type_check check (event_type in (
    'post_created', 'post_updated', 'post_published', 'post_archived',
    'timeline_created', 'timeline_updated', 'timeline_published', 'timeline_archived',
    'comment_created', 'comment_approved', 'comment_rejected',
    'like_created', 'view_milestone_reached'
  )),
  constraint activity_events_target_type_check check (target_type is null or target_type in ('post', 'timeline_item'))
);

create index if not exists activity_events_recent_idx on public.activity_events (created_at desc);
create index if not exists activity_events_type_idx on public.activity_events (event_type, created_at desc);

-- -----------------------------------------------------------------------------
-- 8.7 site_daily_stats
-- D-07：posts_count / timeline_count 是「当日新增发布数」，不是累计总数。
-- -----------------------------------------------------------------------------
create table if not exists public.site_daily_stats (
  date            date primary key,
  views_count     integer not null default 0,
  likes_count     integer not null default 0,
  comments_count  integer not null default 0,
  posts_count     integer not null default 0,
  timeline_count  integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  constraint site_daily_stats_non_negative check (
    views_count >= 0 and likes_count >= 0 and comments_count >= 0
    and posts_count >= 0 and timeline_count >= 0
  )
);

comment on column public.site_daily_stats.posts_count is '当日新增发布数（增量），非累计总数（D-07）';
comment on column public.site_daily_stats.timeline_count is '当日新增发布数（增量），非累计总数（D-07）';

-- -----------------------------------------------------------------------------
-- updated_at 触发器
-- -----------------------------------------------------------------------------
drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists timeline_items_set_updated_at on public.timeline_items;
create trigger timeline_items_set_updated_at
  before update on public.timeline_items
  for each row execute function public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

drop trigger if exists site_daily_stats_set_updated_at on public.site_daily_stats;
create trigger site_daily_stats_set_updated_at
  before update on public.site_daily_stats
  for each row execute function public.set_updated_at();
