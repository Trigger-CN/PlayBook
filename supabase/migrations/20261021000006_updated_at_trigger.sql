-- =============================================================================
-- 修正 updated_at 触发器：允许调用方保留显式编辑日期 ——【可移植：自建库与 Supabase 通用】
--
-- 背景（实测发现的真实缺陷）：
--   posts_set_updated_at 触发器在每次 UPDATE 时无条件执行 new.updated_at = now()。
--   但 posts.updated_at 在产品语义上是「作者最后一次编辑这篇内容的日期」，
--   会显示在文章页的「更新于 …」上（设计 03）。
--
--   实测后果：用 scripts/db-import-content.mjs 从 MDX 导入正文时，
--   frontmatter 的 updatedAt = 2026-07-18 被触发器改写成了导入时刻 2026-10-21。
--   也就是说：每跑一次导入，所有文章的「更新于」都会变成当天，
--   这个日期不再表示编辑行为，而表示部署行为 —— 完全失去了信息量。
--
-- 为什么不用「比较 old/new 是否变化」来判断：
--   导入时若 frontmatter 的 updatedAt 与库中旧值恰好相同（重跑导入的常见情况），
--   old.updated_at = new.updated_at，触发器无法区分「没写」与「写了同一个值」，
--   仍会覆盖。所以必须用显式信号。
--
-- 修法：用事务级 GUC 作为显式信号。
--   * 调用方在事务里执行 set local app.preserve_updated_at = 'on'
--     → 触发器尊重传入的 updated_at（导入脚本、后台编辑用）。
--   * 未设置该标志时 → 保持原有行为，自动填 now()，符合「改内容就自动记时间」的直觉。
--
-- 用 set local 而非 set：标志随事务结束自动失效，不会污染连接池里的后续请求。
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- current_setting(..., true) 在参数不存在时返回 null 而不是报错，
  -- 因此未设置标志的环境（如 Supabase 后台手改数据）行为不变。
  if coalesce(current_setting('app.preserve_updated_at', true), 'off') = 'on' then
    return new;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  '默认自动填 now()；事务内 set local app.preserve_updated_at = ''on'' 时保留调用方传入的 updated_at';
