-- 在线编辑器启用后，posts.source 需要区分第三种来源。
--
-- ## 为什么必须区分
--
-- db:import 是「MDX 文件 → 数据库」的同步动作，按 slug upsert。
-- 如果后台在线编辑过的文章仍然被标记成 'db'，下一次 db:import 会把它
-- 按文件内容静默覆盖 —— 作者在网页上写的字就没了，而且没有任何提示。
-- 这不是理论风险：db-import-content.mjs 的 update 分支无条件写
-- `source = 'db'` 并覆盖 body，它无从判断库里的正文是谁写的。
--
-- ## 三个值的语义
--
--   file  —— 从未导入（当前流程不会产生，保留给「只在库里建骨架」的场景）
--   db    —— 由 db:import 从 MDX 同步而来，文件是权威来源
--   admin —— 在后台在线编辑过，数据库是权威来源，db:import 必须跳过
--
-- 判定方向只有一条：谁最后写入了正文，谁就是权威来源。
-- 这样「改了文件但页面没变」与「网页上写的被导入冲掉」两种静默不一致
-- 都不会发生 —— 前者由 db:import 显式报告跳过，后者由来源标记挡住。

alter table public.posts
  drop constraint if exists posts_source_check;

alter table public.posts
  add constraint posts_source_check check (source in ('file', 'db', 'admin'));

comment on column public.posts.source is
  '正文权威来源：file=未导入，db=由 db:import 从 MDX 同步，admin=后台在线编辑过（db:import 跳过）';
