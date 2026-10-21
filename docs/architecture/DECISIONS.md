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

---

## D-11 互动表写入路径与时间轴主键

**决策一：`timeline_items.id` 使用 text slug，而非架构 8.2 的 uuid。**

理由：D-06 要求 `target_id` 是「公开路由上可寻址的字符串」，时间轴节点用 `timeline_items.id` 作为互动目标键；同时该 id 就是 `/timeline/[id]` 的路由参数。已实现的 14 条预渲染路由、`lib/timeline/types.ts` 与 `seed` 全部使用 slug。若改成 uuid，现有路由与类型都要推倒，且 `target_id` 将不再是人类可读的稳定键。

影响：迁移中 `id text primary key`，并加 `^[a-z0-9]+(?:-[a-z0-9]+)*$` 与长度 ≤120 的 check 约束。

**决策二：`comments` / `likes` / `page_views` / `activity_events` 不向 anon 开放写权限。**

理由：架构 9.2 写「评论默认允许插入，但状态为 pending」，但 anon key 是随浏览器分发的公开凭据。若允许 anon 直接 insert，任何人都可绕过 Turnstile、频率限制与长度校验直写数据库，pending 状态只影响展示，不影响写入。module 06 §9 也已写明「更推荐服务端 handler 写入以集中防刷」。

影响：写入统一走服务端 Route Handler，使用 `lib/supabase/admin.ts` 的 service role 客户端，并强制 `status = 'pending'`。`likes` 另外不向 anon 开放 select，因为行内 `visitor_id` 是访客标识，公开会泄漏；公开计数改由 `get_like_state` / `get_like_counts` 这两个 `security definer` 函数返回聚合值，函数 execute 权限已 `revoke` anon 只 `grant` service_role。

**决策三：公开内容页不读 `cookies()`。**

理由：D-08 已确立根布局不得读 cookie。同理，数据层若用带会话的 `createSupabaseServerClient()` 查询公开内容，会让该路由退化为 Dynamic。因此 `lib/supabase/server.ts` 额外提供 `createSupabaseStaticClient()`，它不读 cookie，以 anon 身份受 RLS 约束，可用于 Static/ISR 页面。

---

## D-12 自建 PostgreSQL 过渡与数据端口层

**决策一：数据访问统一经 `lib/data/ports.ts` 的接口，页面不得直接引用具体数据源。**

`getDataPorts()`（`lib/data/index.ts`）只判断 `process.env.DATABASE_URL` 是否存在且非空白：有则返回 `postgresPorts`，无则返回 `filePorts`。**不做连接探测**，因此 `DATABASE_URL` 配错时错误在首次查询时以明确信息抛出，而不是在模块加载阶段让整个构建失败。

理由：用户要求「先用自建 PostgreSQL + 自己写后端过渡，并做好隔离，后续可能用 Supabase」。接口化的意义是将来接 Supabase 只新增一个适配器、替换 `getDataPorts()` 的一行分支，页面与业务组件零改动。

**决策二：无 `DATABASE_URL` 时必须整站可构建可运行，且互动方法显式抛错而非返回空值。**

`filePorts` 的 `getLikeState` / `getLikeCounts` / `recordView` / `listApprovedComments` 直接抛错，消息指明需要配置数据库。**刻意不返回 0 或空数组**——那会让前端看起来正常但数据永远不增长，掩盖「未配置数据库」这一事实。

理由：本机实测无 PostgreSQL、无 psql、无 Docker。若没有回退路径，整个项目在开发机上无法构建。

**决策三：文章正文仍留在 `content/posts/*.mdx`，数据库只存元数据。**

`postgresPorts.posts.*` 目前仍转发到 `filePostRepository`（`source = 'file'`）。这样保住了文章页的 SSG，把动态需求限制在真正需要的地方。代价是文章元数据暂时不来自数据库；等正文迁库时只改这一处。

**决策四：SQL 只写一份，靠迁移执行器的能力探测分层，而不是维护两份 DDL。**

`supabase/migrations/` 是唯一来源，自建库与 Supabase 共用。`scripts/db-migrate.mjs` 探测目标是否为 Supabase（存在 `auth` schema 或 `supabase_admin` 角色）：

- **Supabase** → 执行全部迁移，含 `20261021000002_rls_policies.sql`。
- **自建库** → 跳过文件名匹配 `/_rls_policies\.sql$/` 的文件。

因此迁移被拆成三类：

| 文件 | 适用范围 | 内容 |
| --- | --- | --- |
| `000001_init_schema.sql` | 通用 | 7 张表、28 条约束、索引、`set_updated_at` 触发器 |
| `000002_rls_policies.sql` | **仅 Supabase** | RLS 策略 + `is_admin()`（用 `auth.jwt()`）+ 公开计数函数的 `grant ... to service_role` |
| `000003_public_counts.sql` | 通用 | 四个 `security definer` 计数/去重函数，无任何角色引用 |
| `000004_lock_down_functions.sql` | 通用 | `revoke all on function ... from public`，撤销 PostgreSQL 对新建函数默认授予 PUBLIC 的 EXECUTE |

**决策五：自建库不建最小权限角色（原计划的 `000004_app_role.sql` 取消）。**

理由：迁移执行器以部署方提供的连接身份运行，而「应用角色叫什么、是否已存在」只能由部署方决定。把 `grant execute ... to <某个写死的角色>` 写进迁移，会让未创建该角色的环境在迁移阶段直接失败。因此 000004 只做与角色无关的收紧（撤销 PUBLIC），其余由部署方按部署文档授予。已用 `acl` 实测确认：四个函数的 ACL 变为 `playbook=X/playbook`，PUBLIC 已无可执行权。

**已实测（真实 PostgreSQL 18.4，非静态审查）**：

- `db:migrate` 首次 exit=0，应用 000001/000003/000004，跳过 000002
- `db:migrate --seed` 写入种子（timeline 16 条，published 14 条）
- `db:health` exit=0，schema 自检通过
- 二次 `db:migrate` 输出「没有待执行的迁移」→ 幂等成立
- `get_like_state` → `{like_count:2, liked:true}`；`get_like_counts` → 聚合正确
- `record_page_view` 首次 `true`、30 分钟内重复 `false`，`page_views` 仅 1 行 → 去重生效
- 重复点赞被 `likes_unique_visitor` 拦截；非法 timeline id 被 `timeline_items_id_check` 拦截；`cover_url` 缺 `cover_alt` 被 `posts_cover_alt_check` 拦截
- 用 `DATABASE_URL` 构建：插入一条仅存在于库的节点后，`/timeline/[id]` 路由表出现该节点、`timeline.html` 与 `index.html` 均含其 slug、详情页已预渲染 → 页面数据确实来自 PostgreSQL
- 无 `DATABASE_URL` 构建：25/25 静态页，路由类型不退化；有 `DATABASE_URL` 时 26/26
- `.next/static` 中 `DATABASE_URL` / 连接串 / 密码命中数 = 0

**未验证范围**：Supabase 侧（`000002` 从未在真实 Supabase 上执行过，因为没有项目凭据）；文章正文迁库（本轮刻意不做）。
