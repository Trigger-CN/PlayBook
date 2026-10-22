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

> **已被 D-13 取代**（2026-07-17）：正文现已迁入 `posts.body`，`source = 'db'`。本节保留以记录过渡期的取舍。

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

---

## D-13 互动层、正文迁库、后台认证与三个真实缺陷

本轮（Phase 6–8）把数据端口层从「只读内容」扩展为「读 + 写 + 统计」，并把文章正文真正迁入数据库。以下决策均已用真实 PostgreSQL 18.4 端到端验证（本机无原生 PostgreSQL，改用 npm 包 `embedded-postgres` 起的临时实例，不进项目依赖）。

**决策一：互动写入只经服务端 Route Handler，`filePorts` 的写方法显式抛错。**

`lib/data/ports.ts` 新增 `InteractionPort`（`getLikeState` / `getLikeCounts` / `addLike` / `removeLike` / `recordView` / `listApprovedComments` / `countApprovedComments` / `createComment`）、`StatsPort`（`getContentTotals` / `getSiteTotals` / `listPopular` / `listRecentActivity`）、`ActivityPort`（`record` / `recordViewMilestone` / `backfillDailyStats`）。

`filePorts` 的互动与活动方法**全部抛错**并提示需配置 `DATABASE_URL`，不返回 0 或空数组。理由与 D-12 决策二一致：假成功会让页面看起来正常而数据永远不增长。唯一例外是 `stats.getSiteTotals()` 的 views/likes/comments 返回真实的 0——文件模式确实没有这些数据，代码注释已注明这不是占位符。

**决策二：`visitor_id` 用 httpOnly cookie，点赞 GET 不创建 cookie。**

访客标识为 `randomUUID().replace(/-/g, '')`（32 字符，符合 `likes_visitor_id_check` 的 8..128），存 `httpOnly` cookie `playbook-visitor`，`sameSite: 'lax'`、一年有效、生产环境 `secure`。服务端仍按 `/^[A-Za-z0-9_-]{8,128}$/` 校验，不信任 cookie 内容。

`GET /api/likes` **只读不写** cookie：列表页与首屏会批量请求，若在这里下发 cookie，会让从未互动的访客也被种上标识。代价是详情页首屏只能渲染权威 `count`，`liked` 由 `like-button` 挂载后补一次 GET 取得（且仅在 `!inFlight.current` 时采纳，避免覆盖刚点的乐观值）。

**决策三：浏览量去重交给数据库函数，不在应用层「先查后写」。**

`record_page_view` 在单条语句内完成 30 分钟窗口去重，避免并发窗口内同一访客被计两次。`views` 接口在无库时返回 **204** 而非 503/500——页面照常阅读，只是计数不增长，返回错误只会制造前端噪音。

**决策四：评论不做乐观插入，`status` 在 SQL 里写死。**

评论默认 `pending`，若前端乐观插入再消失，比「提交后等审核」更差（module 06 §8）。因此提交成功后才清空正文，失败保留输入。`createComment` 的 `status` 由 SQL 常量给出，不接受调用方传入——即使有人伪造请求体也无法自批。

**决策五：文章正文迁入 `posts.body`，但保留 MDX 写作与构建期校验。**

`posts.source = 'db'` 成为正文真源，`postgresPorts.posts.*` 真正查 `public.posts`（列表查询只取元数据列，不拉 `body`，避免列表页为几百 KB 正文付代价）。

作者仍用 `content/posts/*.mdx` 写作（后台在线编辑器未实现），因此需要一条显式的「文件 → 数据库」通道：`npm run db:import`（`scripts/db-import-content.mjs`）。语义为以 slug 为键 upsert，内容未变则跳过（不刷新 `version`），有变化 `version + 1`，frontmatter 非法直接失败并指出文件。**不让页面同时猜两个来源**——那会制造「改了文件但页面没变」的静默不一致。

阅读时间口径（中文按 1、西文词按 1.6 加权，÷350，最少 1 分钟）在 `lib/content/repository.ts`、`lib/data/adapters/postgres.ts`、`scripts/db-import-content.mjs` 三处必须一致，改动时需同步。

**决策六：后台认证用一次性令牌，不自建密码存储。**

设计文档 08/16 要求 Supabase Auth 魔法链接，但当前无 Supabase 项目凭据。过渡实现与魔法链接同构：邮箱 → 一次性令牌链接 → 兑换会话。将来切 Supabase Auth 只需替换 `lib/auth/admin.ts` 与登录页，`requireAdmin()` 的调用方式不变。

