# 基线决策记录

本文档固化正式开发前确认的 10 项基线决策，消除需求、技术架构与设计文档之间的冲突。所有实现必须以本文为准；若需变更，先改本文，再改代码。

状态：**已定案**（2026-10，用户确认"10 项冲突可按建议定案"）。

---

## D-01 主题 token 命名

**决策**：采用 `demo/theme-system-demo.html` 与 `docs/design/modules/01-visual-theme.md` 的语义命名，作为唯一来源。

```text
canvas / ink / muted / surface / soft / line / grid / shell / focus / shadow
coral / coral-base     pink / pink-base      cream / cream-base
mint / mint-base       sky / sky-base        lilac / lilac-base
```

**理由**：这套命名已由 demo 在日夜双主题下验证过，且是设计模块文档的表述。

**影响**：`TECHNICAL_ARCHITECTURE.md` 12.2 中的 `--color-bg` / `--color-primary-base` 等命名**不再使用**，该段落视为历史方案。实现见 `app/globals.css`。

---

## D-02 立体按钮几何

**决策**：以 12.3 规范与 demo 实测值为准。

| 尺寸 | 按钮面高度 | 底座厚度 | 圆角 | 水平内边距 |
| --- | --- | --- | --- | --- |
| small | 42px | 7px | 13px | 14px |
| default | 52px | 8px | 16px | 20px |
| large | 64px | 11px | 20px | 26px |

hover 额外上抬 3px，active 仅保留 2px 底座，动效 110ms，只动画 transform 与 filter。

**理由**：12.2 段落中的 `--button-depth: 18px`、`--radius-button: 18px` 与 12.3 及 demo 直接矛盾，18px 底座在小按钮上会导致视觉过厚。

**影响**：唯一实现为 `app/globals.css` 的 `.toy-button` 与 `components/ui/toy-button.tsx`；业务代码禁止复制按钮状态 CSS。

---

## D-03 活动事件枚举

**决策**：固定为单一来源 `lib/activity/events.ts` 的 `ACTIVITY_EVENT_TYPES`。

```text
post_created / post_updated / post_published / post_archived
timeline_created / timeline_updated / timeline_published / timeline_archived
comment_created / comment_approved / comment_rejected
like_created / view_milestone_reached
```

**理由**：技术架构用 `post_created`、路线图 Phase 7 用 `article_created`、模块 09 用 `post_created` + `comment_approved`，三套写法会导致数据库 check 约束与代码不一致。

**影响**：`article_*` 与 `view_recorded` 两个写法作废；数据库迁移必须引用同一枚举。

---

## D-04 点赞唯一约束

**决策**：`visitor_id` 必须 `NOT NULL`，并保留唯一约束 `(target_type, target_id, visitor_id)`。

**理由**：PostgreSQL 中 `NULL` 互不相等，原设计里可空的 `visitor_id` 会让匿名用户对同一目标无限重复点赞，唯一约束形同虚设。

**影响**：首次迁移必须写 `visitor_id text not null`；访客标识由服务端下发 httpOnly cookie 生成，不接受客户端提交。

---

## D-05 表结构补齐

**决策**：首个迁移必须包含设计文档要求但 DDL 缺失的字段。

`posts` 增补：`tags text[]`、`category text`、`featured boolean`、`cover_alt text`、`reading_time integer`、`body text`（数据库正文模式用）、`source text`（`file` / `db`）、`version integer`。

`timeline_items` 增补：`status text`（`draft` / `published` / `archived`）、`external_url text`、`published_at timestamptz`。

**理由**：缺这些字段时，草稿隔离、后台编辑（文档 15）与封面 alt 校验都无法实现。

---

## D-06 互动目标键

**决策**：`target_id` 统一使用"公开路由上可寻址的字符串"——文章用 **slug**，时间轴节点用 **`timeline_items.id`**。

**理由**：文件型 MVP 阶段文章没有数据库行，用 slug 可让文件型与未来的数据库型内容共用同一套互动表，无需数据迁移。slug 已由 frontmatter 保证唯一。

**影响**：`likes` / `comments` 的 `target_id` 不设外键；目标存在性由服务端在写入前校验。

---

## D-07 统计字段语义

**决策**：`site_daily_stats` 的 `posts_count` / `timeline_count` 表示**当日新增发布数**（增量），不是累计总数。

累计总量（总文章数、总节点数）由内容表或单独查询获得，不放入每日聚合表。

**理由**：模块 09 要求展示"已发布文章数"，而每日表按 date 主键天然是增量语义；混用会让页面数字随时间范围变化而失真。

---

## D-08 主题初始化

**决策**：cookie 为持久化真源；根布局**不读取** cookie。

实现方式：
1. 根布局静态输出 `data-theme="light"`，使整站保持可静态生成。
2. `<head>` 内联极小脚本在首次绘制前读 cookie 并纠正 `data-theme`，避免闪烁。
3. `ThemeToggle` 切换时写 cookie 并即时改 `document.documentElement.dataset.theme`。

**理由（重要）**：最初实现为"服务端 `cookies()` 读取后输出"，构建验证发现这会让**全部 11 条路由退化为 Dynamic**，直接违背 `REQ-NFR-001`（文章页应尽量静态生成或缓存）。改为内联脚本后，`/`、`/about`、`/stats`、`/timeline` 恢复 Static，`/posts/[slug]` 为 SSG。

**代价**：接受一个约 200 字节的同步内联脚本；它不含外部依赖，也不写入任何用户数据。

---

## D-09 目录与路由约定

**决策**：在技术架构 §7 的基础上补齐以下约定文件。

```text
app/layout.tsx           根布局（静态、含主题内联脚本）
app/(site)/              公开站点路由组 + 外壳
app/admin/               后台（Phase 8）
app/api/                 Route Handlers（Phase 6）
app/sitemap.ts           sitemap
app/robots.ts            robots
app/not-found.tsx        全站 404
app/error.tsx            路由错误边界
middleware.ts            Phase 8 加入（会话刷新）
lib/content/             内容管线
lib/interactions/        互动契约
lib/supabase/            数据访问
lib/cache/               缓存 tag
lib/activity/            活动事件
config/site.ts           站点与导航配置
docs/architecture/       架构决策与框架说明
```

**理由**：设计文档 08（后台守卫）与模块 11（SEO）依赖这些文件，原目录结构未列出。

---

## D-10 仓库初始化

**决策**：已完成 `git init`，并提供 `.gitignore`（含 `/.me/`、`/.omo/`、`/.me.zip` 等工具目录）与 `.env.example`。

**理由**：`.me/` 与 `.omo/` 是 Agent 运行时产物，不属于项目内容，必须忽略，否则会污染提交历史。

---

## 附：实现中额外修正的两处技术问题

这两项不在原 10 项清单内，是构建验证时发现的真实缺陷，记录以备追溯。

1. **MDX 插件类型**：`lib/content/mdx.ts` 若用 `as const`，插件数组变为 `readonly`，与 `SerializeOptions` / `Pluggable[]` 不兼容。改为显式 `Pluggable[]` 标注。
2. **server-only 泄漏**：`lib/theme.ts` 含 `import 'server-only'` 与 `next/headers`，被客户端组件 `theme-toggle.tsx` 引入会导致构建失败。拆分为 `lib/theme-shared.ts`（纯常量，双端可用）；D-08 改造后 `lib/theme.ts` 已删除。
