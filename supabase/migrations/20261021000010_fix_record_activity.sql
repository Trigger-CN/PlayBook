-- =============================================================================
-- 修正 record_activity 的 on conflict 目标 ——【可移植：自建库与 Supabase 通用】
--
-- 背景（实测发现的真实缺陷）：
--   000007 里 activity_events 的唯一索引是**部分索引**：
--     create unique index ... on activity_events (dedupe_key) where dedupe_key is not null;
--   而 record_activity 里写的是 `on conflict (dedupe_key) do nothing`。
--
--   PostgreSQL 要求 on conflict 的推断目标必须能匹配某个唯一索引的**完整定义**，
--   包括它的谓词。对部分索引必须写成 `on conflict (dedupe_key) where dedupe_key is not null`。
--   实测报错：
--     ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
--   后果：record_activity 完全不可用 —— 点赞活动、评论审批事件、浏览里程碑
--   全部写入失败（而这些调用都被 .catch() 静默兜住，所以页面上看不出异常，
--   只是活动流永远是空的）。这类「静默失效」比报错更危险。
--
-- 修法：把推断目标补上索引谓词。
--   仍然保留部分索引（dedupe_key is null 的事件允许重复，这是刻意的：
--   无去重键的事件本来就该每条都记）。
-- =============================================================================

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
  -- 谓词必须与 activity_events_dedupe_idx 的定义完全一致，否则 PostgreSQL 无法推断。
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

revoke all on function public.record_activity(text, text, text, text, jsonb, text) from public;
