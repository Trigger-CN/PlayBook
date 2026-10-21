-- =============================================================================
-- Phase 5 / 开发种子数据
-- 与 lib/timeline/seed.ts 的 16 条记录保持一致，便于本地切换数据源后对比。
-- 使用 on conflict do nothing，可重复执行。
-- =============================================================================

insert into public.timeline_items
  (id, title, content, type, status, image_url, image_alt, external_url, occurred_at, published_at)
values
  ('site-v0-1-launch', '站点 v0.1 上线',
   '脚手架、主题 token 与文章管线终于跑通，第一次把自己的站点推到线上。',
   'release', 'published', '/images/timeline/site-launch.svg', '浏览器窗口里排着标题与按钮的插画',
   'https://nextjs.org/blog', '2026-07-17', '2026-07-17'),
  ('desk-reset-2026', '重新整理工作台',
   '把显示器抬高了一点，键盘换成更矮的那把，桌面只留一杯水和一本正在读的书。整理桌面其实是在整理注意力。',
   'note', 'published', '/images/timeline/desk-setup.svg', '窗边工作台与显示器、绿植的插画',
   null, '2026-07-11', '2026-07-11'),
  ('theme-button-spec', '定下按钮的立体规范',
   '把按钮的厚度、圆角和按压位移写成固定数值，hover 抬高 3px，按下只留 2px 底座。',
   'project', 'published', null, null, null, '2026-06-28', '2026-06-28'),
  ('designing-design-reading', '读完《设计中的设计》',
   '原研哉讲的不只是设计，更像是在讲怎么重新看日常。',
   'reading', 'published', null, null, null, '2026-06-05', '2026-06-05'),
  ('note-100', '第 100 篇笔记',
   '从第一篇到现在，断断续续写了两年多。大部分笔记都很短，但它们连起来就是我这两年在想什么。',
   'milestone', 'published', null, null, null, '2026-05-19', '2026-05-19'),
  ('hangzhou-rain', '杭州，雨后的西湖',
   '雨停了才出门，湖面还有一层薄雾。走了整整一圈，中途在一棵柳树下坐了很久，什么也没做。',
   'travel', 'published', '/images/timeline/hangzhou-lake.svg', '雨后湖面与柳树的插画',
   null, '2026-04-02', '2026-04-02'),
  ('font-switch', '把字体换回系统栈',
   '为了少加载一份字库，正文换回系统字体。读了两天之后发现中文标点终于对上了。',
   'note', 'published', null, null, null, '2026-03-14', '2026-03-14'),
  ('palette-v1', '数字玩具盒配色第一版',
   '第一版配色偏灰，被自己否掉了。保留在这里当作一次记录。',
   'project', 'archived', null, null, null, '2026-02-21', '2026-02-21'),
  ('plans-2026', '今年想做的事',
   '还没想清楚，先列几条放在草稿里：把站点写完、把相机用熟、少熬夜。',
   'note', 'draft', null, null, null, '2026-01-09', null),
  ('first-shipped-product', '第一次把想法做成线上产品',
   '从画草图到上线用了三个月，用户不多，但真的有人在用。',
   'milestone', 'published', null, null, null, '2025-12-24', '2025-12-24'),
  ('kyoto-seven-days', '京都，一个人走了七天',
   '没有排行程，每天出门随便走。七天里说得最少，想得最多。',
   'travel', 'published', '/images/timeline/kyoto-torii.svg', '山间红色鸟居的插画',
   null, '2025-10-08', '2025-10-08'),
  ('first-oss-component', '发布第一个开源组件',
   '一个很小的按钮组件，被人提了第一个 issue。第一次体会到维护别人依赖的东西是什么感觉。',
   'release', 'published', null, null, 'https://github.com', '2025-08-30', '2025-08-30'),
  ('code-complete-reread', '重读《代码大全》',
   '学生时代读它是为了面试，现在读它是为了少写一点自己将来要维护的代码。',
   'reading', 'published', null, null, null, '2025-06-12', '2025-06-12'),
  ('start-long-writing', '决定开始长期写作',
   '不是为了输出观点，只是想让脑子里的东西有个地方落下来。',
   'note', 'published', null, null, null, '2025-03-02', '2025-03-02'),
  ('first-personal-site', '用 Next.js 搭的第一个个人站',
   '照着教程一步步搭起来，样式全靠复制粘贴。现在回头看很粗糙，但它是我所有项目的起点。',
   'project', 'published', null, null, null, '2024-11-11', '2024-11-11'),
  ('moved-house', '搬进新租的房子',
   '窗朝东，早上会被光叫醒。书桌放在窗边之后，早上写东西变得容易了很多。',
   'note', 'published', null, null, null, '2024-09-01', '2024-09-01')
on conflict (id) do nothing;

-- 与 content/posts/playful-recorder.mdx 对应的文章元数据
insert into public.posts
  (slug, title, summary, tags, category, featured, reading_time, source, status, published_at, updated_at)
values
  ('playful-recorder', '把个人网站做成一台可玩的记录机',
   '从按钮触感开始，为长期内容建立一组会说话的视觉规则：深度来自按钮面与底座的组合，反馈来自明确但不聒噪的位移。',
   array['设计系统', '随笔'], '设计系统', true, 1, 'file', 'published', '2026-07-17', '2026-07-18')
on conflict (slug) do nothing;