- 令牌与会话**只存哈希**（`hashValue('admin-token:' + token)`），不存明文；有效期令牌 15 分钟、会话 7 天。
- 一次性语义交给数据库：`update ... set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning email`，天然防并发双花。
- 哈希比较用 `timingSafeEqual`，避免比较本身成为旁路。
- 白名单来自 `ADMIN_EMAIL`（逗号分隔）。**未配置时后台整体关闭**——忘记配环境变量不应导致任何人都能进后台。
- 无论邮箱是否在白名单都返回同一句文案，防「某邮箱是否为管理员」的探测器。
- `safeAdminRedirect` 必须 `startsWith('/admin')`，拒绝 `//host`、含 `\`、含 `..` 段，非法回退 `/admin`。
- 退出走 POST / Server Action，不用可被预取的 GET 链接。
- 每个 Server Action **独立鉴权**：`app/admin/layout.tsx` 的守卫只保护页面渲染，Action 是独立入口。

**决策七：后台用独立仓储，不复用公开端口。**

`lib/admin/repository.ts` 独立实现。理由：公开端口只返回 `approved` 评论与 `published` 内容；后台需要看到全部状态。若为后台给公开端口加「能看到未审核内容」的能力，会把这个能力泄漏进公开端口的类型里。

并发审核用条件更新 `where id = $1 and status = $4`（`expectedStatus`）：两人同时点「批准」只有第一个成功，第二个收到冲突提示而非静默覆盖。

**决策八：后台移动端导航降级为可换行列表（有意的范围裁剪）。**

设计 08 §2.2 要求抽屉 + 焦点陷阱 + 滚动锁定。本轮降级为可换行的横向列表，代码注释写明理由：「一个能用的简单导航，好过一个没做完的抽屉」。

---

## 附：本轮修复的三个真实缺陷

三者都不是静态审查能发现的，全部由真实数据库实测暴露。

### 缺陷一：`timestamptz` 让时间轴日期少一天

`timeline_items.occurred_at` 语义是「事件发生在哪一天」，界面只显示 `YYYY-MM-DD`，但列类型是 `timestamptz`。写入 `'2026-07-17'` 后读回，`toISOString().slice(0, 10)` 得到 `2026-07-16`（服务器时区 Asia/Shanghai，偏移 +08:00）。影响排序、年/月分组与 SEO `dateTime`，且偏移量随会话时区变化。

**否决的修法**：迁移里 `set_config('timezone', 'UTC', true)` 再 `::date`。这会让 +08:00 写入的数据整体**前移一天**，比原 bug 更糟。

**采用的修法**（两处必须同时改）：
1. `20261021000005_timeline_date.sql`：把列改为 `date`，用 `DO` 块做幂等判断（已是 `date` 则 `return`）、转换前后行数校验（不等则 `raise exception`）、样本对比与 `raise notice`。**按库默认时区取日期部分**，不固定 UTC。
2. `lib/data/adapters/postgres.ts`：`occurred_at` 类型改 `string`，读取用 `to_char(col, 'YYYY-MM-DD')`；`published_at` / `updated_at` 同样处理；`toIsoDate()` 只做防御性 `slice(0, 10)`，不做时区换算。

**硬规则**：纯日期列一律 `date` + `to_char` 读取，绝不在 JS 里对 `Date` 调 `toISOString().slice(0, 10)`。`posts.published_at` 保持 `timestamptz`——它是真实瞬间，发布闸门 `published_at <= now()` 依赖时刻。

### 缺陷二：`updated_at` 触发器把「编辑日期」改成「导入时刻」

`posts.updated_at` 的产品语义是「作者最后一次编辑的日期」，显示在文章页「更新于 …」。但 `posts_set_updated_at` 触发器每次 UPDATE 都无条件 `new.updated_at = now()`，导致每跑一次导入，所有文章的「更新于」都变成部署当天。

**否决的修法**：`if new.updated_at is distinct from old.updated_at then return new; end if;`。重跑导入时 frontmatter 值与库中旧值相同（`old = new`），触发器无法区分「调用方没写这个字段」与「写了同一个值」，仍会覆盖。

**采用的修法**：用事务级 GUC 作显式信号。`20261021000006_updated_at_trigger.sql` 中 `if coalesce(current_setting('app.preserve_updated_at', true), 'off') = 'on' then return new; end if;`。用 `set local` 而非 `set`，标志随事务结束自动失效，不污染连接池里的后续请求；`current_setting(..., true)` 的 `true` 保证参数不存在时返回 null 而不报错。

配套两处：导入脚本在 `begin` 后立即 `set local app.preserve_updated_at = 'on'`；并把 `updated_at` 纳入「内容是否变化」的判定，否则一旦被改坏就再也修不回来（自我修复能力）。

### 缺陷三：`on conflict` 无法匹配部分唯一索引（静默失效）

`activity_events` 的去重索引是**部分**唯一索引 `on (dedupe_key) where dedupe_key is not null`，而 `record_activity` 里写的是 `on conflict (dedupe_key) do nothing`。PostgreSQL 要求推断目标匹配索引的完整定义（含谓词），因此报 `there is no unique or exclusion constraint matching the ON CONFLICT specification`。

**为什么危险**：所有调用点都用 `.catch(() => {})` 静默兜底（理由是「活动流不是点赞的必要条件」），页面上完全看不出异常，只是活动流永远为空。**静默失效比报错更难发现**——不跑真实数据库，这个缺陷会潜伏到用户问「为什么最近活跃一直是空的」。

**修法**：`20261021000010_fix_record_activity.sql` 补上谓词 `on conflict (dedupe_key) where dedupe_key is not null do nothing`，保留部分索引不变（`dedupe_key` 为 null 的事件允许重复是刻意的：无去重键的事件本来就该每条都记）。

---

## 附：本轮实测证据

**真实 PostgreSQL 18.4**：

- 迁移应用 000001/000003–000010，跳过 000002（自建库无 `auth` schema）
- 文章迁库后 `source = 'db'`、`body_len = 450`、`published_at = 2026-07-17`、`updated_at = 2026-07-18`（均与 frontmatter 一致）；幂等重跑跳过 0 变更；被改坏的 `updated_at` 能自我修复
- 时间轴列类型为 `date`，日期漂移 0 条，构建产物 `timeline.html` 的 `dateTime` 序列无偏移
- `record_activity` 首次 `true` / 重复 `false`；非法 `event_type` 被 check 拦截
- 浏览里程碑：造 10 条浏览后首次 `true` / 重复 `false`，`metadata = {total: 10, milestone: 10}`
- `aggregate_daily_stats` 连跑两次结果完全一致（绝对值 upsert，可重复跑）
- `list_public_activity` 不含 `comment_created`（待审核事件不外泄）
- 函数 ACL：`record_activity` / `record_view_milestone` / `purge_expired_admin_auth` 均为 `playbook=X/playbook`（PUBLIC 已撤销）；`list_public_activity` 保留 PUBLIC（刻意，见 D-13 决策一说明）
- 登录令牌：首次兑换 1、二次兑换 0、过期令牌 0
- 评论审核：第一次批准 1、第二次批准 0（不覆盖），`pending` 0 → `approved` 1

**构建与隔离**：

- 无 `DATABASE_URL`：`typecheck` exit=0，`build` exit=0，**25/25 静态页**；`/api/*` 与 `/admin/*` 全部 `ƒ`；公开内容页保持 `○` / `●`，路由类型不退化
- 有 `DATABASE_URL` + `ADMIN_EMAIL`：`build` exit=0
- `.next/static` 敏感项扫描：`INTERACTION_HASH_SALT` / `ADMIN_EMAIL` / `SUPABASE_SERVICE_ROLE_KEY` / `postgres://` / `playbook-admin` 均 0 命中；唯一 `DATABASE_URL` 命中已定性为 `like-button.tsx` 的用户文案「配置 DATABASE_URL 后可用」，属纯字符串字面量，不含连接串或密码
- 全仓 `%TSD` 加密头扫描无命中

**未验证范围**（必须明示）：

- `000002_rls_policies.sql` **从未在真实 Supabase 上执行过**（无项目凭据），只做了静态审查；自建库上它被 `db-migrate.mjs` 的 `/_rls_policies\.sql$/` 规则正确跳过
- 后台登录的浏览器端流程未做真实点击验证，只验证了底层 SQL 令牌语义与构建产物；真实邮件通道未接入，开发环境靠登录页回显 `devLink` 完成流程
- `middleware.ts` **本轮已实现**（见 D-14 决策九）；它只做 cookie 存在性检查与 `X-Robots-Tag`，**不是安全边界**，授权仍在 `app/admin/layout.tsx` 与每个 Server Action 各做一次
- 后台移动端抽屉未实现（见 D-13 决策八）
- Cloudflare Turnstile 未接入，评论防刷目前只靠限流 + `pending` + 数据库唯一约束

---

## D-14 统计页、后台分析、RSS 与 middleware

**决策一：`sitemap.ts` 必须经 `getDataPorts()`，不能直接读文件仓库。**

原实现直接 `import { listPosts } from '@/lib/content/repository'`，有两个后果：有 `DATABASE_URL` 时只读文件系统，漏掉仅存在于数据库的文章（与页面看到的已发布集合不一致）；违反「页面只能依赖 `lib/data/ports.ts`」约束。

修正后同时纳入公开时间轴节点——原实现**完全漏掉了 `/timeline/[id]`**，而路由表里有 15 条预渲染路径。实测 URL 数从 6 条增至 21 条。

时间轴 `lastModified` 用 `occurredAt`：它没有 `updatedAt` 语义，拿内容发生日期比拿构建日期更接近真实变更时间。

**决策二：统计端口只新增两个读方法，不让页面直接查聚合表。**

`StatsPort` 新增 `getDailySeries(days)` 与 `getLastAggregatedDate()`。postgres 适配器读 `site_daily_stats`，日期用 `to_char(date,'YYYY-MM-DD')`；file 适配器返回 `[]` / `null`。

**刻意不造全零序列**：文件模式返回空数组而不是一条全零趋势，否则会被误读为「那几天真的没人访问」。

**决策三：`aggregated` 的判据是 `aggregatedAt !== null`，不是 `series` 非空。**

这是两种不同的空状态：

| 状态 | `aggregatedAt` | 页面提示 |
| --- | --- | --- |
| 文件模式（无聚合表） | `null` | 「文件模式没有每日聚合表。配置 DATABASE_URL 并运行聚合任务…」 |
| 有库但没跑过聚合 | `null` | 「每日聚合任务尚未运行。执行 npm run db:aggregate…」 |
| 有聚合数据 | `YYYY-MM-DD` | 画趋势 + 标注更新至该日 |

把两者混为「series 为空」会给出错误的下一步指引。

**决策四：趋势窗口以「最后聚合日期」为锚点，不以今天。**

`fillSeriesGaps(series, days, anchor)` 补齐连续 N 天。若用今天做锚点，聚合任务停跑时会画出一段全零尾巴冒充「那几天没人访问」——那是假的。

补齐是必需的：聚合表只有「跑过聚合的那几天」的行，缺的日子不能从图表里消失，否则横轴会跳过空白天，视觉上把稀疏数据读成连续增长。

**日期算术只在字符串上做**（`Date.parse('YYYY-MM-DD' + 'T00:00:00Z')`），不把 `Date` 转回本地时区——延续缺陷一的硬规则。

**决策五：统计页 ISR 15 分钟，不声称实时。**

设计 07 §6 要求 15 分钟到 1 小时。`export const revalidate = 900`。聚合数据本身就是按天粒度的，秒级新鲜度没有意义，而每次访问都扫一遍表才是真的浪费。页面明写「数据更新至 …」而不是「实时」。

**决策六：图表不引入图表库，用柱状 + `sr-only` 数据表。**

只有一条序列（浏览/点赞/评论分开画），柱状已能表达清楚。多引一个客户端库会让这个本来可以是纯静态的页面变成需要 hydration 的页面。

设计 07 §7 要求「每张图表提供标题、文字摘要和可访问数据表」。这里用 `sr-only` 表格提供**逐日数字**，而不是只给 `aria-label`——后者只能说明「这是图」，说不出每天的具体值。柱状区本身 `aria-hidden`，避免屏幕阅读器把 30 个无意义 div 读一遍。

**决策七：后台分析页与公开统计页并列存在，不复用同一页面。**

关键差异：后台能看到**待审核**评论数（公开页刻意不展示）、窗口可切 7/30/90 天、同时给浏览榜与点赞榜。趋势仍复用 `TrendBars`——后台不需要第二套图表实现。

窗口白名单 `[7, 30, 90]`，非法值回退 30 天且不执行查询（设计 13 §4）。

**决策八：`/admin/posts` 是只读索引，不提供会失败的编辑入口。**

设计 10 §1 明确 MVP 阶段为只读索引。因此这里**刻意不放「编辑」按钮**——一个点了会说「暂不支持」的按钮比没有按钮更差。取而代之是把 `source`（`file` / `db`）标出来，并给出该来源下正确的修改路径。

未发布文章不给公开链接（会 404），显示「未发布」。

**决策九：`middleware.ts` 不是安全边界，只做快速检查与响应头。**

它**只**做两件事：
1. 对 `/admin/*`（登录页除外）检查会话 cookie 是否**存在**，没有就跳登录页，省掉一次服务端渲染。
2. 给后台响应补 `X-Robots-Tag: noindex, nofollow`，作为页面 metadata 的第二道保险。

**它只能验证 cookie 存在，不能验证 cookie 有效**（Edge 运行时无法查库）。把安全边界放在这里会得到一个「看起来有守卫、实际可以被伪造 cookie 绕过」的假保护。真正的授权在 `app/admin/layout.tsx` 的 `requireAdmin()` 与每个 Server Action 里各做一次。

**不能在 middleware 里 import 任何 server-only 模块**：`lib/auth/admin.ts` 带 `import 'server-only'` 且依赖 `pg` 与 `node:crypto`，在这里引用会直接构建失败。因此 cookie 名在此**重复写一次**，并用注释指向唯一来源。

`matcher: ['/admin/:path*']` 刻意不用宽泛的 `/((?!_next).*)`：那会让每个公开请求都过一次 middleware，而公开页面是静态生成的，多这一跳只增加延迟、不增加能力。实测公开页响应头中无 `X-Robots-Tag`，证明 matcher 未误伤。

`next` 参数只带 `pathname + search`，不带完整 URL，避免把外部来源拼进去；`safeAdminRedirect` 会再校验一次。

**决策十：RSS 只输出摘要，且 `category` 必须去重。**

设计 11 §7 明确「推荐摘要降低 MDX 自定义组件问题」；全文 feed 需要把 MDX 编译成 HTML 再塞进 XML，自定义组件一旦引入客户端交互就会产生非法标记。

只包含已发布且非未来的文章——端口层的 `list()` 已经过滤过，这里**不再重复判断**，两处各判一次只会让规则漂移。

`pubDate` 必须是 RFC 822（如 `Fri, 17 Jul 2026 00:00:00 GMT`）。纯日期没有时刻，统一按 UTC 零点输出，避免同一篇文章在不同部署时区显示成不同日期。

手动 XML 转义 `& < > " '`：标题与摘要里可能出现这些字符，不转义就会生成解析失败的 feed。

**实测发现并修复一个真实小缺陷**：`<category>` 输出重复——文章的 `category` 与 `tags[0]` 都是「设计系统」，未去重时输出两个相同的 `<category>`。用 `Array.from(new Set(...))` 去重后从 3 个降到 2 个。

---

## 附：D-14 实测证据

**真实 PostgreSQL 18.4（embedded-postgres，端口 55461 / 55471）**：

- 迁移应用 000001/000003–000010，跳过 000002
- 造 4 天聚合数据（含一天全零空洞）：`getDailySeries` 返回 4 行、日期均为 `YYYY-MM-DD`、首项 `2026-10-17`；`getLastAggregatedDate` 返回 `2026-10-20`
- 空聚合表时 `to_char(max(date),'YYYY-MM-DD')` 返回 `null`（不是空串），与 `aggregated` 判据一致
- 后台文章索引：`db-post | published | source=db | featured=true | pub=2026-07-17 | upd=2026-07-18`，日期无偏移
- 窗口 7/30/90 天均能查到 4 行（窗口只影响下界）
- 热门榜：`post/db-post:2 timeline_item/site-v0-1-launch:1`

**构建与产物**：

- 无 `DATABASE_URL`：`typecheck` exit=0，`build` exit=0，**26/26 静态页**；`/stats` 为 `○` + **15m revalidate**，`/rss.xml` 为 `○` + 1h；`/admin/posts` 与 `/admin/analytics` 为 `ƒ`；`/posts/[slug]` 与 `/timeline/[id]` 保持 `●`；First Load JS 共享 103 kB（未变）
- **Middleware 34.2 kB** 已生效
- `sitemap.xml`：URL 数从 6 条增至 **21 条**（5 静态 + 1 文章 + 15 时间轴节点）
- `rss.xml`：`status=200`，`content-type: application/rss+xml; charset=utf-8`，中文无乱码，`pubDate` 为 RFC 822，绝对 canonical，`<category>` 去重后 2 条
- 无库 `/stats`（20583 B）：含「累计指标」「趋势数据积累中」「口径与隐私」「文件模式没有每日聚合表」，**无全零假趋势线**
- 有库 `/stats`（57205 B）：`数据更新至：2026-10-20`、`窗口内合计：浏览 46`（12+0+25+9）、`单日峰值 25`、含 `sr-only` 数据表与 `2026-10-19`（零值日仍在序列中）、热门榜含「库内文章」
- `/admin` 无 cookie → **307** 跳 `/admin/login?next=%2Fadmin`；`/admin/posts` → `next=%2Fadmin%2Fposts` 且带 `X-Robots-Tag: noindex, nofollow`
- 公开页 `/`、`/posts`、`/stats`、`/timeline`、`/posts/playful-recorder`、`/timeline/site-v0-1-launch`、`/about`、`/sitemap.xml` 均 **200** 且无 `X-Robots-Tag`（matcher 未误伤）

**未验证范围**：

- `middleware.ts` 只在 `next start` 下做了真实 HTTP 验证，未在 Edge 生产环境（Vercel / Cloudflare）验证运行时兼容性
- RSS 未用真实 feed 阅读器验证渲染效果，只验证了 XML 结构与响应头
- 后台分析页的图表视觉未做截图验证，只验证了 HTML 结构与数字正确性

---

## D-15 后台活动日志、审核队列与时间轴管理的收尾

本项把 Phase 8 从「能看能改」推到「说得清发生了什么」。核心是一个**真实功能缺陷**：活动事件从未被写入。

**缺陷**：全仓搜索 `activity.record` 只有两处调用（`app/api/likes`、`app/api/views`）。时间轴发布与评论审核通过**完全不写** `activity_events`。后果是公开首页的「最近活跃」只能看到点赞里程碑，Phase 7 的活跃流基本是空的。而迁移 `000010` 刚修好的 `record_activity`（部分唯一索引匹配问题）因此几乎从未被调用过——**修好了一个没人用的函数**。

**决策一：活动写入复用端口层 `ports.activity.record`，不另写一套 SQL。**

`lib/admin/repository.ts` 存在的理由是「后台需要看到公开端口看不到的状态」；写活动事件不需要额外可见性，它就是把一条公开事实记进流水。一套幂等逻辑维护两遍必然漂移。新增 `lib/admin/activity.ts` 作为唯一入口：`writeActivity()` 返回 `'recorded' | 'duplicate' | 'skipped' | 'failed'`，`driver === 'file'` 时返回 `skipped` 而非抛错（后台本身有 `hasDatabaseUrl` 守卫，调用方不该因为「当前没配数据库」让写操作失败）。

**失败时不写日志**：活动事件里可能含内容标题，写日志反而扩大暴露面。但保留 boolean 返回值供观测——`record_activity` 曾经静默失效过一次，那次教训是「吞错误必须有可观测的出口」。

**决策二：时间轴的三种事件分开记，不一律记 created。**

| 动作 | 事件 |
| --- | --- |
| 新建节点 | `timeline_created` |
| 编辑已有节点 | `timeline_updated` |
| 从非发布切到发布 | `timeline_published` |
| 下线（归档） | `timeline_archived` |

一律记 created 会让公开活跃流里出现一堆「创建」，读者无法分辨哪些是真正的新内容。发布事件只在 `previousStatus !== 'published'` 时写，并带 `dedupeKey: timeline_published:${id}`——反复改字段不该刷屏成十条「发布了」。

**决策三：评论审核的事件映射，删除不记事件。**

- `approved` → `comment_approved`（公开可见，进公开活跃流）
- `rejected` → `comment_rejected`（**不进**公开流，但后台日志要能看到）
- `deleted` → **不记**：删除是清理动作，不是「发生过什么」

**决策四：只归档、不物理删除。**

设计 11 §3.3 要求「删除前显示关联评论/点赞数量；默认归档或软删除」。这里只做归档（`status → archived`），因为 D-06 明确互动表**不设外键**——物理删除会留下孤儿评论与点赞，数据库不会替我们拦住。真正的永久删除需要独立的确认流程，本页不提供：一个「点了就没了」的按钮在后台是最容易造成不可恢复损失的东西。下线按钮上直接写出会影响多少条互动。

**决策五：`hasEmail` 是元信息，不是邮箱。**

设计 12 §3 要求「邮箱只显示掩码或不显示」。数据库里存的是哈希，本来就没有明文可显示。因此后台返回的是「是否留了邮箱」这一布尔元信息，页面上是一个「留了邮箱」徽标。**哈希本身绝不返回、绝不渲染。**

**决策六：目标标题用 LEFT JOIN 取，orphan 必须能显示。**

`comments.target_id` 是「公开路由上可寻址的字符串」（文章用 slug、时间轴用 `timeline_items.id`）。后台队列用 `left join posts on target_type='post' and slug=target_id`、`left join timeline_items on target_type='timeline_item' and id=target_id` 取标题，取不到就是 `null`。这不是防御性冗余——互动表不设外键，目标被删后评论还在，这种行**确实会存在**，页面必须显示「目标已不存在」而不是崩掉或显示一个会 404 的链接。

**决策七：审核页默认进入 `pending`，操作后保留筛选。**

「没传 `status` 参数」的语义是「我刚打开这个页面」，而打开这个页面最可能想做的事是处理待审核。默认 `all` 会让待审核混在已处理里，每次都要先筛一次。`returnTo` 隐藏字段保留当前筛选——审核完一条就跳回「全部」会丢掉队列上下文。`returnTo` 是客户端可改的，因此必须白名单到 `/admin/comments` 前缀并拒 `//`、`\`、`..`，否则这里就是开放重定向入口。

**决策八：时间轴筛选写进 query，编辑用版本戳做乐观并发。**

筛选条件（type / status / year / q）全部写进 query 而不是存在组件状态里：刷新、返回、从编辑态回来都还能保持视图。年份筛选用 `extract(year from occurred_at) = $n` 而不是 `occurred_at::text like '2026%'`（后者无法用索引，且依赖隐式格式化）。

编辑回填（`?edit=<id>`）带 `expectedUpdatedAt`（`YYYY-MM-DD HH24:MI:SS` 版本戳）。两人同时编辑同一节点时，后保存的那个收到 `conflict` 而不是静默覆盖——设计 11 §4 的明确要求。**编辑态锁定 ID**：ID 是公开地址与互动目标键，改名等于换了一个目标。

**决策九：批量取互动计数，不做 N+1。**

列表每行都要显示「N 条评论 / M 个赞」，逐行调 `getTargetInteractionCounts` 就是 N+1 查询。改为 `listTimelineInteractionCounts(ids)`：`unnest($1::text[])` 加两个 `left join ... group by`。用 left join 而不是 inner join，是为了让**没有互动的节点返回 0 而不是从结果里消失**——后者会让页面上的数字随机缺行。

**决策十：活动日志页不复用 `list_public_activity`。**

那个 SQL 函数内部已按公开事件白名单过滤，只返回 8 种。后台日志页的意义恰恰在于能看到 `comment_created`、`comment_rejected`、`*_archived`、`like_created` 这些不进公开流的事件——用它做后台日志会得到一份「和公开页一样少」的列表。因此新增 `listActivityLog()` 直查 `activity_events`。

**不返回 `metadata`**：里面可能有访客标识与 UA 的哈希。日志页不需要它们，下发即是无意义的暴露面。

页面上用 `isPublicActivityEvent()` 给每条打「公开 / 内部」徽标，并在末尾写明「带公开标记的会出现在首页最近活跃；不带标记的只在这里可见」——否则会有人以为「我在这里看到拒绝记录，为什么读者看不到」是 bug。

**决策十一：仪表盘的待办条直接链到筛选结果。**

待办只列真正需要动作的项（待审核评论、草稿文章、未发布节点），0 项时整条不显示而不是显示一排「0」——后者每次都要读一遍才确认没事可做。每项链接都带 status query（`/admin/comments?status=pending`、`/admin/posts?status=draft`、`/admin/timeline?status=draft`），点进去就是那份列表，不需要再手动筛一次。这要求 `/admin/posts` 支持 `status` 筛选，本项一并加上。

**决策十二：`upsertTimelineItem` 保留首次发布时间。**

`on conflict do update` 里 `published_at` 改为 `case when excluded.status='published' then coalesce(timeline_items.published_at, excluded.published_at) else timeline_items.published_at end`。原实现直接用 `excluded.published_at`，导致改个错字重存就把「发布于」改成 `occurred_at`——与缺陷二（`updated_at` 被导入时刻覆盖）同类的信息丢失。

---

## 附：D-15 实测证据

**真实 PostgreSQL 18.4（embedded-postgres，端口 55481，`TimeZone = Asia/Shanghai`）**，迁移应用 000001/000003–000010（000002 按设计跳过），`db:import` 导入 1 篇文章。

SQL 层 33 项断言全部通过（脚本用与 `lib/admin/repository.ts` 逐字相同的 SQL 片段）：

- **评论队列**：文章评论取到标题「把个人网站做成一台可玩的记录机」；时间轴评论取到「验证节点 A」；孤儿评论 `target_title` 为 `null`；`has_email` 分别为 true / false
- **批量互动计数**：`verify-node-a` = 1 评论 / 2 赞；无互动的节点返回 `{comments:0, likes:0}` 而非缺行
- **时间轴筛选**：`extract(year from occurred_at) = 2026` 只命中 2026 的节点；关键字 `ilike` 命中标题
- **published_at 保留**：把已发布节点的 `published_at` 设为 `2026-07-17 00:00:00+08` 后「改错字」式重存，`to_char(...,'YYYY-MM-DD HH24:MI:SS')` 仍为 `2026-07-17 00:00:00`；`occurred_at` 仍为纯日期 `2026-07-17`，无漂移
- **活动事件**：`timeline_created` 无 dedupeKey 时两次调用都返回 `true`；`timeline_published` / `comment_approved` 带 dedupeKey 时首次 `true`、重复 `false`；`comment_rejected` / `timeline_archived` 写入成功；非法类型 `article_created` 被 `activity_events_type_check` 拒绝
- **后台日志 vs 公开流**：后台全量能看到 `comment_rejected` 与 `timeline_archived`；`list_public_activity(50)` 里这两类**都不出现**，只出现 `timeline_created` / `timeline_published` / `comment_approved`；公开流不返回 `visitor_id`；后台日志行字段只有 `id,event_type,target_type,target_id,title,created_at`（**无 metadata**）
- **并发审核**：`where id=$1 and status=$4` 第一次更新成功、第二次（expectedStatus 仍为 pending）返回 0 行，不覆盖

后台页面 50 项断言全部通过（用真实会话 cookie 请求 `next start`；会话行按 `sha256(salt + 'admin-session:' + token)` 直接写入 `admin_sessions`，与 `lib/auth/admin.ts` 的 `hashValue` 同构）：

- 8 个后台页面（`/admin`、`/admin/activity`、`/admin/comments?status=pending|all`、`/admin/timeline`、`/admin/timeline?status=draft`、`/admin/posts?status=published`、`/admin/analytics`）全部 **200**、含关键文案、带 `X-Robots-Tag: noindex, nofollow`、**不含 `postgres://` / 盐 / `INTERACTION_HASH_SALT`**
- 活动日志页真实显示出本轮写入的「评论通过」「评论被拒绝」「发布时间轴节点」「下线时间轴节点」，公开/内部徽标区分正确，**不渲染 metadata 哈希**
- 评论页**无参数时默认进入待审核**；显示 orphan 标记「目标已不存在」；显示「留了邮箱」徽标；显示目标标题而非裸 id；**不渲染邮箱哈希**
- 时间轴 `?edit=verify-node-a` 回填表单（「编辑节点」标题、`expectedUpdatedAt` 隐藏字段、列表互动计数）
- 仪表盘出现待办条且链接为 `/admin/comments?status=pending`，最近内容变更与最近评论区块都在

**构建与产物**：

- 无 `DATABASE_URL`：`typecheck` exit=0，`build` exit=0，**26/26 静态页**；`/stats` 为 `○` + 15m，`/rss.xml` 为 `○` + 1h，`/posts/[slug]` 与 `/timeline/[id]` 保持 `●`，`/admin/*`（含新增 `/admin/activity`）与 `/api/*` 为 `ƒ`；First Load JS 共享 103 kB；Middleware 34.2 kB
- 有 `DATABASE_URL`：`build` exit=0，路由类型与无库时一致，SSG 预渲染路径随库内内容变化
- 泄漏扫描：`sensitive_in_static=1`，唯一命中 `277-849c6e014d7fb41d.js :: DATABASE_URL`——`like-button.tsx` 无库时展示给用户的文案「配置 DATABASE_URL 后可用」，纯字符串字面量，不含连接串、密码、盐或邮箱。其余敏感项 0 命中
- `%TSD` 加密扫描：`encrypted_count=0`
- 未登录 `/admin/activity` → **307** 跳 `/admin/login`；`/admin/login` 带 `X-Robots-Tag: noindex, nofollow`

**未验证范围**：

- 活动事件写入的浏览器端全流程（真实点击「通过」「保存」）未做，只验证了 Server Action 调用的 SQL 语义与页面渲染结果——即「写入逻辑正确」与「页面能显示」两头都有证据，中间那一跳靠的是 Next.js 的 Server Action 机制
- 后台登录的邮件投递仍未接入（无真实邮件通道），开发环境靠登录页回显 `devLink`；本次验证是直接构造会话行，**未走完整的「输邮箱 → 拿链接 → 点链接」流程**
- 时间轴并发冲突的 UI 反馈（`conflict` 分支的提示文案）只验证了代码路径存在，未构造两人同时保存的真实并发场景
- 后台移动端仍为可换行列表，未实现设计 08 §2.2 的抽屉（有意的范围裁剪）

---

## D-16 本地 PostgreSQL 环境的提供方式

本机没有原生 PostgreSQL（`psql`、`pg_ctl` 都不在 PATH），而互动、统计、后台都需要真库。本项提供一套「一条命令装好」的本地环境。

**决策一：用 `embedded-postgres` 把官方二进制装进 `.me/pg`，不进项目依赖。**

它是把上游 PostgreSQL 的 `initdb` / `pg_ctl` / `postgres` 装到 `node_modules` 里，**不是模拟器**（实测 PostgreSQL 18.4，SQL 行为与原生库一致）。放在 `.me/`（已在 `.gitignore`）里而不是 `dependencies`：数据库二进制与数据文件都不该进仓库，也不该让每次 `npm install` 都拉一遍。换台机器重跑 `db:setup` 即可。

**决策二：用 `pg_ctl` 托管进程，而不是常驻一个 node 进程。**

之前做验证时用的是「node 里 `new EmbeddedPostgres()` 然后 `process.stdin.resume()`」，那种方式下数据库的生命周期绑在终端上：关窗口实例就没了，而且终端被占住不还提示符。`pg_ctl` 把 postgres 交给操作系统托管，命令立即返回，与装了原生 PostgreSQL 的体验一致。

**决策三：只监听 `127.0.0.1`，口令固定为 `postgres`，并在文档里写明这是本机开发凭据。**

不对外暴露端口；口令不是秘密，而是「本机开发」这一场景的显式声明。文档里同时写明：任何部署环境必须换强口令并设 `DATABASE_SSL=require`。含糊其辞地用一个弱口令反而危险。

**决策四：不创建 `.env.local`，而是把确切内容打印给用户。**

`.env.local` 已被 `.gitignore` 排除，属于用户本地环境。脚本结尾直接输出 `DATABASE_URL` 与 `INTERACTION_HASH_SALT` 两行的确切写法，用户复制粘贴即可，无需猜测格式。

---

## 附：D-16 实现中修掉的三个真实缺陷

这三个都不是产品代码的缺陷，但都属于「成功了却像失败」或「失败了却像成功」，值得记下来。

**缺陷一：`spawn EINVAL`。**

Node 20 起（CVE-2024-27980 修复后）`child_process` 不再允许直接 spawn `.cmd` / `.bat`。`db-setup.mjs` 里 `exec('npm.cmd', ...)` 因此直接失败。修法：加 `shell: isWindows`。参数无空格与特殊字符，不会引入引号拆分风险。

**缺陷二：`pg_ctl start` 在 Windows 上挂住（最危险的一个）。**

它 fork 出的 postgres 子进程继承了 pg_ctl 的 stdout/stderr 管道，于是父进程的 `close` 事件永远不来，`execFile` 的 Promise 不 resolve。现象是：命令看起来卡死、终端不还提示符，**但数据库其实已经起来了**。

这种「成功了却像失败」最难判断——很容易误以为启动失败而反复重试，甚至去删数据目录。修法：

1. `spawn` + `stdio: 'ignore'` 彻底断开输出管道（`detached` + `unref` 让 node 不因子进程而保持存活）；
2. 不依赖 pg_ctl 的退出码，而是自己探测就绪。当时用的是 TCP 端口轮询（`net.Socket` 连 `127.0.0.1:PORT`），后来发现那个判据不够——端口在监听并不等于数据库能服务查询，见「附：D-16 加固」。现已改为真实 SQL 往返。

**缺陷三：平台包只带 `initdb` / `pg_ctl` / `postgres`，没有 `psql` 与 `createdb`。**

`@embedded-postgres/windows-x64/native/bin` 实测只有这三个可执行文件，其余全是 DLL。所以建库不能用 `createdb`。改为用项目自带的 `pg` 客户端连 `postgres` 维护库执行 `create database`：既不依赖外部工具，也避开了「拼 createdb 路径」这类脆弱假设。库名先过 `/^[a-z_][a-z0-9_]{0,62}$/` 白名单（DDL 不接受参数占位符）。

---

## 附：D-16 实测证据

**环境**：Windows，Node v20.16.0，端口 5432，数据目录 `.me/pg/pgdata`，仅监听 127.0.0.1。

**命令逐条实测**：

| 命令 | 输出 |
| --- | --- |
| `npm run db:setup` | `已创建数据库 playbook` → `停止实例…` |
| `npm run db:start` | `已启动：postgres://postgres:postgres@127.0.0.1:5432/playbook`（**立即返回**） |
| `npm run db:stop` | `已停止` |
| `npm run db:migrate` | 9 个迁移应用，`000002_rls_policies` 按设计跳过 |
| `npm run db:import` | `新增 1，更新 0，跳过 0` |
| `npm run db:health` | `连接成功，耗时 117 ms`、`PostgreSQL 18.4`、`已应用迁移 9 个`、`schema 自检通过` |

**端到端 32/32 断言全部通过**（真实 HTTP 打 `npm run dev`，真实库查证）：

- 文章详情页 200 且正文来自 `posts.body`；页面**不再出现**「评论功能需要数据库支持」
- 浏览量：首次 `counted=true` 且 `page_views` 行数 +1；同访客重复上报 `counted=false`（30 分钟去重生效）
- 点赞：`count` 增加且 `liked=true`；重复点赞 `count` 不变（幂等）；同一访客在 `likes` 表只有一行（唯一约束）；`DELETE` 后 `liked=false`
- 评论：返回 **201**、消息含「审核」、`comments` 行数 +1、状态 `pending`、`author_email_hash` 非空、**库里查不到明文邮箱**、待审核评论不出现在公开页
- 校验：超长评论 400、非法 `targetType` 400、不存在的目标 404、非站内 `path` 400
- 首页/统计页/时间轴 200；首页不再出现「配置 DATABASE_URL 后可用」；统计页不再出现「文件模式没有每日聚合表」
- `/admin` 未登录 307 + `next=%2Fadmin` + `X-Robots-Tag: noindex, nofollow`
- 有库 `typecheck` exit 0、`build` exit 0，路由表与无库时**完全一致**（26/26 静态页、`/stats` 15m、`/rss.xml` 1h、`/posts/[slug]` 与 `/timeline/[id]` 为 `●`、`/admin/*` 与 `/api/*` 为 `ƒ`）

**顺带修掉的一个产品缺陷**：`middleware.ts` 的重定向分支没有带 `X-Robots-Tag`——只有 `NextResponse.next()` 分支带了。文档声称「给后台响应补这个头」，但未登录访问 `/admin` 的那个 307 缺了。虽然 307 本身不会被索引，但「后台所有响应都不鼓励抓取」是更简单、更难漏的口径。已修。

**接口字段命名的不对称（实测得出，不是笔误）**：POST / DELETE 的 JSON body 用 camelCase（`targetType` / `targetId` / `authorName` / `authorEmail`），而 `GET /api/likes` 的 query 用 snake_case（`target_type` / `target_id`）。两者都由服务端 zod schema 强制，传错会被 400 拒绝。

**未验证范围**：

- 只在 Windows x64 上验证过。`findBinDir()` 按 `@embedded-postgres/*` 子目录探测 `pg_ctl`（不硬编码平台名），但 macOS / Linux 未实测
- 未验证「关掉终端后实例继续运行」的跨会话持久性（只验证了命令立即返回且端口监听）
- 未验证开机自启（本项不提供，需用户自己把 `db:start` 加进启动项）
- 未验证数据目录在磁盘满 / 异常断电后的恢复能力

---

## 附：D-16 加固（僵尸实例与孤儿进程）

这一节记录一次真实事故：数据库「端口开着却连不上」，而当时所有检查手段都显示它正常。

### 现象

首页渲染时抛出：

```
[db] 查询失败：Connection terminated due to connection timeout
    at query (lib/db/query.ts:30:11)
    at Object.list (lib/data/adapters/postgres.ts:161:25)
    at HomePage (app/(site)/page.tsx:27:64)
```

同时 `pg_ctl status` 说「在运行」，`Test-NetConnection 127.0.0.1 -Port 5432` 返回 `True`。

### 根因

崩溃恢复中途被中断（终端里的 Ctrl+C 打到了 postgres 进程组），日志留下这几行：

```
LOG:  terminating any other active server processes
LOG:  all server processes terminated; reinitializing
LOG:  database system was interrupted; last known up at 2026-10-21 20:47:33 CST
LOG:  shutting down
^C
```

postmaster（PID 26640）在恢复完成前就死了，但它 fork 出的一个后台 worker（PID 63392，命令行 `--forkchild="io_worker" 3148`）活了下来，并**继承了监听 socket**。

于是：

- 5432 依然 TCP 可连 —— 连接被内核 accept 队列接住；
- 没有任何进程去 accept —— 查询发出去永远没有回应；
- 客户端等到超时，报 `Connection terminated due to connection timeout`。

`postmaster.pid` 里还写着 `26640` 与 `ready`，而那个 PID 早已不存在。

**为什么这个状态特别难识别**：三个常用判据全部失效。

| 判据 | 在僵尸态下的结果 |
| --- | --- |
| `pg_ctl status` | 只看 pid 文件，返回「在运行」 |
| TCP 端口探测 | 端口确实在监听，返回 `true` |
| `postgres.exe` 进程数 | 是 1 而不是 0，看起来「至少还活着」 |

真正的判据只有一个：**能不能在一个往返内拿到 SQL 结果**。

### 当时为什么会「修好」成假的

`db:start` 的就绪判据是 TCP 端口轮询。孤儿 worker 占着端口，于是 `waitForPort()` 立刻成功，脚本打印「已启动」——**而数据库其实从头到尾都没起来过**。`server.log` 在崩溃那一刻之后再没有任何新行，这是最直接的证据。

这和「缺陷二」是同一类错误的镜像：那次是「成功了却像失败」，这次是「失败了却像成功」。两者都源于**用间接指标代替真实行为**。

### 加固后的判据与清理规则

新增 `scripts/lib/pg-runtime.mjs`，把运行时探测与清理集中到一处，`db:start` / `db:stop` 共用（此前两边各写一份 `findBinDir` / `exists`，已经开始漂移）。

**就绪判据改为真实 SQL 往返**（`probeSql`）：用项目已有的 `pg` 客户端连维护库 `postgres` 执行 `select 1`，`connectionTimeoutMillis` 与 `query_timeout` 都设为 2.5 秒。连维护库而不是业务库，因为 `db:start` 可能早于 `db:migrate`，那时 `playbook` 还不存在。`pg` 的 `connectionTimeoutMillis` 覆盖整个启动握手（含认证），所以对端不回应时它会直接抛错，而不是一直挂着。

**孤儿识别从端口反查**（`findPortListeners` → `describeProcess`）：孤儿只认 socket，所以「谁在监听这个端口」是唯一可靠的识别方向。Windows 用 `Get-NetTCPConnection -LocalPort N -State Listen`，POSIX 用 `lsof -nP -iTCP:N -sTCP:LISTEN -t`。

**只在两种情况下杀进程**（`clearPortHolders`）：

1. 它就是 `postmaster.pid` 记录的那个 PID（本实例的 postmaster，只是已经不能服务查询）；
2. 它的父进程已经不存在（孤儿）。

其它 `postgres.exe` 只报告、不动手。端口被别的实例占着是配置问题，替用户杀掉别人的数据库不是这个脚本该做的决定——遇到这种情况脚本会以非 0 退出并打印占用 PID。

**陈旧 `postmaster.pid` 只在记录的 PID 已不存在时删**（`removeStalePidFile`）：PID 还活着说明那确实是个运行中的实例，删掉 pid 文件会让后续 `pg_ctl` 彻底失去对它的追踪。

**`db:start` 的启动前决策**：

| 探测结果 | 动作 |
| --- | --- |
| SQL 通 | 什么都不做（重复执行安全） |
| 端口有监听但 SQL 不通 | 僵尸：先 `-m fast` 尝试正常停止，再清孤儿、删陈旧 pid，然后启动 |
| `postmaster.pid` 指向的进程已不存在 | 陈旧文件：清理后启动 |
| pid 进程还在但端口没监听 | 半死：清理后启动 |

**`db:stop` 的收尾**：`pg_ctl status` 只认 pid 文件，所以无论正常停止还是判定「未在运行」，结束后都要再从端口反查一次并清一次。正常停止时这两步都是空操作。

### 验证

| 场景 | 结果 |
| --- | --- |
| 加固前 `npm run db:health` | `[db:health] timeout expired`，`pg=1` |
| 加固后 `npm run db:health` | `连接成功，耗时 153 ms`、`PostgreSQL 18.4`、`已应用迁移 9 个`、`schema 自检通过`，`pg=9` |
| 首页（真实 `DATABASE_URL`） | `200`、`len=81575`、无「查询失败」、含 `playful-recorder` |
| `/posts`、`/posts/playful-recorder`、`/timeline`、`/stats`、`/rss.xml`、`/sitemap.xml` | 全部 `200` |
| 端到端 `.me/verify/e2e.mjs` | `TOTAL=32 PASS=32 FAIL=0` |
| 正常 stop → start 往返 | `已停止`（`pg=0`、5432 无监听、pid 文件消失）→ `已启动`（`pg=9`）；`db:health` 通 |
| 重复 `db:stop` | `未在运行`，exit 0 |
| 重复 `db:start` | `已在运行：…`，`pg` 仍为 9，未启动第二个实例 |
| 陈旧 `postmaster.pid`（记录的 PID 已死） | `检测到异常状态：postmaster.pid 指向的进程已不存在` → `已删除陈旧的 postmaster.pid` → 启动成功；pid 文件首行由 57692 变为新 PID |
| 端口被非 postgres 进程占用 | exit **1**，`端口 5432 上仍有未能清理的进程（PID 21624）`；该进程**未被杀**（仍存活），也未启动 postgres（`pg=0`） |
| 僵尸态（端口监听、查询挂死） | `db:health` → `timeout expired`；`db:start` → `检测到异常状态：端口 5432 有监听，但查询没有响应` → `已结束占用端口的 postgres 进程：24804` → `已删除陈旧的 postmaster.pid` → 启动成功；`db:health` 通 |

僵尸态是**故意构造**的：用 `NtSuspendProcess` 挂起 postmaster，让它继续占着监听 socket 但不再回应任何请求。这样复现出来的症状与真实事故一致（`pg=9`、端口在监听、`db:health` 报 `timeout expired`），但不必真的打断一次崩溃恢复。

### 未验证范围

- 孤儿清理的 POSIX 分支（`lsof` + `ps`）**未在 macOS / Linux 上实测**，只在 Windows 上跑过。
- 「端口被非 postgres 程序占用」的告警分支只验证了代码路径，未构造真实的端口冲突。
- 加固只覆盖「进程层面」的异常。数据目录在磁盘满 / 异常断电后的恢复能力仍未验证——本轮事故正属此类，脚本只能清理，不能保证数据完整性。
