-- =============================================================================
-- 把「纯日期」语义的列从 timestamptz 改为 date —— 【可移植：自建库与 Supabase 通用】
--
-- 背景（实测发现的真实缺陷）：
--   timeline_items.occurred_at 原为 timestamptz，但产品语义是「事件发生在哪一天」，
--   界面只显示 YYYY-MM-DD。在 Asia/Shanghai (+08:00) 会话下写入 '2026-07-17'，
--   存下的瞬间是 2026-07-16T16:00:00Z；应用用 toISOString().slice(0,10) 读回
--   得到 2026-07-16 —— 日期少一天。
--
--   这不是显示层的小问题：时间轴的排序、年/月分组、SEO 的 dateTime 都会偏移，
--   而且偏移量取决于会话时区，属于「同一份数据在不同部署上不一致」。
--
-- 修法：把只表示日期的列改成 date 类型，让时区概念彻底消失。
--   * timeline_items.occurred_at  -> date（本次）
--   * posts.published_at / timeline_items.published_at 保持 timestamptz：
--     它们是真实瞬间，`published_at <= now()` 的发布闸门依赖时刻而非日期。
--
-- 转换正确性：
--   occurred_at 里的值是由 'YYYY-MM-DD' 字面量写入的，落库瞬间是「该日 00:00 本地」。
--   要取回原本的日期，必须按**写入时的时区**取日期部分，不能固定用 UTC
--   （固定 UTC 会让 +08:00 的数据整体前移一天）。
--   因此这里按库当前默认时区转换，并打印结果供人工核对。
--
-- 读取侧配套：应用必须用 to_char(col, 'YYYY-MM-DD') 取值，
-- 而不是让驱动返回 Date 再在 JS 里切片（见 lib/data/adapters/postgres.ts）。
--
-- 幂等：用 DO 块判断当前类型，已是 date 时跳过。
-- =============================================================================

do $$
declare
  v_before integer;
  v_after integer;
  v_sample_before text;
  v_sample_after text;
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'timeline_items'
       and column_name = 'occurred_at'
       and data_type <> 'date'
  ) then
    raise notice 'timeline_items.occurred_at 已是 date，跳过转换';
    return;
  end if;

  select count(*) into v_before from public.timeline_items;

  -- 转换前留一个样本，便于核对是否发生日期漂移。
  select to_char(occurred_at, 'YYYY-MM-DD')
    into v_sample_before
    from public.timeline_items
   order by occurred_at desc
   limit 1;

  -- 按库默认时区取日期部分（即写入时的时区）。
  alter table public.timeline_items
    alter column occurred_at type date using occurred_at::date;

  select count(*) into v_after from public.timeline_items;

  select to_char(occurred_at, 'YYYY-MM-DD')
    into v_sample_after
    from public.timeline_items
   order by occurred_at desc
   limit 1;

  if v_before <> v_after then
    raise exception '行数在转换中变化（% -> %），已中止', v_before, v_after;
  end if;

  raise notice 'timeline_items.occurred_at 已转换为 date：% 行，样本 % -> %',
    v_after, v_sample_before, v_sample_after;
end
$$;
