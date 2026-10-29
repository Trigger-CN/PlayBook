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

### 第一版加固漏掉的一个真实缺陷

第一版 `clearPortHolders` 只做一件事：拿端口归属者的 PID 去查进程，查到 postgres 且「是 pid 文件记录的 postmaster」或「父进程已死」就杀，否则报告 `owned-by-other-instance` 并让 `db:start` 失败退出。

实测撞上了它修不了的形态。当时的状态是：

```
pg=1
5432=True
ProcessId=53548  ParentProcessId=44024  cmd=... postgres.exe --forkchild="io_worker" 1764
pidfile_exists=False
Get-NetTCPConnection -LocalPort 5432 → OwningProcess=44024
```

也就是：`44024`（postmaster）已经死了，`53548`（它的 io_worker）还活着，端口仍然可连，`db:health` 报 `timeout expired`。而 `db:start` 打印的是：

```
[db:start] 检测到异常状态：端口 5432 有监听，但查询没有响应
[db:start] 端口 5432 上仍有未能清理的进程（PID 44024）。
  请先释放该端口，或换端口重跑 db:setup。
```

**根因**：Windows 把监听 socket 记在**创建它的那个进程**上。postmaster 死后子进程继承了 socket，但操作系统报出来的 `OwningProcess` 仍然是那个**已经不存在的** PID。于是 `describeProcess(44024)` 返回 `null`，代码把它当成「查不到的外部进程」→ `skipped` → `fail()`。真正占着端口的 `53548` **根本不出现在端口列表里**，无论怎么扫都扫不到。

这个缺陷的要害不是「杀错了」，而是「该杀的看不见」：只从端口反查，在继承了 socket 的场景下信息本身就是错的。

**修法（两轮扫描）**：

1. 端口归属者里**还查得到**的进程：只有「就是 pid 文件记录的 postmaster」或「本仓库二进制的子进程」才动手；`describeProcess` 返回 `null` 时不再当作外部进程，直接跳过交给第二轮。
2. 扫描**全机** postgres 进程，挑出同时满足三条的：命令行属于本仓库这套二进制（比较归一化后的 `PG_HOME` 前缀，避免误伤另一个 PostgreSQL 安装）、身份是子进程（命令行含 `--forkchild=`）、父进程已经不在。这些才是继承了 socket 的孤儿。

身份必须从命令行认，不能只看「父进程是否已死」：`pg_ctl` 是 detach 启动的，它退出后**正常 postmaster 的父进程本来就不在了**，只看父进程会把健康实例误判成孤儿。`toDescriptor` 因此用 `/--forkchild=/` 区分 `child`，用 `/(^|\s)-D(\s|$)/` 区分 `postmaster`，其余为 `unknown`。

postmaster 仍然不在这条路径上处理：它还活着时该走 `pg_ctl -m fast`，那才保证数据一致。命令行不属于本仓库的 postgres 一律只报告不杀。

**修复后实测**（同一个卡死状态，未做任何手工清理）：

```
[db:start] 检测到异常状态：端口 5432 有监听，但查询没有响应
[db:start] 已结束占用端口的 postgres 进程：53548
[db:start] 启动中…
[db:start] 已启动：postgres://postgres:***@127.0.0.1:5432/playbook
EXIT_START=0   pg_after=9   新监听者 59464
```

随后 `start-dev.bat` 全流程：`[2/3] Restarting the local database...` → 无 `[WARN]` 分支 → dev server `Ready in 4.7s` → 首页 `HTTP=200`、`len=81575`、无「查询失败」；`db:health` 连接成功 211 ms。
僵尸态是**故意构造**的：用 `NtSuspendProcess` 挂起 postmaster，让它继续占着监听 socket 但不再回应任何请求。这样复现出来的症状与真实事故一致（`pg=9`、端口在监听、`db:health` 报 `timeout expired`），但不必真的打断一次崩溃恢复。

### 未验证范围

- 孤儿清理的 POSIX 分支（`lsof` + `ps`）**未在 macOS / Linux 上实测**，只在 Windows 上跑过。
- 「端口被非 postgres 程序占用」的告警分支只验证了代码路径，未构造真实的端口冲突。
- 加固只覆盖「进程层面」的异常。数据目录在磁盘满 / 异常断电后的恢复能力仍未验证——本轮事故正属此类，脚本只能清理，不能保证数据完整性。
- 第二轮扫描依赖「父进程已死」判定孤儿。如果某个 worker 的 PID 被操作系统回收并分配给一个存活的无关进程，该 worker 会被判成「不是孤儿」而漏掉；这是 PID 复用的固有局限，未构造该场景验证。
- `start-dev.bat` 的数据库步骤只在 Windows 上实测过（cmd + chcp 65001）；批处理本身不跨平台，其他平台应直接用 `npm run db:start`。

---

## D-17 后台文章在线书写：路由组、三态正文来源与缓存失效

> 本节记录「实现后台登录/文章书写/评论审核」这一轮（第 18 轮）的决策，以及实施中发现并修掉的四个真实缺陷。前三个缺陷都不是新写的代码引入的，而是既有实现里长期存在、因为验证方式绕开了它们而从未暴露。

### 1. 为什么要用路由组把登录页移出守卫

原实现把 `requireAdmin()` 放在 `app/admin/layout.tsx`——也就是**所有** `/admin/*` 路由的布局。而 `/admin/login` 与 `/admin/login/verify` 正在这个布局之下，于是未登录访问登录页会得到：

```
GET /admin/login  →  307 /admin/login?next=/admin  →  307 …（无限循环）
```

**后台根本登不进去。** 而 `logout()` 也是 redirect 到 `/admin/login`，同样死循环。

这个缺陷长期没有暴露，原因值得记下来：早先的后台验证都是按 `sha256(salt + 'admin-session:' + token)` 直接往 `admin_sessions` 写一行、带 cookie 去请求，**从来没有真正走过登录页**；`e2e.mjs` 只断言 `/admin` 返回 307 且带 `next` 参数（用 `redirect: 'manual'`，从不跟随）。两边都绕过了那条死循环。`middleware.ts` 里已经为登录路径开了白名单并留了注释「否则登录页自己会被重定向成死循环」——说明想到了 middleware 那层，**漏了 layout 那层**。

**决策：用 Next.js 路由组把「需要会话的」与「登录用的」在物理上分开，URL 完全不变。**

| 路径 | 内容 | 是否有守卫 |
| --- | --- | --- |
| `app/admin/layout.tsx` | 只放 `metadata`（noindex）+ `force-dynamic` | 无 |
| `app/admin/(protected)/layout.tsx` | `hasDatabaseUrl` / `isAdminConfigured` / `requireAdmin` 三分支 + 后台外壳 | 有 |
| `app/admin/(auth)/login/` | 登录页、登录表单、登录 Action、令牌兑换 | 无 |

比「在 layout 里维护一份路径白名单」更好：白名单是字符串判断，新加一个公开后台路由就会悄悄落到守卫后面；路由组是结构性的，放错目录立刻看得出来。

### 2. 令牌兑换必须是 Route Handler，不能是页面

修掉死循环后，`GET /admin/login/verify?token=…` 变成 **500**：

```
Error: Cookies can only be modified in a Server Action or Route Handler.
```

`verify/page.tsx` 是 Server Component，渲染时调用 `completeLogin()` → `setAdminSessionCookie()` → `cookies().set()`。Next.js 禁止在渲染中改 cookie，所以登录**最后一步必然失败**；而令牌此时已被 `consumeLoginToken` 用条件更新消耗掉——**人拿不到会话，令牌也白花了**，只能重新请求一封登录邮件。

**决策：把 `/admin/login/verify` 改成 Route Handler（`route.ts`），URL 不变。**

用 GET 不违反「退出登录不用可预取的 GET」那条约定。那条的理由是「被预取就等于被执行」；而这里令牌本来就在 URL 里，点开就是它的唯一用途，且一次性、15 分钟过期，重复访问只会得到「无效」而不是第二次登录。

### 3. `posts.source` 三态：谁最后写正文，谁就是权威来源

`source` 从 `('file','db')` 扩为 `('file','db','admin')`：

| 值 | 语义 |
| --- | --- |
| `file` | 从未导入（保留给「只在库里建骨架」） |
| `db` | 由 `db:import` 从 MDX 同步，**文件是权威来源** |
| `admin` | 后台在线编辑过，**数据库是权威来源，`db:import` 必须跳过** |

改动前 `db:import` 的 update 分支无条件写 `source='db'` 并覆盖 `body`：**任何在网页上编辑过的文章，都会被下一次导入静默覆盖**，而且从输出里看不出发生过什么。编辑器一上线就会是个数据丢失陷阱。

判定方向只有一条：**谁最后写入了正文，谁就是权威来源。** 这样「改了文件但页面没变」与「网页上写的被导入冲掉」两种静默不一致都不会发生。要拿回文件版本，必须在后台把该文删掉或手工把 `source` 改回 `'db'`，让作者**显式选择**。

### 4. `revalidateTag` 在本项目是空操作

**这是本轮最隐蔽的缺陷，也是全项目范围的既有问题。**

现象：在后台把一篇文章归档，`/posts` 列表立刻不显示它（该页是 Dynamic），但 `/posts/<slug>` **仍然 200**、首页仍然列着它、RSS 里还在。响应头：`x-nextjs-cache: HIT`、`x-nextjs-prerender: 1, 1`、`stale-time=300`、`cache-control: s-maxage=31536000`。

根因：`revalidateTag(tag)` 只能失效**带该 tag 的缓存条目**——即 `fetch(url, { next: { tags } })` 或 `unstable_cache(fn, keys, { tags })` 建立的条目。本项目公开页**全部经 `getDataPorts()` 直连 `pg` 查询**，既不是 fetch 也不是 `unstable_cache`（`grep unstable_cache` 在 `lib/data/adapters/postgres.ts` 里 0 命中），全项目此前**从未使用过 `revalidatePath`**。所以所有 `revalidateTag` 调用都是空操作：不报错，静态页继续拿构建期的旧 HTML，直到进程重启。

「一半生效」是最难发现的一类问题：Dynamic 的列表页立刻更新，Static/SSG 的详情页、首页、RSS、sitemap 不更新，看起来像「有时候好用」。

**决策：双写。** 在 `lib/cache/tags.ts` 里与 tag 并列维护路径清单——`revalidatePostPaths(slug)` 与 `revalidateTimelinePaths(id)`——并在每个内容变更 Action 里同时调用 `revalidateTag` 与 `revalidatePath`（含 `/stats`）。保留 `revalidateTag` 是为了将来真改用 `fetch`/`unstable_cache` 缓存时不用再改一遍；两者必须一起改，所以放在同一个模块里。

> 顺带说明为什么不用「把数据库查询包进 `unstable_cache` 并打 tag」这条更「标准」的路：那会让每次页面渲染都要维护一层缓存键，而当前数据量下一层缓存反而是多余的复杂度。按路径失效的语义更直接：**改了哪篇，就失效哪篇的路由**。

### 5. 草稿允许半成品

`validate()` 原先对草稿也强制 `summary` 非空、`publishedAt` 匹配 `YYYY-MM-DD`、`body` 非空——一篇只有标题的草稿存不下来。设计 15 §3.4 约束的是**发布**，不是保存。

**决策：** `slug` 永远校验（它终将成为 URL，且 `posts_slug_check` 反正会拒绝非法值）；「填了发布日期就必须合法」也无条件校验；其余（`summary` 必填、`publishedAt` 必填、`body` 非空、`cover`→`coverAlt`、MDX 编译）**全部收进 `status === 'published'` 分支**。

### 6. 编辑器为什么是原生表单

| 决策 | 理由 |
| --- | --- |
| 原生 `<textarea>` + 原生表单，不做富文本工具栏 | 设计 15 §7 要求「文本区始终可用」；纯文本域天然满足，还保住浏览器自带的撤销、拼写检查、输入法与粘贴。一个点不动的工具栏比没有更差。 |
| 校验失败用 `useActionState` 返回状态，**不 redirect** | `redirect` 会整页重渲染，**刚写的正文全丢**。设计 15 §8 明确要求「保存/发布失败不丢失正文」。 |
| `changePostStatusAction` **可以** redirect | 那里没有正文输入会因此丢失。 |
| 只返回第一条校验错误 | 一次列十条在移动端会把表单挤出屏幕；修完第一条再看第二条更顺。 |
| 只有 `status === 'published'` 才编译 MDX | 草稿本来就该允许半成品。 |
| 每次写入都带 `version` 乐观锁 | 两个编辑页同时打开时，后保存的不该静默覆盖先保存的。 |
| `published_at` 直接写用户填的值（不 coalesce） | 与 `timeline_items.published_at` 不同：文章发布日期是编辑决定，不是「事情发生的时刻」。 |
| slug 建好后锁定 | 改 slug 需要重定向规划。 |

### 7. 刻意未实现（不要当成已完成）

- **自动保存**（设计 §3.2）：需要草稿版本表 + 限频 Action。当前用 `beforeunload` 拦截作为替代。
- **实时预览**（设计 §3.3）：需要受保护的预览路由。
- **富文本工具栏**（设计 §2.1-3）。

### 8. 验证

`typecheck` 0；`build` 0（12 个静态页，`/admin/posts/new` 与 `/admin/posts/[slug]/edit` 均为 `ƒ`，公开页类型未退化）。

真实端到端（生产模式 `npm run start` + 真实 PG 18.4 + 真实一次性令牌换会话）：

| 脚本 | 结果 | 覆盖 |
| --- | --- | --- |
| 登录链路 | **14/14** | 令牌兑换 307 → 会话入库 → 令牌标记已用 → 重放被拒 → 新建页 200 含全部输入框 |
| 编辑器链路 | **22/22** | 保存草稿（`source=admin`、标签解析、空标题被拒且不覆盖正文）→ 发布（`published`、日期按填写值、`version` 递增）→ 公开页 200 且渲染 MDX → 过期 version 被拒 → 列表页归档 Action → 公开页 404 |
| 归档/缓存链路 | **6/6** | 归档后公开页 404（证明 `revalidatePath` 生效）、列表不再列出、`post_published` / `post_archived` 事件写入 |
| 既有回归 `e2e.mjs` | **32/32** | 未退化 |

泄漏扫描：`.next/static` 命中 1 条，仍是 `like-button.tsx` 里给用户看的文案「配置 DATABASE_URL 后可用」（纯字符串，良性）。`%TSD` 加密扫描：0 命中。

### 9. 未验证范围

- 后台只在 **Windows x64 + 本地 PostgreSQL 18.4 + Node 20.16** 上验证。
- 真实邮件通道未接入：开发环境靠登录页回显 `devLink`，生产路径（`NODE_ENV === 'production'` 时不回显）**未实测**。
- 编辑器的自动保存 / 实时预览 / 工具栏刻意未实现。
- 浏览器级 UI 交互（键盘 Tab 顺序、390px 视觉、`beforeunload` 实际弹窗）**未做截图或人工验收**，只做了 HTML 级断言。
- `revalidatePath` 在多实例部署下的行为未验证（本轮是单进程 `next start`）。
- Cloudflare Turnstile 未接入（`TURNSTILE_SECRET_KEY` 仍为空）。

## D-18 前台后台入口：放在顶部而非页脚

### 1. 决策与背景

此前前台**没有任何链接指向后台**（首页 / 关于 / 文章 / 时间轴 / 统计五个页面各为 `admin 链接数=0`），只能手动输入 `http://localhost:3000/admin`。这与 `app/robots.ts` 的 `disallow: ['/admin', ...]` 及后台全量 `noindex,nofollow` 一致，是设计取舍，不是遗漏。

当时给了两个方案，本轮用户选择 **A：在页面顶部加入登录按钮**。

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A（已采用）** | Header 右侧加一个「登录」按钮 | 访客与爬虫可见 |
| B | 只在 `NODE_ENV !== 'production'` 时渲染 | 生产站点完全无痕迹 |

### 2. 为什么链接指向 `/admin` 而不是 `/admin/login`

同一个按钮必须对两种登录状态都成立。指向 `/admin` 时：

- 未登录 → `(protected)/layout.tsx` 的 `requireAdmin()` 返回 null → `redirect('/admin/login?next=/admin')`，回跳参数自动带上；
- 已登录 → 直接进后台概览。

如果指向 `/admin/login`，已登录用户点进去会看到一个多余的登录页；如果要在前台按登录态切换文案，就得在公开页读 cookie —— 那会让**全站路由退化为 Dynamic**，违背 REQ-NFR-001。用 `/admin` 把这个判断留在后台，公开页保持纯静态。

### 3. 为什么按钮在 `<nav aria-label="主导航">` 之外

`SiteNav` 渲染的 `<nav>` 是主导航 landmark，里面只应有栏目链接（首页 / 文章 / 时间轴 / 关于）和一个主题开关。「登录」不是栏目，它是跳转到另一个应用区域的入口。混进去会让读屏用户在「主导航」里听到一个不属于栏目的东西。

结构上改为在 `site-header.tsx` 里用一个 `div` 同时包住 `<SiteNav />` 与按钮：

```tsx
<div className="flex shrink-0 items-center gap-2.5 sm:gap-[18px]">
  <SiteNav />
  <ToyButton href="/admin" size="small" variant="cream" rel="nofollow" aria-label="登录后台" className="shrink-0">
    登录
  </ToyButton>
</div>
```

### 4. 复用 ToyButton，不新建按钮组件

`ToyButton` 是项目唯一的按压结构（D-02）。`href` 分支渲染 `Next Link`，其 `AnchorProps = Omit<ComponentPropsWithoutRef<'a'>, ...>` 因此 `rel` 能透传。选定 `size="small"`（高 42px + 底座 7px = 实测 49px，满足 ≥44px 触控目标）与 `variant="cream"`（克制，不与主 CTA 的珊瑚色抢注意力）。

`aria-label="登录后台"` 与可见文案「登录」并存的原因：可见文案太短，单靠它无法说明去向；`aria-label` 会覆盖可见文本成为可访问名称，所以写成「登录后台」比「登录」更准确。

### 5. `rel="nofollow"` 的作用边界

`app/robots.ts` 已 `disallow` 了 `/admin`，`rel="nofollow"` 是第二层提示，**不是保护**。它挡不住有意抓取，只减少无谓请求。真正的保护仍然是：后台每个 Server Action / Route Handler 独立鉴权、`(protected)/layout.tsx` 的 `requireAdmin()`、以及后台全量 `noindex,nofollow` + `middleware.ts` 的 `X-Robots-Tag`。

因此这个按钮不构成新的攻击面：它只是一条指向已受保护区域的普通链接。

### 6. 移动端布局

`primaryNav` 的栏目链接本身在 `sm` 以下隐藏（既有行为，靠快捷入口与页脚导航）。按钮在 390px 下仍可见：实测 `w=54 h=49 left=322`，`scrollWidth=390 clientWidth=390`，无页面级横向溢出。`gap-2.5`（10px）在移动端比桌面的 `18px` 更紧，避免把品牌挤掉。

### 7. 有意未做

- **不显示登录态**：按钮固定文案「登录」，不做「后台」/「退出」。判断登录态需要 cookie，会让公开页变 Dynamic。
- **不加退出入口**：退出在后台侧栏（POST Server Action），符合「退出不用可被预取的 GET」。
- **不做下拉菜单**：只有一项，折叠没有收益。

### 8. 验证

**静态断言**（`.me/tmp/entry-check.mjs`，真实 `next start` + 真实 PostgreSQL，**50/50 PASS**）：

- 五个公开页（`/`、`/about`、`/posts`、`/timeline`、`/stats`）各 9 项：返回 200、存在 `href="/admin"` 锚点、带 `rel="nofollow"`、带 `aria-label="登录后台"`、带 `toy-button` 类、内层无嵌套 `a`/`button`、主导航 landmark 存在、**主导航 landmark 内不含 `/admin`**、主导航仍含四个栏目链接；
- `/admin` 未登录仍是 307 且 `location=/admin/login?next=%2Fadmin`，响应带 `X-Robots-Tag: noindex, nofollow`；
- `/` 仍是预渲染静态页（`x-nextjs-cache: HIT`）；
- `robots.txt` 仍 `Disallow: /admin`。

**真实浏览器 DOM 断言**（`.me/tmp/dom-entry.mjs`，CDP 驱动系统无头 Edge，**13/13 PASS**）：

- 390px：无横向溢出、按钮可见、高 49px ≥ 44px、落在视口内；
- 键盘 Tab 可聚焦到该按钮，焦点环为 `solid 4px rgb(141, 209, 255)`（`--focus`，不是 none）；
- 真实点击后落到 `http://127.0.0.1:3000/admin/login?next=%2Fadmin`；
- 登录页有邮箱输入框、提交按钮、`noindex, nofollow`、「管理员登录」标题。

**构建与回归**：

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | **0** |
| `npm run build`（有库） | **0**，12 个静态页，`/` 仍 ○、`/posts/[slug]` 仍 ●、`/admin/*` 仍 ƒ |
| `npm run build`（无 `DATABASE_URL`） | **0**，路由类型与有库完全一致 |
| 既有回归 `.me/verify/e2e.mjs` | **32/32 PASS** |
| `.next/static` 泄漏扫描 | **1 条**，仍是 `like-button.tsx` 的文案，良性 |
| `%TSD` 加密扫描 | **0 命中** |

### 9. 未验证范围

- 未做视觉截图与人工审美验收（只有 DOM 边界值断言）。
- 未在真实手机上验证，只用 CDP 的 390×844 视口模拟。
- 未验证屏幕阅读器实际朗读顺序（只断言了 landmark 归属）。
- 深色主题下按钮对比度未单独测算（沿用 `--cream` / `--cream-base` 既有色对，未新增色彩）。

## D-19 文章列表整卡可点：stretched link 而非 `<a>` 包整卡

**决策**：`/posts` 列表卡的根元素保持 `<article class="toy-card toy-card--pressable">`，主链接（标题）加 `toy-card__link` 类，用 `::after` 伪元素以 `inset: 0` 铺满整张卡，成为卡片唯一的可点主链接；卡内的次级链接（标签 chip）加 `toy-card__aside` 类并 `z-index: 1` 浮到覆盖层之上。

### 1. 为什么不能用 `<a>` 包住整张卡

列表卡里还有标签 chip 链接（`/posts?tag=...`）。`<a>` 嵌套 `<a>` 是**非法 HTML**，浏览器会把标签链接强行从外层锚点里拆出来，结构错乱，读屏与键盘焦点顺序都会坏掉。

### 2. 为什么原有规则不生效（这是「整卡既不可点也没有按压反馈」的直接原因）

`globals.css` 里 `.toy-card` 的交互规则只写成：

```css
a.toy-card:hover { ... }
button.toy-card:hover { ... }
a.toy-card:active { ... }
button.toy-card:active { ... }
```

列表卡的根元素是 `<article>`，一条都不匹配。所以它既没有 hover 抬升，也没有 active 按压感。

### 3. 新增的 CSS（与 `.toy-card` 圆角一致）

```css
.toy-card--pressable { position: relative; cursor: pointer; }
.toy-card--pressable:hover { transform: translateY(-11px); box-shadow: 0 11px 0 var(--card-base); filter: brightness(1.02); }
.toy-card--pressable:active { transform: translateY(-1px); box-shadow: 0 1px 0 var(--card-base); }
.toy-card__link::after { content: ''; position: absolute; inset: 0; border-radius: 18px; }
.toy-card__aside { position: relative; z-index: 1; }
```

- `.toy-card` 自身有 `transform`，已经是定位包含块；`.toy-card--pressable` 显式加 `position: relative` 更稳。
- `border-radius: 18px` 与 `.toy-card` 一致，避免卡片四角外也响应点击。
- **`.toy-card__aside` 的 `z-index: 1` 是必需项**，没有它标签 chip 永远点不到（会被 `inset: 0` 的覆盖层吃掉点击）。

### 4. 验证

真实无头 Edge + CDP，**12/12 PASS**，其中关键三条：

- `document.elementFromPoint()` 探针在卡片右下角空白处命中主链接覆盖层：`hit=A href=/posts/playful-recorder`。
- 真实鼠标点击卡片空白处，跳转到 `/posts/playful-recorder`（与卡片主链接一致）。
- 真实鼠标点击标签 chip，跳到 `/posts?tag=设计系统`（走筛选而非详情）。

### 5. 写 CSS 产物断言必须注意

cssnano/PostCSS 会把 `::after` 规范化为单冒号，产物里是 `.toy-card__link:after`。断言必须写成 `/\.toy-card__link:{1,2}after/`，不能写死双冒号 —— 否则会得到假失败。

---

## D-20 图标用 Material Symbols 的**内联 SVG**，不引 Google Fonts 字体

**决策**：图标数据取自 https://fonts.google.com/icons 的 Material Symbols（Outlined），但以**内联 SVG path** 形式内置在 `components/ui/icon.tsx`（24 个图标，`iconPaths` 常量表 + `<Icon>` 组件），**不引 Material Symbols 字体、不引任何 CDN**。

### 1. 为什么不引字体（四条理由）

1. **外部字体要请求 `fonts.googleapis.com`**，属第三方请求 —— 隐私与可用性都变差；离线或内网环境下图标会退化成连字文本（把 `home` 直接显示成单词）。
2. **字体加载有 FOUT**，首屏会闪一下连字名。
3. **字体要下整个子集**才能覆盖若干图标；内联 SVG 每个只有几十到几百字节，并且天然跟随 `currentColor`，明暗主题不用额外处理。
4. **保持零运行时依赖、零外部请求**，静态生成与 CSP 都不受影响。这是 REQ-NFR-001 的直接要求。

### 2. path 数据来源（Apache-2.0）

取自 `google/material-design-icons` 仓库，两个 URL 内容一致：

- `https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/<name>/materialsymbolsoutlined/<name>_24px.svg`（主源）
- `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/<name>/default/24px.svg`（备用源，GitHub raw 偶发 `UND_ERR_CONNECT_TIMEOUT`）

### 3. 两个真实的坑（必须记住，否则图标会「看起来像空白」）

#### 坑一：Material Symbols 有**两套坐标系**

- 绝大多数新版图标输出 `viewBox="0 -960 960 960"`（坐标系整体上移 960）。
- `insights` 与 `auto_awesome` 这类旧式图标**源 SVG 压根没有 `viewBox` 属性**，只有 `height="24" width="24"`，坐标系是 `0 0 24 24`。

**写死任何一个都会让另一类图标整体偏移出画面。** 正确读法：

```js
const explicitViewBox = svg.match(/viewBox="([^"]+)"/)?.[1]
const width = svg.match(/\swidth="([0-9.]+)"/)?.[1] ?? '24'
const height = svg.match(/\sheight="([0-9.]+)"/)?.[1] ?? '24'
const viewBox = explicitViewBox ?? `0 0 ${width} ${height}`
```

`<Icon>` 组件因此**逐图标取 viewBox**，不写默认值。

#### 坑二：`favorite_border` 在 Symbols 里不存在（404）

Material **Icons** 用 `_border` 后缀表示空心态；Material **Symbols** 用**可变字重**（`FILL 0/1`、`wght`）表达填充度，**没有 `_border` 系列**。所以点赞按钮用 `heart_minus` / `heart_plus`（空心）与 `favorite`（实心），不用 `favorite_border`。

### 4. 校验脚本的两个细节

- **path 起始绝对移动命令的坐标必须落在 viewBox 内**。不能「把所有数字都当坐标」——相对坐标（如 `-.825`）会被误判成越界。
- **正则第二个数前的分隔符是可选的**：`/^[Mm]\s*(-?[\d.]+)[\s,]?(-?[\d.]+)/`。因为 SVG path 允许 `M160-400` 这种省略分隔符的写法（`edit_note` 就是这样）。

### 5. 组件不变量

`<Icon>` 一律输出 `aria-hidden="true"` + `focusable="false"`；**语义必须由旁边的文字或调用处的 `aria-label` 承担**。这符合设计 module 02 §7「图标缺失时仍有文字」—— 两者必须同时出现，不允许只渲染图标。

### 6. 落地范围（17 个文件）

| 位置 | 图标 |
| --- | --- |
| `config/timeline.ts`（6 个类型） | `edit_note` / `emoji_events` / `folder_special` / `rocket_launch` / `flight` / `menu_book` |
| `config/site.ts`（6 个快捷入口） | `article` / `timeline` / `insights` / `person` / `north_east` / `rss_feed` |
| `components/site/quick-link-bar.tsx` | 由 `link.icon` 驱动 |
| `components/timeline/timeline-card.tsx` | 由 `typeStyle.icon` 驱动 |
| `components/ui/theme-toggle.tsx` | `light_mode` / `dark_mode` |
| `components/site/site-header.tsx` | 品牌标记 `auto_awesome`（**视觉改变，不是纯替换**：原来是 `border-[3px]` 空心圆） |
| `components/site/site-footer.tsx` | `north_east` |
| `components/interactions/like-button.tsx` | `favorite` / `heart_minus` |
| `app/(site)/about/page.tsx` | `sentiment_satisfied`（64px） |
| `app/(site)/posts/page.tsx` | 占位 `auto_awesome` + 分页 `arrow_back` / `arrow_forward` |
| `app/(site)/page.tsx` | 占位 `auto_awesome` + `arrow_forward` / `auto_awesome` |
| `app/(site)/posts/[slug]/page.tsx` | `arrow_back` |
| `app/(site)/timeline/[id]/page.tsx` | `north_east` / `north` / `south` / `arrow_back`，**以及类型徽标由 `typeStyle.icon` 驱动** |
| `app/admin/(protected)/layout.tsx` | `north_east` |
| `app/admin/(protected)/posts/post-editor.tsx` | `arrow_back` |
| `app/admin/(protected)/timeline/page.tsx` | `north_east` |
| `app/admin/(protected)/page.tsx` | `arrow_forward` |

`open_in_new` 已抓取但当前没有使用者（刻意保留，后续加图标不必重跑生成脚本）。

### 7. 验证

真实无头 Edge + CDP（系统 Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，`--headless=new`）。

**种子数据实例（无 `DATABASE_URL`）：15/15 PASS**

- 首页 6 个快捷入口各有 1 个内联 SVG。
- 首页全部 SVG 的 `path d` 非空、渲染尺寸非零（`bad=0`、`zero=0`）。
- **SVG 的 viewBox 同时出现 `0 0 24 24` 与 `0 -960 960 960` 两种** —— 证明逐图标取 viewBox 生效。
- `document.body.innerText` 无残留字符图标（`✹ ☼ ☾ ♥ ♡ ☺ ↗ ← → ↑ ↓ ▤ ◌ ◒ ◍ ✎ ✦ ◆ ▲ ➤ ❏` 全部 0 命中）。
- `innerText` 无 Material Symbols 连字名（`auto_awesome` / `arrow_back` / `light_mode` 等）—— 证明没有悄悄退化成字体。
- 主题开关按钮内 2 个 SVG；页头品牌标记 1 个 SVG。
- 文章列表卡占位区是 `auto_awesome`，且卡片仍只有一个主链接 `toy-card__link`。
- 详情页返回链接含 1 个 `arrow_back`。
- 时间轴 14 张卡片的类型徽标各含 1 个 SVG 且带类型文字。
- 390px 视口下 SVG 仍有非零尺寸、无横向溢出。
- 页面 HTML 不含 `fonts.googleapis.com` / `fonts.gstatic.com`，也没有 `material-symbols` / `material-icons` 类名。

**有库实例：14/15 PASS** —— 唯一未过的是「时间轴徽标」，因为 `timeline_items` 表当前为空，页面渲染「共 0 条记录」。这不是图标缺陷，时间轴图标已在种子实例上单独验证（7/7 PASS）。

**构建**

| 项 | 结果 |
| --- | --- |
| `npm run typecheck` | **0** |
| `build`（有库） | **0**，13 个静态页，路由类型不退化 |
| `build`（无 `DATABASE_URL`） | **0**，26 个静态页（种子数据），路由类型一致 |
| `.next/static` 泄漏扫描 | **1 条**，仍是 `like-button.tsx` 的文案，良性 |
| `%TSD` 加密扫描 | **0 命中** |

路由矩阵（有库）：`/`、`/about`、`/timeline`、`/robots.txt`、`/rss.xml`、`/sitemap.xml`、`/stats` 为 ○ Static；`/posts/[slug]`、`/timeline/[id]` 为 ● SSG；`/posts`、`/admin/*`、`/api/*` 为 ƒ Dynamic。共享 First Load JS **103 kB** 未变。

### 8. 本次验证抓到的一个真实遗漏

`app/(site)/timeline/[id]/page.tsx` 第 99 行原本仍是 `<span aria-hidden="true">{typeStyle.icon}</span>`。由于 `typeStyle.icon` 从字符变成了 `'rocket_launch'` 这类图标名，这一行会把裸图标名当文本渲染出来。已改为 `<Icon name={typeStyle.icon} size={12} />`。

**教训**：把「字符字段」改成「图标名字段」时，必须全仓扫描该字段的**每一个**渲染点（`{typeStyle.icon}` / `{link.icon}` / `{item.icon}` / `{tone.icon}`），不能只改记得住的那几处。`typecheck` 抓不到这种漏改 —— 字符串渲染字符串，类型完全合法。**只有真实浏览器断言 `innerText` 才能发现它。**

### 9. 未验证范围

- 未做视觉截图与人工审美验收（只有 DOM 与几何断言）。
- 未测屏幕阅读器实际朗读顺序（只断言了 `aria-hidden` 与语言文本共存）。
- 深色主题下新图标对比度未单独测算（图标用 `currentColor` 继承文字色，理论上与文字一致，但无实测数据）。
- 未在真实手机上验证，只用 CDP 的 390×844 视口模拟。
- `insights` / `auto_awesome` 使用 24×24 坐标系，在同等 `size` 下视觉重量与 960×960 坐标系图标可能略有差异 —— 属视觉问题，未量化。

---

## D-21 主题开关：滑块与图标共用「停靠位」，不用 `justify-between`

**问题来源**：用户报告「顶部的明暗主题开关显示是异常的」，未说明具体表现，因此靠真实浏览器实测定位。

### 1. 实测得到的真实缺陷

CDP 对 `button[aria-pressed]` 及其子元素取 `getBoundingClientRect()`，1440px 视口：

| 量 | 日间态 | 夜间态 |
| --- | --- | --- |
| 按钮 / 按钮面 | `74 × 39` | `74 × 39` |
| 滑块 `left / right` | 1187.5 / 1214.5 | 1214.5 / **1241.5** |
| 按钮面 `right` | 1238 | 1238 |
| **滑块右溢出按钮面** | −23.5（未溢出） | **+3.5（溢出）** |
| 滑块与月亮图标重叠面积 | 0 | **196 px²（14×14 全重叠）** |
| 滑块中心 vs 按钮面中心 | 同心（52.5） | 同心 |
| 页头各控件垂直中心 | 全部 52.5，spread 0 | 同 |

**两条并存的缺陷**：

1. **夜间态滑块右移 27px 后超出按钮面 3.5px**，溢出到 `rounded-full` 圆角之外。
2. **滑块完全压住月亮图标（196 px² = 14×14 整块）**，夜间态看不到月亮。

**日间态同样有问题**：滑块 `left=1187.5` 而按钮面 `left=1164`，即滑块并没有停在左端，而是**夹在太阳与月亮中间偏左**——因为 `justify-between` 把三个子项（14 + 27 + 14 = 55px）摊在 58px 内容宽里，只剩 3px 分给两个间隙，滑块被推到中间。用户看到的就是「滑块没靠边、压着图标」。

### 2. 根因：`justify-between` 不适合三子项的开关

原实现同时用 `flex + justify-between` **又** 给滑块加 `translateX(27px)` 位移。这两套机制互相打架：

- `justify-between` 已经把滑块放在「中间」这个静态位置；
- `translateX(27px)` 是在那个位置上再加位移，而不是「从左端移到右端」。

于是夜间态位移量 = `27（居中偏移） + 27（位移）`，直接冲出按钮面。

**正确的口径**：滑块的位置只能由**一个**机制决定 —— 要么全交 flex 排布，要么全交绝对定位 + `translateX`。混用必然对不上。

### 3. 设计稿 demo 也有同一个 bug（不能照抄）

`demo/theme-system-demo.html` 用同一套 `.toggle-top{justify-content:space-between}` + `[data-theme=night] .knob{transform:translateX(27px)}`。实测该 demo 夜间态滑块右溢出 **+5.41px**（比 React 版更严重，因为 demo 用文字字形 ☼/☾ 宽度不同）。**所以设计稿不能作为几何正确性的依据**，只有实测量值能。

### 4. 采用的方案

**滑块与两个图标共用同一套 27×27「停靠位」**：左侧停靠位 `left: 6px`、右侧停靠位 `right: 6px`，间距 = `74 − 6 − 6 − 27 = 35px`，正好等于夜间态位移量。

```
按钮 74×39
├─ 底座  span  absolute inset-x-0 bottom-0 top-[6px]   背景 --pink-base
└─ 按钮面 span absolute inset-0 rounded-full            背景 --pink
   ├─ 滑块  absolute left-[6px] top-[6px] 27×27         translateX(0 | 35px)
   ├─ 太阳  absolute left-[6px]  top-[6px] 27×27 flex 居中  ← 渲染在滑块之后
   └─ 月亮  absolute right-[6px] top-[6px] 27×27 flex 居中  ← 渲染在滑块之后
```

**为什么图标要渲染在滑块之后**：同一定位上下文里，后来者在上。图标叠在滑块之上，于是「滑块停在哪，哪个图标就落在滑块中央」，日/夜两态都不必移动图标，也不会互相遮挡。这是 iOS 风格开关的通行做法，且视觉上把「当前主题」与滑块绑定得更明确。

**为什么用 `left-[6px]` 而不是 flex + `padding`**：绝对定位让位置是一元确定的，不再有「flex 排布 + transform 位移」两个来源。`6px` 与底座的 `top-[6px]` 同值，视觉上滑块的四边留白一致。

### 5. 保留与放弃

| 项 | 处置 |
| --- | --- |
| `<Icon name="light_mode" />` / `<Icon name="dark_mode" />` | **保留**，只改外层定位容器 |
| `aria-pressed` / `aria-label` 日/夜切换 | **保留**，全部 37 项断言里逐条验过 |
| 两个 `aria-hidden="true"` 的 span（底座、按钮面） | **保留**（图标本身就是 `aria-hidden`） |
| `useSyncExternalStore` + `MutationObserver` 读 `data-theme` | **保留**，未改 |
| cookie `THEME_COOKIE` / `max-age=31536000` / `samesite=lax` | **保留** |
| 根布局静态输出 `data-theme="light"` + head 内联脚本校正（D-08） | **保留**，未引入服务端 `cookies()` |
| `active:translate-y-[3px]` 按下位移 | **保留**（原样） |
| `transition-transform duration-200` 滑块位移 | **保留** |
| `justify-between` + `px-2 py-1` | **移除** —— 正是缺陷来源 |
| `overflow: hidden` | **坚决不用** —— 会把两个 14px 图标一起裁掉，属掩盖而非修复 |

`prefers-reduced-motion` 无需额外处理：`app/globals.css` 已有全局 `@media (prefers-reduced-motion: reduce)` 规则统一禁用过渡。

### 6. 验证（真实无头 Edge + CDP，1440px 与 390px 两套视口）

**37/37 PASS。** 覆盖日间 → 夜间 → 回到日间三个状态，每个状态都重复同一组几何断言：

| 断言 | 日间 | 夜间 |
| --- | --- | --- |
| 开关尺寸 74×39 | 74×39 | 74×39 |
| 两个图标 14×14 | [14,14] | [14,14] |
| 图标在按钮面内（不被圆角裁掉） | [true,true] | [true,true] |
| 滑块四向不溢出（L/R/T/B ≤ 0.5） | −6 / −41 / −6 / −6 | −41 / −6 / −6 / −6 |
| 滑块停靠端内缩 6px | 6 | 6 |
| 当前图标与滑块同心（偏差 < 0.6px） | 0 | 0 |
| 对面图标不被滑块遮挡（重叠 0） | 0 | 0 |
| 两个图标中心点都命中自身 svg/path | svg / path | svg / path |
| 与页头其它控件垂直中心 spread | 0.00 | 0.00 |

交互与持久化：`data-theme` 正确翻转 `light ↔ night`、`aria-pressed` `false ↔ true`、`aria-label` 在「切换晚间主题 / 切换日间主题」之间切换、cookie 写入 `playbook-theme=night`、再点一次能回到日间（可逆）。390px 视口下仍 `74×39`、滑块不溢出、图标在面内。

`npm run typecheck` = **0**。dev server 的 `/`、`/posts`、`/timeline`、`/about`、`/stats` 全部 **200**。

### 7. 一眼能看出的布局不变量（回归时先查这两条）

1. **夜间态滑块右边缘不得超出按钮面右边缘**（`knob.right <= cap.right + 0.5`）。
2. **当前图标必须与滑块同心、对面图标与滑块重叠面积为 0**。

这两条只要有一条不成立，就说明又退回了「flex 排布 + transform 位移」混用。

### 8. 未验证范围

- 未测屏幕阅读器实际朗读顺序（只断言了 `aria-pressed` / `aria-label` 的正确性与切换）。
- 深色主题下滑块与图标的对比度未做像素级测算（只目视确认可辨）。
- 未在真实手机上验证，只用 CDP 的 390×844 视口模拟。
- 触控目标仍是 `74×39`（高 39px < 44px 通用建议值），与修复前一致，未放大 —— 放大到 44px 会改变页头高度与其它控件对齐，属另一个决策。

---

## D-22 · 5 色配色体系：`config/palette.ts` 是唯一颜色来源，其余全部由它派生

### 1. 需求与判定标准

用户要求：建立 **5 种**颜色的配色体系；**web 中所有元素都遵循这些配色**；这 5 种颜色**可随意配置**；参考 `img/` 里的色卡。

四条需求逐条落到可验收的标准上：

| 需求 | 可验收的形态 |
| --- | --- |
| 「5 种颜色作为体系」 | 5 个色值是**唯一来源**，其余每个颜色都由它们派生，不存在第 6、第 7 个自由选择的颜色 |
| 「所有元素都遵循」 | 全部语义 token（canvas / ink / muted / line / surface / soft / shell / focus / shadow + 6 个色对）都由这 5 色产出；业务代码里不得出现十六进制 |
| 「可随意配置」 | 改一处 5 元组即全站跟随；换色后**自动**保证正文可读 |
| 「参考色卡」 | 用户 5 张色卡作为预设，逐位对应，可直接切换 |

**这不是「把 6 个强调色换成 6 个新色值」**。改造前的项目用 6 个彼此独立的色对（coral / pink / cream / mint / sky / lilac）+ 一套中性色，共十几个硬编码决策点。若只是换色值，仍然是十几个点各改一次，不构成「体系」。因此本决策的实质是**把颜色决策点从十几个收敛到 5 个**。

### 2. 5 个颜色的槽位语义（固定，不可改）

| 槽位 | 角色 | 派生去向 |
| --- | --- | --- |
| `--palette-1` | 主强调色 | coral（主 CTA）、pink 与 lilac（提亮或与 p3 混合）、shell |
| `--palette-2` | 次强调色 | mint、cream（提亮成浅底）、canvas / surface / soft（都是它的高亮度淡彩） |
| `--palette-3` | 第三强调色 | sky、focus 焦点环、lilac（与 p1 混合） |
| `--palette-4` | 深中性色 1 | 预留槽位（当前由 5 号派生，保留以对齐色卡的五色结构） |
| `--palette-5` | 深中性色 2（最深） | canvas / ink / muted / line / grid / surface / shadow 的压暗来源 |

**硬约束：最深的那位必须放第 5 位。** 正文色 `--ink` 由 p5 压暗得到；若把浅色放在第 5 位，正文会变成浅字压浅底，无论怎么求解对比度都得不到自然的结果（只能被 `ensureContrast` 强行推成近乎纯黑，等于放弃了配色的中性基调）。

### 3. 为什么派生放在 TypeScript，而不是 CSS `color-mix()`

原始计划（WorkMap `plan-e0ad1317` 的描述）写的是「globals.css 用 `color-mix()` 派生」。实现时改掉了，三条理由：

1. **对比度必须能算。** 按钮面永远是亮色、文字永远是暗色，这需要真实的 WCAG 相对亮度判断与分支。CSS 无法按亮度分支，只能写死；TS 可以算。
2. **可以在 Node 里断言。** 派生结果与对比度能直接跑脚本验证，不用开浏览器就能发现「某个预设的按钮文字看不清」。
3. **不依赖浏览器特性。** `color-mix()` 在旧浏览器上整条失效，会导致颜色全丢。

代价是**换配色需要重新构建**。这是可接受的：配色属于站点身份，不是运行时开关；而且保住构建期常量恰好是不破坏静态渲染（D-08 / REQ-NFR-001）的前提。

### 4. 白与黑不是第 6、第 7 个颜色

派生需要「往亮里调」与「往暗里调」两个端点，由纯白 `#ffffff` 与纯黑 `#000000` 承担。它们**不参与配色决策**，只作为混合端点 —— 任何配色系统都躲不开这一步。因此 `WHITE` / `BLACK` 是派生层的常量，不在 `config/palette.ts` 的 5 元组里，也不算「第六种颜色」。

### 5. 核心算法：以对比度为约束求解，而不是猜混合比例

第一版用固定混合比例（例如「往白里混 62% 得到 muted」）写死派生，跑出 **297/324（27 项 FAIL）**：

```
FAIL  [classic/light] --muted on --canvas >= 3.5 :: 2.35 (#aba6ab on #f9fefc)
FAIL  [tide/light]    --ink on --canvas >= 7    :: 6.41 (#615c56 on #fefbf7)
FAIL  [tide/light]    --muted on --canvas >= 3.5 :: 1.62 (#cac8c5 on #fefbf7)
FAIL  [harbor/light]  --muted on --canvas >= 3.5 :: 1.95 (#a8b8c7 on #f4fcfb)
FAIL  [meadow/light]  --muted on --canvas >= 3.5 :: 1.73 (#c2c0be on #fdf9f7)
FAIL  [tide/night]    --ink on --surface >= 7   :: 3.96 (#fef9f4 on #817c75)
```

根因：不同色卡的明度差得很远（`#0063bf` 与 `#59ddaf` 亮度天差地别），固定比例不可能同时成立。只调比例数值则是**每次调好一套就弄坏另一套**，无解。

改用：

```
ensureContrast(color, against | against[], target, direction: 'lighter' | 'darker')
```

- 起点已达标 → 直接返回（不无故改动配色本来的观感）。
- 否则朝 `direction` 方向以 **0.02 步长**逐步调整，直到达到 `target`。

于是「文字读得清」是**构造出来的保证**，不是碰巧。

#### 两个必需的细节（都是实测踩出来的）

1. **`against` 必须能传数组，且必须全部达标。** 文字实际会同时出现在 `canvas` 与 `surface` 上，只对其中一个求解会在另一个上不达标。这是实测的 5 项 FAIL：`meadow/light` 的 `--muted` 在 canvas 上 4.42、`tide/night` 的 `--ink` 在 surface 上 6.98。日间 `surface` 比 `canvas` 浅，深色文字对比度更高，最差情况是 canvas；夜间 `surface` 比 `canvas` 亮，浅色文字对比度更低，最差情况是 surface。所以所有文字 token 一律传 `[canvas, surface]`。
2. **比较前必须先过 hex 舍入。** 最终写进 CSS 的是 `toHex()` 舍入后的值，拿未舍入的浮点去判定会出现「算出来 7.00、写出去 6.98」。做法是 `const round = (c) => parseHex(toHex(c))`，refs、起点、每个候选值全部先 `round` 再判定。

### 6. 日夜两套派生公式

日间（`deriveLightTokens`）：

```
canvas  = tint(p2, 0.95)                                  // 次强调色的高亮淡彩
surface = tint(p2, 0.985)
ink     = ensureContrast(shade(p5, 0.16), [canvas, surface], 7, 'darker')
muted   = ensureContrast(mix(ink, canvas, 0.45), [canvas, surface], 4.5, 'darker')
onAccent= shade(p5, 0.34)
soft    = tint(p2, 0.84)
shell   = tint(p1, 0.72)
line    = alpha(p5, 0.12)
grid    = alpha(p5, 0.08)
focus   = ensureContrast(p3, canvas, 3, 'darker')
shadow  = `0 9px 0 ${alpha(shade(p5, 0.1), 0.16)}`

coral/pink/cream/mint/sky/lilac  = capOn(基底, onAccent)   // 提亮到 on-accent 达 4.5:1
coral-base = shade(p1, 0.58)   pink-base  = shade(p1, 0.5)
cream-base = shade(p2, 0.45)   mint-base  = shade(p2, 0.45)
sky-base   = shade(p3, 0.45)
lilac-base = shade(mix(p1, p3, 0.5), 0.5)
```

夜间（`deriveNightTokens`）：

```
canvas  = shade(p5, 0.34)
surface = tint(canvas, 0.08)          // 从 canvas 提亮，不是从 p5 提亮
ink     = ensureContrast(tint(p2, 0.9), [canvas, surface], 7, 'lighter')
muted   = ensureContrast(mix(canvas, ink, 0.6), [canvas, surface], 4.5, 'lighter')
soft    = tint(canvas, 0.14)
shell   = tint(p1, 0.18)
focus   = ensureContrast(tint(p3, 0.25), canvas, 3, 'lighter')
shadow  = `0 9px 0 ${alpha(BLACK, 0.3)}`
各 base = shade(…, 0.6 ~ 0.7)
```

两处起点选择的理由：

- **日间 `muted` 的起点用「正文与画布的中点」，而不是固定往白里混。** 浅色卡上往白里混会直接把次要文字糊掉。
- **夜间 `--surface` 必须从 `canvas` 提亮，不能从 `p5` 提亮。** 后者在浅色卡上会直接跳到中间灰：`tide` 卡的最深色是 `#736d66`（本身已是中灰），再提亮 10% 得到 `#817c75`，夜间一片灰蒙蒙，`--ink` 在其上只有 3.96:1。改从 `canvas`（已压暗 34%）提亮 8%，只会得到「比画布略亮的表面」，符合同一个玩具盒关灯之后的设计意图。

### 7. 注入方式：`<style>`，不是 inline style

根布局 `app/layout.tsx` 的 `<head>` 里：

```tsx
<style dangerouslySetInnerHTML={{ __html: paletteCss }} />
<script dangerouslySetInnerHTML={{ __html: themeScript }} />
```

**为什么不能用给 `<html>` 加 inline style**：派生结果同时包含 `:root`（日间）与 `:root[data-theme='night']`（夜间）两套选择器。inline style 只能表达一个元素上的一组属性，无法携带选择器，夜间态会整段失效。

**这段 CSS 是构建期常量**（模块顶层 `const paletteCss = buildPaletteCss(resolvePaletteColors())`），因此不破坏静态渲染：根布局仍然没有调用 `cookies()` / `headers()`，D-08 与 REQ-NFR-001 都不破。`<style>` 放在 `<script>` 之前 —— 配色必须先于主题脚本生效。

### 8. `globals.css` 不再定义任何颜色 token

`app/globals.css` 的 `:root` 现在只剩几何：`--button-height / --button-depth / --button-radius / --button-hover-lift / --button-pressed-reveal / --button-duration / --header-height`。

**这是「5 色体系不退化回硬编码」的结构性保证**：颜色只由一个地方产出，因此不存在「两处定义谁覆盖谁」的顺序问题，也不会有某个人顺手在 CSS 里加一个十六进制而没人发现。文件顶部写了注释说明这一点。

配套改动：

- 6 个 `ToyButton` 色对变体原先各自写死一个文字色（`#341624 / #42220e / #10392b / #15344e / #3c1440`），换配色后这些值会与新的按钮面撞色。全部收敛为 `color: var(--on-accent)`。
- `--on-accent` 由 p5 派生（`shade(p5, 0.34)`），并对 6 个 cap **逐个**验证 ≥ 4.5:1。

### 9. 组件硬编码颜色清除

盘点（`Select-String` 全量扫描 `var(--*)` 与 `#[0-9a-fA-F]{3,8}` / `rgba(`）结论：**组件本来就只引用语义 token，没有散落的十六进制**，只有 6 处需要清除。

| 文件 | 原值 | 改为 |
| --- | --- | --- |
| `app/(site)/page.tsx:52` | `#4a2d11`（cream 徽标） | `var(--on-accent)` |
| `app/(site)/page.tsx:93` | `#352111` | `var(--on-accent)` |
| `components/site/activity-feed.tsx:68` | `#4a2d11` | `var(--on-accent)` |
| `components/timeline/timeline-card.tsx:29` | `#211522` | `var(--on-accent)` |
| `components/ui/theme-toggle.tsx:68` | `#28152b` | `var(--on-accent)` |
| `components/ui/theme-toggle.tsx:74` | `inset -3px -3px 0 rgba(100,61,0,.12)` | `inset -3px -3px 0 var(--line)` |

改造后同一扫描只剩 **1 条命中**，且是 `globals.css` 里我自己写的注释文字（`#341624 / #42220e / #10392b / …`），硬编码归零。

**结论：只要重建 token 派生层，全站自动跟随 5 色，无需逐个改组件。** 这正是「5 色是唯一来源」这个架构选择带来的直接收益。

### 10. 三种配置方式（按优先级）

1. `config/palette.ts` 里 `customColors: PaletteColors | null` —— **最高优先级**。填了它，环境变量与默认预设都失效。
2. 环境变量 `NEXT_PUBLIC_PALETTE=<预设 id>`。
3. `DEFAULT_PALETTE_ID`（默认 `'classic'`）。

```ts
// 方式 1（最简单）：直接写 5 个色值
export const customColors: PaletteColors | null = ['#主强调', '#次强调', '#第三强调', '#深中性1', '#最深']

// 方式 2：换预设
export const DEFAULT_PALETTE_ID: PaletteId = 'harbor'
```

**环境变量写错时静默回落到默认预设** —— 配色配错不应该让整站构建失败。

### 11. 6 套预设

| id | 名称 | 5 色 |
| --- | --- | --- |
| `classic` | 玩具盒（项目原有基线，默认） | `#ff656c` `#82e2bf` `#8dd1ff` `#3a2430` `#211522` |
| `tide` | 潮汐（色卡 1） | `#64f1e8` `#f2ac63` `#f27a63` `#667372` `#736d66` |
| `harbor` | 港湾（色卡 2） | `#0063bf` `#28bfb8` `#bfad5a` `#bf7600` `#19436b` |
| `sunrise` | 日出（色卡 3） | `#24bbec` `#eda724` `#ed6724` `#47646e` `#6e6047` |
| `meadow` | 草甸（色卡 4） | `#59ddaf` `#de8959` `#de5b59` `#555e5b` `#5e5855` |
| `ember` | 余烬（色卡 5） | `#f8105e` `#c43363` `#91435d` `#5e3e49` `#332c2e` |

`classic` 是项目原有视觉基线，默认选中，**保证引入本体系后站点外观不发生回归**。后 5 套逐位取自用户参考色卡（`img/Snipaste_2026-10-23_*.png`），顺序与色卡的亮→暗排列逐位对应。

### 12. 可读性目标（构造出来的保证）

| token | 目标 | 背景 |
| --- | --- | --- |
| `--ink` | ≥ **7:1**（AAA） | canvas **与** surface 都要满足（soft 上只有 0.875rem 的代码块，按 4.5 判） |
| `--muted` | ≥ **4.5:1**（AA） | canvas、surface **与 soft** 都要满足（D-33 补上 soft） |
| `--link` | ≥ **4.5:1**（AA） | canvas、surface 与 soft 都要满足（D-33 新增） |
| `--on-accent` 在 6 个 cap 上 | 各自 ≥ **4.5:1**（AA） | 逐个验证 |
| cap vs base | ≥ **2:1** | 保证立体按钮的厚度感不消失 |
| `--focus` | ≥ **3:1**（非文本） | canvas |
| 5 个源色两两 | 曼哈顿距离 ≥ **16** | 保证色卡不是同一色重复五次 |
| 夜间 canvas 与日间 canvas | 通道差 ≥ **5** | 保证两态确实是两套配色 |

**源色可辨阈值为什么是 16 而不是 24**：草甸卡的 `#555e5b` 与 `#5e5855` 曼哈顿距离只有 **21** —— 那是**用户色卡本来的设计**，两个相近的深中性色用来产生细微层次。阈值定在 24 等于在**惩罚用户的配色选择**，而不是在验证代码。真正需要保证的只是「不是同一色重复五次」，16 足够。这个理由写在了验证脚本的注释里，避免以后有人「顺手调严」。

### 13. 验证

#### 13.1 派生层（Node，`330/330 PASS`）

`.me/tmp/palette-check.mjs` 用 `typescript.transpileModule` 把 `lib/theme/palette-css.ts` **就地转译后 import**，预设从 `config/palette.ts` 用正则抠出 —— **不复制公式、不复制色值**，验证的就是产品代码本身。对 6 套预设 × 日夜两态跑 330 项断言，全通过。

#### 13.2 真实浏览器（生产构建副本 3100 端口，`24/24 PASS`）

CDP + 无头 Edge，量 `getComputedStyle` 实际色值：

- 5 个源变量存在且非空；27 个派生 token 无缺失。
- `body` 背景 = `--canvas`、文字 = `--ink`；卡片背景 = `--surface`。
- 主 CTA 底座 = `--coral-base`、按钮面 = `--coral`（**注意 `.toy-button` 是外层底座，`.toy-button__top` 才是按钮面**；且页头「登录」也带 `.toy-button` 类，选择器必须挑「不含 `toy-button--` 变体类」的那个 —— 这是我探针一开始的 bug，产品代码无缺陷）。
- 三个按钮（主 CTA / cream / pink）文字 vs **按钮面**背景对比度 ≥ 4.5。
- 全部 svg 填充色都能匹配某个派生 token（`--ink` / `--on-accent` / `--muted`，容差 ±2）。
- 5 个页面（`/`、`/posts`、`/timeline`、`/about`、`/stats`）token 一致。
- 夜间态 token 正确切换，正文对比度 18.14；1440 与 390 两套视口都无横向溢出。

#### 13.3 6 套预设 × 日夜 12 张整页图（已逐张目视确认）

配色是构建期常量，逐套 build 六次代价过大。改用同一份 `buildPaletteCss()` 在真实页面上注入该预设的 CSS，再整页截图。**注入路径先做了 sanity**：注入 `classic` 后读到的 `--coral` / `--canvas` / `--palette-1` 与构建产物自带值**完全一致**（`SANITY_CLASSIC_MATCH=true`），证明注入的就是构建会产出的东西。

目视结论：6 套预设全部成立，页面结构、按钮立体感、卡片层次都保持；`classic` 与改造前视觉一致（基线未回归）；5 张色卡的原色在实际页面上的观感符合色卡意图（tide 青+奶油、harbor 蓝+米、sunrise 橙蓝、meadow 绿+陶土、ember 玫红+酒红）；**夜间 6 套都没有一套变成灰蒙蒙一片**；正文与按钮文字在全部 12 格里都清晰可读。

#### 13.4 构建

- `npm run typecheck` = **0**。
- 孤立副本 `BC_BUILD=0`（`robocopy` + `mklink /J`，未碰用户 `.next`），First Load JS 与路由类型均未退化。
- 生产构建 HTML 确认 `HAS_STYLE_TAG=True`、`HAS_PALETTE1=True`、`HAS_CANVAS=True`、`LEN=61181`。

> **一个必须记录的误判。** 验证过程中我曾用 `Invoke-WebRequest` 检查 HTML 得到 `HAS_PALETTE1=False`，据此怀疑 Next.js 在 dev 下剥离了 `<head>` 里手写的 `<style>`。**这个结论是错的**：那次请求本身失败（`ERR=无法连接到远程服务器`），`$r` 保留了上一次成功请求的**陈旧值**。真实值是 `True`，已在生产构建副本上确认。教训：`Invoke-WebRequest` 失败时 `$r` 不会清空，用它做断言前必须先确认 `$r` 是本次请求的产物。

### 14. 未验证范围

- 6 套预设里只有 `classic` 做了完整的浏览器 DOM/几何实测（`24/24`），其余 5 套做的是派生层 330 项断言 + 12 张整页图目视，**没有逐套跑 `getComputedStyle` 断言**。
- 屏幕阅读器实际朗读顺序未测。
- 真实手机未测，只用 CDP 的 390×844 视口模拟。
- 色卡原色与派生色的**像素级**观感差异未量化（只目视）。
- 触控目标仍为 39px 高的主题开关（低于 44px 通用建议值），与 D-21 一致，刻意未动。
- 换配色需重新构建这一点的用户体验未优化（没有提供运行时预览页）。

---

## D-23 · 首页 hero 改为「配色实验室」：运行时也能派生，且不比构建期松

### 1. 需求

把首页「快捷入口」上方的标题展示区（原先是静态的 NOW PLAYING 装饰卡）换成可玩性更强的内容：**用户可以选择控制 5 个主题色，并用 HSL 三个滑块调其中某个颜色**。

这直接冲击 D-22 的一个核心设计：配色是**构建期常量**（`<head>` 注入），因为只有这样才能保住根布局的静态渲染（D-08 / REQ-NFR-001）。要让它运行时可调，就不能靠重新构建。

### 2. 最关键的决定：公式只留一份，但 server-only 守卫不能丢

两条路：

| 方案 | 后果 |
| --- | --- |
| 在客户端复制一份派生公式 | 运行时预览与构建产物**必然漂移**，两份公式迟早对不上 |
| 把公式拆进客户端安全的模块 | 服务端与客户端跑同一份代码，但 D-22 那层 server-only 保护要重新安排 |

选了后者，拆成：

```
lib/theme/palette-core.ts   纯色彩数学。无 server-only、无 process.env、无 DOM、无副作用
        ↑                   服务端与客户端都 import 它
lib/theme/palette-css.ts    `import 'server-only'` + re-export 薄壳
        ↑                   只有 app/layout.tsx 从这里 import
```

**为什么薄壳还要留着 server-only**：一旦有人在客户端组件里 `import '@/lib/theme/palette-css'`，构建期就报错，而不是悄悄把「在构建期决定站点配色」这条路径打进 bundle。

顺带一个直接收益：`deriveLightTokens` / `deriveNightTokens` 的入参类型从 `PaletteColors`（定长 5 元组）放宽为 `readonly string[]` + 运行时校验长度 —— 因为客户端状态是 `useState<string[]>`，类型上不可能是定长元组。**放宽类型不等于放宽约束**，长度校验留在了 `parseColors()` 里。

### 3. 拆模块的正确性怎么证明：逐字节等价

拆模块最危险的是「顺手改掉某个色值」。所以写了 `.me/tmp/palette-equiv.mjs`：

- 用 `git show 4819bf1:lib/theme/palette-css.ts` 取出**拆分前的旧实现**，不经过我手改。
- 新旧两份各自用 `typescript.transpileModule` 转译后 import。
- 断言 `buildPaletteCss()` 的**整段输出字符串完全相等**，外加日夜每个 token 逐项比对、HSL 往返、灰度色相为 0、`contrastRatioOfHex` 与 RGB 路径同值。

**384/384 PASS**。这条断言在后续每一次改派生层时都作为硬门槛重跑 —— 它抓住了三次回归（见第 5 节）。

### 4. 客户端实现：三个不变量

#### 4.1 初始值必须来自 props，不能自己读 DOM

组件若在首帧去读 `getComputedStyle` 决定初始色，服务端渲染结果与客户端首帧必然对不上，触发 hydration mismatch 并让整个 hero 重渲染。做法是服务端把 `resolvePaletteColors()` 的结果作为 prop 传下去，首帧两端完全一致。实测控制台**零 hydration 错误**。

#### 4.2 改动用**独立的** `<style>` 覆盖层，不改构建期那段

```ts
const OVERRIDE_STYLE_ID = 'playbook-palette-override'
// 未改动 → 移除该元素，页面完全回到静态产物状态
// 已改动 → 写入 buildPaletteCss(colors)，位置在构建期样式之后，后写者胜出
```

构建期注入的那段 `<style>` 不带 id，两者互不干扰。**用 `<style>` 而不是给 `<html>` 写 inline style**，理由与 D-22 相同：派生结果同时包含 `:root` 与 `:root[data-theme='night']` 两套选择器，inline style 只能表达一个元素的一组属性，会把夜间那套整段压掉。实测确认覆盖层文本包含 `:root[data-theme='night']`。

#### 4.3 单一数据源：只存 HSL，hex 由它派生

这是**修掉的真 bug**。第一版同时存 `colors: string[]` 与 `hsls: Hsl[]`，并且在 `setHsls` 的 updater 里又调 `setSlotColor`：

```ts
setHsls((prev) => {
  const next = prev.map(...)
  setSlotColor(index, hslToHex(next[index]))   // ← 在 updater 里触发另一个 setState
  return next
})
```

一个事件里触发两个 setState，两路数据互相覆盖。实测表现是「拖了没反应」与「连续拖只出一个值」（`[#e2b8ba]` 只有 1 个颜色）。改为：

```ts
const [hsls, setHsls] = useState<Hsl[]>(...)
const colors = useMemo(() => hsls.map(hslToHex), [hsls])
// 只有一个写入口
const handleSlider = (index, key, raw) =>
  setHsls((prev) => prev.map((h, i) => (i === index ? { ...h, [key]: raw } : h)))
```

**为什么不直接存 hex**：饱和度拖到 0 时色相在数学上无定义，从 hex 反推会丢色相，把饱和度拖回来就会跳成红色。存 HSL 才能让三个滑块各自独立可逆。

### 5. 修掉的三个真实缺陷（全部由断言暴露，不是观感猜测）

#### 5.1 默认 coral 按钮的文字色是 `inherit`，不是 `--on-accent`

D-22 把 6 个**色对变体**（pink / cream / mint / sky / lilac / 及 coral 变体）的文字色统一改成 `var(--on-accent)`，**但默认变体 `.toy-button` 本身没写**，它的 `color: inherit` 最终继承到 `body` 的 `--ink`。

决定性证据（`.me/tmp/diag.mjs` 并排打印 `<style>` 与 computed）：

```
styleOnAccent   = #3d263f
computedOnAccent= #3d263f
btnTextColor    = rgb(77, 49, 80)   ← 这是 #4d3150，即 --ink，不是 --on-accent
btnCapBg        = rgb(255, 101, 108) ← --coral，按钮面本身是对的
```

后果：默认配色下文字就被 `--ink` 压得偏淡；用户把 p5 拉亮后直接掉到 **1.9:1**。修法是给 `.toy-button` 补 `color: var(--on-accent)`。

**为什么 384/384 等价性断言没抓到**：它只比 token 字符串，不看某个 CSS 选择器有没有引用这些 token。这类「某个变体漏写」只有真实按钮的 computed color 断言才能发现。这条值得记住：**token 层正确 ≠ 页面上每个消费点都正确**。

#### 5.2 色槽标签在深色槽位上几乎看不见

5 个色槽本身就是用户选的颜色，标签直接写在色块上。用固定的 `--on-accent`（由最深色派生，本身很深）在第 4、5 个槽位（两个深中性色）上就是「深字压深底」，目视几乎不可读。

新增 `readableOn(background, candidates)`：从候选里挑对比度最高的那个，**候选优先用现有 token**（`--on-accent` / `--canvas`），**全都不达 4.5:1 时才退到纯白/纯黑端点**。白与黑不参与配色决策，只作为「保证可读」的灰度端点，与 D-22 第 4 节同一口径。

#### 5.3 滑块偶发失效（见 4.3）

### 6. 极端取值下的加固：方向自适应 + 夜间亮度上限

配色实验室允许用户把**最深那位拉亮**，这在 D-22 的固定配色下不存在。压测（`light`/`night` × p5 亮度 5/30/55/70/90，共 10 组 × 7 项）一上来就是 **47/70**，暴露两个结构性缺口：

#### 6.1 `ensureContrast` 的 `direction` 是写死的

原来日间一律 `'darker'`、夜间一律 `'lighter'`。这在固定配色下永远成立，但 p5 拉亮后夜间正文往白里混会撞天花板 —— 实测夜间 p5 亮度 70% 时正文只有 **4.18:1**。

改为 `ensureContrastEither(color, against, target, preferred)`：先试首选方向，不达标就反向再试，两边都比一遍取更优。

**为什么这不会破坏等价性**：固定配色下首选方向永远先命中，`if (refs.every(...)) return direct` 提前返回，结果与 `ensureContrast` 逐字节相同。384/384 仍然全绿就是证据。

#### 6.2 夜间画布与表面在 p5 被拉亮后会停在中间调

7:1 要求背景相对亮度 ≤ **0.045**，中间调画布上浅色正文数学上做不到。加 `ensureMaxLuminance(color, 0.16)` 把夜间 `canvas` 与 `surface` 钉在亮度上限：

```ts
const canvas = ensureMaxLuminance(shade(p5, 0.34), 0.16)
const surface = ensureMaxLuminance(tint(canvas, 0.08), 0.16)  // surface 也要钉
```

**surface 为什么也要钉**：它比 canvas 亮 8%，canvas 刚好处在 0.16 时 surface 会超到 0.19，7:1 就保不住（实测 6.01）。

**0.16 这个阈值不是拍的**：6 套预设原本的夜间 canvas 亮度都在 **0.02~0.06**，这条保障对它们**完全不触发**。

**一个必须记住的实现细节**：`ensureMaxLuminance` 在未超限时必须**原值返回、不做 hex 舍入**。第一版我写了 `if (luminance(round(color)) <= max) return round(color)`，结果下游 `surface` / `soft` 都在这个值上继续混色，中间多一道舍入累积出 **1 位色差**，384/384 等价性断言当场挂了 48 项（`#282129 vs #292129`）。

#### 6.3 试过但已回退：把 `--on-accent` 也绑到画布上

我一度把 `onAccent` 也交给 `ensureContrastEither(shade(p5, 0.34), [canvas, surface], AA_TEXT, 'darker')`。**这是错的**：`--on-accent` 的对照背景是**按钮面**，不是画布。p5 被拉亮时它被反转成浅色，导致夜间整套按钮面颜色全变（`--coral` 从 `#ff656c` 变成 `#3d181a`），等价性挂 48 项。已回退，并把理由写进代码注释。

**教训：每个 token 的可读性对象是特定的**，不能因为「它也是文字色」就统一绑到 canvas/surface。

### 7. 修不掉的 5 项，以及为什么不假装修掉

加固后 65/70。剩余 **5 项全部是「夜间 + p5 亮度 ≥55%」的正文/表面 7:1**（实测 5.04~5.12）。这不是 bug：7:1 要求背景相对亮度 ≤0.045，把「最深色」拉亮后画布即使钉到 0.16 上限也做不到。

**处理方式是诚实告知，而不是硬压黑或藏起来**：界面加了一条 `role="status"` 警告，明确写「最深那位变亮了：夜间正文只能到 X:1（目标 7:1）。想恢复 AAA，把第 5 位调回去。」

D-22 本来就把「最深放第 5 位」定为**用户的约束**。实验室的职责是让试色变得容易，不是让用户绕过这条约束还能一切正常。

**顺带确认为真达标的**：夜间 p5 拉亮到 70% 时，页面上每一个按钮（登录 / 开始阅读 / 关于我 / 6 个快捷入口）的实测文字对比度是 **4.50 / 4.50 / 4.53 / 4.51 ×6**，全部 ≥ 4.5。截图里看着偏弱是因为画布变成中间调 `#7d677f`，但按钮本身合规 —— 这类「观感存疑」必须回到实测数，不能凭眼睛判定。

### 8. 不持久化，且界面明说

改动只作用于当前页面，刷新即回到站点默认配色。两条理由：

1. 持久化需要在挂载后读取并套用，会先闪一帧默认配色再跳到自定义配色 —— 首页整页颜色闪一次，代价太高。
2. 配色属于站点身份（D-22），构建期才是真值。实验室是「试一试」，真要用某个配色，做法是填进 `config/palette.ts` 的 `customColors`。

界面上写明了这一点（「这只是一次试色，刷新页面就回到站点配色」+ 指向 `customColors` 的那行说明），避免用户以为拖完滑块就永久生效。

### 9. 验证

| 项 | 结果 |
| --- | --- |
| 拆分等价性（vs `git show 4819bf1`） | **384/384 PASS** |
| 交互验证（`lab-check.mjs`，36 项） | **36/36 PASS** |
| 极值压测（10 组 × 7 项） | **65/70 PASS**（余 5 项见第 7 节） |
| `npm run typecheck` | **0** |
| 孤立副本 `build` | **0** |
| 路由类型 | `/` 仍 `○ Static`；`/posts/[slug]`、`/timeline/[id]` 仍 SSG |
| 首页 First Load JS | 103 → **122 kB**（引入客户端组件与派生层的预期代价） |
| 控制台错误 | **零 hydration / 运行时错误** |

交互断言覆盖：首屏无覆盖层、实验室位于快捷入口上方（`labTop=519 < quickTop=1192`）、`h1` 与主 CTA 仍在、5 个色槽、拖 p1 改变 `--shell`/`--coral-base` 而 `--canvas` 不变（canvas 由 p2 派生，符合设计）、拖 p2 改变 `--canvas`/`--soft`、亮度连续 5 档产生 5 个不同派生色、切槽位后 `aria-pressed` 唯一、预设「港湾」载入 5 个正确色值、还原回构建期值并移除覆盖层、4 项对比度读数达标（17.87 / 4.65 / 6.61 / 3.11）、夜间 token 切换与夜间下拖滑块、**刷新回默认且无覆盖层**、方向键可改滑块值、滑块命中高度 22px、色槽最小边 58px、390px 无横向溢出且仍是 5 列色槽。

我自己的探针 bug 也记录一下（都不是产品缺陷）：① 断言拖 p1 会改 `--canvas`（canvas 由 p2 派生，本就不该变）；② 点完槽位后在**同一同步块**里拖滑块，React 还没重渲染，改的还是上一个槽位；③ 拿硬编码的旧值而非拖前实测值做比较。

### 10. 保留的设计不变量

- `<h1>`、`siteConfig.bio`、主 CTA（开始阅读 / 关于我）全部保留 —— 换掉的是装饰卡，不是标题与入口。
- 配色仍然只由 `config/palette.ts` 的 5 个色值决定；实验室是**运行时覆盖层**，不是第二个颜色来源。
- 组件里依然没有硬编码色值：色槽背景是用户输入或 `--palette-N`，标签色由 `readableOn` 从现有 token 里挑。
- 滑块样式只用派生 token（`--line` / `--surface` / `--ink`），不引入新色值。

### 11. 未验证范围

- 真实触屏拖动未测（只用 CDP 派发 `input` 事件与方向键验证过值会变）。
- 屏幕阅读器对 `role="status"` 警告与 `aria-valuetext` 的实际朗读未测。
- 只在 Chromium（Edge）上验证，未测 Firefox / Safari 的 `::-moz-range-*` 伪元素表现。
- 极端取值下「观感可接受度」未量化（只断言对比度数值达标）。
- 未做移动端真实设备的滑块拖动手感评估。
- 未提供「把当前试色导出成 `customColors` 代码」的按钮（用户需手抄 5 个色值）。

### 12. 后续事故：修文字色时误删底座背景，全站按钮丢失厚度

这是 D-23 提交（`eca9f29`）之后被发现并修复的真实回归，记在这里作为不变量。

**现象（用户报告）**：「很多按钮的立体效果都丢失了」。

**根因**：改 `.toy-button` 的文字色时，我把紧邻的 `background: var(--base)` 一行一起删掉了。`git diff 4819bf1 -- app/globals.css` 一眼可见：

```diff
-    color: inherit;
-    background: var(--base);
+    /* …仍是一大段关于 --on-accent 的注释… */
+    color: var(--on-accent);
```

**为什么后果是全站级的**：D-02 的立体感是**两层结构**——

| 层 | 角色 | 背景 |
| --- | --- | --- |
| `.toy-button`（外层） | 深色**侧壁**，被按钮面遮住的下半截 | `--base` |
| `.toy-button__top`（内层） | 明亮**按钮面**，向上位移 `--depth` | `--cap` |

外层背景一去掉，按钮面照样向上位移，但它下面不再有深色实体。于是「厚度」还在几何上，视觉上却只剩一道透明缝隙 —— 看起来就是扁按钮。这不是某一个变体，是**所有** `.toy-button`：主 CTA、6 个快捷入口、页头登录、文章列表筛选与分页、评论提交、点赞、后台保存/发布。

**为什么之前的验证全都没抓到**：

- `npm run typecheck` = 0 —— CSS 删一行不影响类型。
- 384/384 等价性断言 —— 它比的是**派生出的 token 字符串**，`--base` 本身一直是正确的；错的是「有没有人消费它」。
- 36/36 交互断言 —— 测的是滑块改变 computed color，测的是 `--cap` 那侧。
- 极值压测 —— 测的是文字对比度，测的是 foreground。

**共同的盲区：所有断言都在验 token 值与文字可读性，没有一条验「底座这块实体还在不在」。** 这与 D-22 那次「默认变体漏写 `color`」是同类型错误的第二次发生：token 层正确 ≠ 每个消费点都正确。

**修法**：把 `background: var(--base)` 补回，并在同一处注释里写明它与 `color` 是**两件不能一起改的事**、以及外层背景的语义（「被按下去会露出来的深色侧壁」）。

**新增的回归防线**（`.me/tmp/btn-depth.mjs`，10/10 PASS，覆盖 25 个按钮）：

1. **外层 `backgroundColor` 不得是 `transparent`，且必须等于 `--base` 的解析值。** 这是「侧壁存在」的唯一证据。
2. **`outer.bottom - cap.bottom >= depth - 1px`。** 注意实测是 **2 × depth**（外层 `padding-bottom` 与按钮面 `translateY` 各贡献一份）—— 这是 D-02 的原始几何，`git diff` 证实几何那几行从未被动过；第一版断言写成「== depth」是我的错，不是产品缺陷。
3. **`elementFromPoint` 在缝隙中点采样必须命中 `.toy-button` 自身**，证明那里不是画布。
4. **底座相对亮度必须低于按钮面**（物理方向正确，不是「越按越高」）。
5. **夜间主题下同一套断言再跑一遍**。
6. **反向对照**：把外层背景强制设为 `transparent` 复现事故状态，探针必须如实报出 25/25 缺失。**这条最重要 —— 没有它，前 5 条可能只是在测试「探针永远返回真」。**

`.toy-card` 线同时复核（4/4 PASS）：卡片的实体感来自 `box-shadow: 0 Npx 0 <实色>` 硬阴影，没有被这次改动波及。

**新增不变量（写进 D-02 的语义里）**：`.toy-button` 外层背景**不是装饰，是结构**。任何改动这两个选择器的人都必须同时确认：外层有实色 `--base`、内层有 `--cap`、两者存在 `>= depth` 的可见落差。缺任何一条，立体感就没了。

## D-24 · 首页标题区改为「触感体验面板」：把档位吸附做成可测量的手感

### 1. 需求

把首页 hero 里「把每一次更新，做成可以按下的故事。」那块标题区整块换成一个**触感体验面板**（布局参考 `img/Snipaste_2026-10-24_14-16-54.png`），面板内必须包含：

1. 两个按钮，按压反馈与全站立体按钮**完全一致**（同源，不复制样式），分别进入 `/posts` 与 `/about`
2. 第一个竖直滑块：**5 个档位**，控制旋钮的档位颗粒度
3. 第二个竖直滑块：**只有 2 个档位**，像拨动开关，控制网站明暗主题
4. 一个**可鼠标拖动、带档位旋转**的旋钮，颗粒度由滑块一控制，暂无绑定功能

手感要求是这次的核心，不是装饰：**档位弹性吸附**，「拨动他要花一些力气」。

### 2. 标题与 CTA 怎么处置

`<h1>` 与两个主 CTA 是既有不变量（SEO + 可达性 + 用户明确要求保留）。处理方式：

| 元素 | 去向 |
| --- | --- |
| `<h1>`「把每一次更新，做成可以按下的故事。」 | 保留在 DOM 中，改为 `.visually-hidden` |
| `siteConfig.bio` | 作为 prop 传进面板，显示在按钮下方 |
| 两个主 CTA | 搬进面板内部，仍然用 `ToyButton` |

**为什么 h1 用 visually-hidden 而不是删掉**：它是本页唯一的最高级标题。删掉等于让整页失去标题层级，屏幕阅读器与搜索引擎都会掉级。visually-hidden 保留语义、不占视觉空间，是这个需求下唯一正确的做法。验证里有一条断言专门守它：`h1` 文本完整 **且** `className` 含 `visually-hidden`。

### 3. 档位吸附的物理模型（本决策的核心）

原生 `<input type="range">` 做不到这个需求，两个原因：

1. 它的拇指**永远精确跟随指针**，不存在「指针动、拇指不动」的磁滞。
2. `step` 在边界上会**瞬间跳变**，摸起来是「格楞」而不是「咔哒落进去」。

所以自己算。把连续的档位坐标 `raw`（0..n-1）揉成视觉坐标：

```
applyDetent(raw):
  距最近档心 d = raw - round(raw)，|d| ∈ [0, 0.5]
  |d| <= DEAD_ZONE  → 返回档心本身（死区，拇指纹丝不动）
  |d| >  DEAD_ZONE  → 剩余行程按幂曲线压缩后再走
```

两个参数各管一件事：

| 参数 | 值 | 管什么 |
| --- | --- | --- |
| `DETENT_DEAD_ZONE` | `0.3` | **力气**。档心附近 30% 的行程被吃掉，指针动而拇指不动 |
| `DETENT_CURVE` | `2.4` | **弹性**。越小越接近线性（柔），越大则越晚屈服、屈服后越猛（脆而弹） |

**关键性质：跨档处连续。** `|d| = 0.5` 时返回值恰为 `±0.5`，即两档的正中点。而跨过 0.5 时 `Math.round` 换档，视觉坐标从「上一档 +0.5」变成「下一档 −0.5」，两点数值相同 —— 不会跳一格。

这一条是这套手感能不能用的分界。写错就会在换档瞬间闪一下，而且**只在拖动过程中出现**，静态截图完全看不出来 —— 所以验证必须真的拖。

### 4. 旋钮与滑块共用同一套手感

旋钮的角度先换算成连续档位坐标，再走同一个 `applyDetent`：

```
frac ∈ [0,1]  →  raw = frac * (detents - 1)  →  visual = applyDetent(raw)
visualDeg = -135 + (visual / (detents - 1)) * 270
```

**旋钮内部存的是归一化的 `frac`，不是档位索引。** 否则滑块一改颗粒度（4 档 → 36 档），旋钮的物理位置会被一起打乱 —— 用户只是调「刻度粗细」，旋钮却自己转了一大圈。存 frac 则保持角度、只改变吸附网格。

颗粒度 1..5 → 旋钮档数：`4 / 8 / 12 / 20 / 36`。档数越多，转动时卡得越细。

### 5. 主题滑块必须是受控的，真值来自 DOM

D-08 定的做法是「主题真值在 DOM 上（`data-theme`），由 `<head>` 内联脚本按 cookie 校正」。所以主题滑块**不能自己存 state**，否则页头开关一动，滑块就与真实主题脱节。

做成受控：

```tsx
const theme = useSyncExternalStore(subscribeTheme, readThemeFromDom, () => 'light')
const themeIndex = theme === 'night' ? 1 : 0
const handleThemeIndex = (index) => writeTheme(index === 1 ? 'night' : 'light')
```

### 6. 顺带抽出的 `lib/theme-dom.ts`

主题本来是页头 `ThemeToggle` 独家在改。现在有了第二个改主题的地方（面板的主题滑块），如果各自抄一份 cookie 名与写入顺序，迟早出现「页头切了、面板没跟上」的漂移。

所以把「读 / 订阅 / 写 / 切换」四个动作收到 `lib/theme-dom.ts` 一处，两处共用：

```ts
export function readThemeFromDom(): Theme
export function subscribeTheme(onChange: () => void): () => void
export function writeTheme(next: Theme): void
export function toggleTheme(): Theme
```

`writeTheme` 里有一个刻意的细节：**已经等于目标值时跳过 DOM 赋值**。否则一次多余的赋值就会触发 `MutationObserver`，让所有订阅者白跑一轮 —— 主题滑块在拖动时会高频调用它。

### 7. 修掉的真实缺陷：`clampIndex` 语义误用

第一版 `rawFromPointer` 写成了：

```ts
return clampIndex(p, 1) * (detents - 1)   // ← 错
```

`clampIndex(index, detents)` 的第二个参数是**档数**，上限是 `detents - 1`。传 `1` 于是上限变成 `0`，`p` 无论是 0.2 还是 0.9 全被夹到 0。

**表现**：按在轨道顶部、正中、底部，值都是 `0` —— 也就是「按哪里都是最低档」。同时又因为主题滑块也走这条路径，主题切换一起被锁死。一个 bug 连锁造成 6 项断言失败。

正确写法是「把比例夹到 0..1」，与档位索引无关：

```ts
const t = p < 0 ? 0 : p > 1 ? 1 : p
return t * (detents - 1)
```

**教训：同一个文件里出现两个都在做「夹取」语义的函数时，参数含义必须在调用处一眼可辨。** `clampIndex(p, 1)` 看起来像「夹到 0..1」，实际是「夹到 0..0」。这个 bug 静态阅读极难发现，只有真实按下事件 + 读回 `data-value` 才暴露。

### 8. 验证

`npm run typecheck` = 0；孤立副本 `build` = 0；`/` 仍 `○ Static`（121 kB），共享 First Load JS 103 kB 未变。

CDP 真实浏览器验证 **24/24 PASS**：

| 断言 | 结果 |
| --- | --- |
| 3 个 `role="slider"`（2 滑块 + 旋钮） | PASS |
| 颗粒度滑块 5 档 / 主题滑块 2 档 | PASS |
| `h1` 保留且 `visually-hidden`，文案完整 | PASS |
| 两个 CTA 指向 `/posts`、`/about`，且**底座仍在**（`gap >= depth - 1`） | PASS |
| 小幅拖 12px **不换档**（死区生效） | PASS |
| 上拖 70px **换档** | PASS |
| 逐档连续上扫，经过 `{0,1,2,3,4}` **全部五档**，始终整数档 | PASS |
| 颗粒度拖到顶 → 旋钮 36 档 | PASS |
| 颗粒度拖到底 → 旋钮 4 档 | PASS |
| 旋钮拖动中角度改变 | PASS |
| 旋钮松手后吸附到档心（偏移 < 0.02 档） | PASS |
| 主题滑块拖到顶 → DOM=night 且 cookie=night | PASS |
| 点页头开关 → 主题滑块同步回日间档 | PASS |
| 键盘 `Home` → 最低档；`ArrowUp` 升档；旋钮档数随之变化 | PASS |
| 390px 无横向溢出且控件齐全 | PASS |
| 控制台零 hydration / 运行时错误 | PASS |
| 刷新后主题保持（cookie 生效） | PASS |

**额外的绝对值校验**（确认坐标换算本身正确，不只是「能变」）：

```
press frac=1.00 → value=4, knobDetents=36
press frac=0.75 → value=3, knobDetents=20
press frac=0.50 → value=2, knobDetents=12
press frac=0.25 → value=1, knobDetents=8
press frac=0.00 → value=0, knobDetents=4
```

五个位置精确对应五档、五个档数。

### 9. 我自己的探针 bug（都不是产品缺陷，但全都让验证白跑过）

1. **拖动起点取错**：`dragVertical` 从**轨道中心**按下，于是 `pointerdown` 本身就是一次「点击定位」，先把值跳到档 2 再拖 —— 这不是拖动。修法：读拇指中心作为起点。
2. **断言方向写反**：`rawFromPointer` 用 `(rect.bottom - INSET - clientY)`，所以**向上拖 = 升档**。我第一版按「向下拖 = 升档」写，`拖到底后旋钮档数不对 :: 36` 这条 FAIL 其实恰好证明了方向相反但功能正常。
3. **交替方向扫描**：进一格退一格，自然只在两档间往返（`{1,3}`），却断言「应该经过 ≥4 档」。改成单方向连续上扫后经过全部五档。
4. **主题基线不干净**：上一次运行留下的 cookie 已经是 `night`，再拖到 `night` 就是「没变化」，`commit` 里 `index !== value` 不成立 → `onChange` 不触发 → 误报「没写 cookie」。修法：先把主题确定地拨到 `light` 再测。
5. **`File.Edit` 删漏残留行**：替换 `dragVertical` 的循环时旧的 `mouseMoved` 尾巴没删掉，产生 `SyntaxError: Unexpected token ':'`。教训同 D-22：行范围必须覆盖完整语法单元，并且**改完立刻 `node --check`**。

### 10. 布局

第一版用 `grid lg:grid-cols-[minmax(0,1fr)_auto_auto]`，结果按钮组被拉到极左、旋钮推到极右，中间一大片空白。改成 `flex lg:justify-between` + 按钮组 `max-w-[330px]`，三组控件间距均匀，与参考图一致。

移动端顺序是「滑块 → 旋钮 → 按钮」，用 `order-*` 控制：控件是这个面板的主体，按钮虽然是入口但不该占据首屏最上方。

### 11. 未验证范围

- **真实触屏拖动未测**：只用 `Input.dispatchMouseEvent` 派发鼠标事件与键盘验证。触屏的 `pointerType: touch` 与 `touch-action: pan-y` 的实际拦截效果未测。
- **屏幕阅读器朗读未测**：`aria-valuetext` 在旋钮上会读成「第 N 档，共 M 档」，实际朗读效果未验。
- **手感本身的主观评价未量化**：死区 0.3 / 曲线 2.4 是我按「指针明显先动一段、拇指才跟上」的定性目标调的，没有真人手感测试。「够不够费力」只能由用户判断。
- 只在 Chromium（Edge）上验证，未测 Firefox / Safari。
- 旋钮的 `pointermove` 用的是极角，快速拖过 ±135° 边界时会贴边停住，没有做「跨边界回绕」。这是刻意的（旋钮本来就该有物理限位），但未与用户确认是否符合预期。

---

## D-25 触感面板：阻滞-突破手感（stick-slip）、旋钮控阈值、与配色面板共存

> **状态**：已实施（`components/site/touch-panel.tsx`、`app/(site)/page.tsx`）。
> **取代**：D-24 的第 5 节（死区 + 幂曲线手感模型）与第 6 节（hero 替换）**已被本节更正**。
> D-24 的其余部分（为什么不用原生 `input[type=range]`、旋钮档数映射、`lib/theme-dom.ts`、
> `clampIndex` 语义误用的教训）继续有效。

### 1. 用户的三条纠正

原话：

> 触感体验面板不是替代配色面板，这两个要共存，并且触感体验面板中的布局也没有严格按照示意图，
> 并且旋钮和滑块的手感表现错误，看来你不知道怎么表现阻滞弹性效果，以滑块为例，刚开始拖动的
> 时候，滑块不会紧跟鼠标，而是只有很小的位移来体现阻滞感，当鼠标继续拖动一段距离，超过某个
> 阈值，滑块会突破阻滞划到对应的档位，旋钮就可以调节阻滞阈值，从用户角度看是调节拨动滑块的
> 难易程度

拆成三条并列要求：① 两个面板共存；② 布局严格对齐参考图；③ 手感是「阻滞-突破」，且阈值可被旋钮调节。

### 2. 手感错在模型，不在参数

**D-24 的实现**：

```
applyDetent(raw):
  距最近档心 d ∈ [-0.5, 0.5]
  |d| <= DETENT_DEAD_ZONE (0.3)  → 返回档心本身（拇指纹丝不动）
  |d| >  DEAD_ZONE               → 剩余行程按 pow(t, 2.4) 压缩后再走
```

它让拇指**滞后，但永远不会突破** —— 拖多远就滑多远，只是慢一点。

**这是阻尼（damping），不是阻滞（stiction）。** 阻尼是「速度被削减」，阻滞是「静摩擦被克服」。
用户要的是后者：**卡住 → 蓄力 → 突然弹开**。这两个物理量在屏幕上的表现根本不同：

| | 阻尼（错） | 阻滞（对） |
| --- | --- | --- |
| 小幅拖动的拇指位移 | 指针的 ~40%（连续减少） | 指针的 **14%**，几乎不动 |
| 继续拖动 | 拇指继续跟着走，越拖越远 | 拇指**仍然几乎不动** |
| 到达某个点 | 没有任何特殊事件 | **「啪」地整档弹过去** |
| 松手 | 停在拖动到的位置 | 弹回原档心（拨不动就弹回） |

### 3. 正确模型：`anchor` + `creep` 两状态机

纯函数表达不了「突破」这个离散事件，必须持有两个状态：

| 状态 | 含义 |
| --- | --- |
| `anchor` | 上一次突破时指针所在的整数档位 |
| `creep` | 这一次已经累积的「未释放」跟随量（档位单位，带符号） |

每次 `pointermove`：

```
released = anchor + creep             // 拇指当前真实位置
pushed   = raw - released             // 本轮指针相对拇指的推动量
total    = creep + pushed             // 相对 anchor 的累积位移

if |total| >= threshold:              // 突破！
    direction = sign(total)
    next = anchor + direction         // 至少走一档
    若 raw 已经更远（快速拖动）：直接追上 round(raw)，允许一次跨多档
    anchor = next, creep = 0          // 换档后累积清零，重新从阻滞开始
else:
    creep = total * CREEP_RATIO       // 只跟 14%

视觉位置 = anchor + creep
```

**为什么 `CREEP_RATIO` 取 0.14 这么小的值**：阻滞感来自「拇指几乎不动」这个事实本身。
取 0.5 就成了普通滑块打了折，看着像迟钝而不像被卡住。

**为什么不需要 `while` 循环**：`raw` 是绝对位置，突破时直接取 `max/min(anchor±1, round(raw))`
就等价于「一直追到指针所在档」，一次触发即可完成多档跨越。

### 4. 三个关键行为

1. **`pointerdown` 不做跳跃定位。** 原来的实现按哪里就跳到哪里 —— 那等于在手指落下的瞬间
   就把阻滞绕过去了。现在只把 `anchor` 设到最近档并清 `creep`，拇指留在原处。
   **这是手感能否被感知的前提，不是细节。**
2. **`endDrag` 把 `creep` 归零。** 未达阈值时松手，拇指弹回原档心 —— 这就是「拨不动就弹回」。
3. **拖动中关掉 `transition`。** 磁滞本身已经是一条位移曲线，再叠一层 CSS 补间等于双重延迟，
   观感会发黏。松手才开 `transition` 让拇指优雅落回。

### 5. 阈值由旋钮控制

| 常量 | 值 | 语义 |
| --- | --- | --- |
| `THRESHOLD_MIN` | `0.12` | 最轻（半个档位的 1/4 就能拨动） |
| `THRESHOLD_MAX` | `0.62` | 最费力（拖过大半个档位才突破） |

`DetentKnob` 新增 `onThresholdChange(ease: 0..1)`，每次档位变化上报 `anchor / (detents - 1)`。
`TouchPanel` 里：

```ts
const [ease, setEase] = useState(0.5)
const threshold = THRESHOLD_MAX - ease * (THRESHOLD_MAX - THRESHOLD_MIN)
```

传给**两个** `DetentSlider`。旋钮转到最右（`ease=1`）→ `0.12`；转到最左（`ease=0`）→ `0.62`。

旋钮自身用固定阈值 `0.5` 档，逻辑与滑块同源（共用同一套 `resolve` 形状），只是把线性行程换成极角
（`atan2(dx, -dy)`，0° 朝上、顺时针为正、限位 ±135°，行程 270°）。

### 6. 布局严格对齐参考图（`img/Snipaste_2026-10-24_14-16-54.png`）

参考图客观特征（1264×647）：左两块圆角矩形**上下堆叠、高矮不一**；中两根**细长竖直导轨**，
导轨明显比拇指窄且上下都探出拇指行程；右一个**大圆旋钮**，直径与滑块导轨同高，是整块面板的视觉重心；
三组控件横向铺开、间距均匀、**中间没有大片空白**。

实测对齐结果（1440px 视口，CDP `getBoundingClientRect`）：

| 项 | 数值 |
| --- | --- |
| 左栏两个按钮列 | `left=310 right=670 width=360`，高度 `[85, 107]`（**一高一矮**） |
| 滑块容器 | `72 × 200`（命中区宽 72 满足触控，导轨只有 16px） |
| 旋钮 | `200 × 200` |
| 间隙 | 按钮→滑块 `40.0`，滑块→旋钮 `40.0`（**相等**） |
| 面板宽 | `1180` |

**与参考图的三处偏差已修正**：

1. 旋钮从 `132px` 加到 `200px`，滑块从 `172px` 高、`62px` 宽的方框改成 `200px` 高、命中区 `72px`
   但只画一条 `16px` 导轨 —— 这样才有「细长导轨 + 宽扁拇指横跨其上」的形状。
2. `lg:justify-between` 改成 `lg:justify-center` + `lg:gap-10`。`justify-between` 会把按钮组与旋钮
   顶到两端、中间留白，那正是第一版被否掉的原因。
3. `bio` 自述从左侧按钮列移到标题区 —— 参考图左栏只有两块矩形，不该被三段文字撑高。

移动端顺序仍是「滑块 → 旋钮 → 按钮」（`order-*`），控件是这个面板的主体。

### 7. 共存：触感面板是**追加**，不是替代

**D-24 第 6 节的「hero 换成触感面板」这个表述是错的，本节更正。**
`app/(site)/page.tsx` 的 hero 现在是：

```tsx
<section className="pb-14 pt-8">
  <h1 className="visually-hidden">把每一次更新，做成可以按下的故事。</h1>
  <TouchPanel bio={siteConfig.bio} />
  <div className="mt-9">
    <PaletteLab initialColors={resolvePaletteColors()} presets={paletteLabPresets} />
  </div>
</section>
```

两个面板演示的是不同的东西，因此不构成重复：

- **触感面板**演示控件的**物理手感**（阻滞-突破、档位吸附、按压反馈）。
- **配色实验室**演示 5 个源色如何**派生全站颜色**（D-22 / D-23）。

`h1` 保持 `visually-hidden` —— 它在 DOM 里仍是本页唯一的最高级标题，删掉会让整页失去标题层级。

### 8. 验证设计的教训（比结论更重要）

D-24 的探针 **24/24 PASS**，但手感从根本上是错的。为什么没抓到：

1. **所有断言只验「能换档」，没验「怎么换档」。** 断言是 `data-value` 变了没有，而
   「能变」对任何实现都成立。手感是有**过程**的量，必须量过程。
2. **探针从轨道中心按下。** `pointerdown` 在旧实现里是一次「点击定位」，于是探针的第一步
   就先把值跳到中间档，再开始拖 —— 阻滞段完全没进入被测路径。
   **规则：竖直滑块拖动必须从拇指当前中心按下。**
3. **没有正反向对照。** 好的手感断言必须能让错误实现失败。

本轮的断言（24/24 PASS，`.me/tmp/stick-check.mjs`，已清理）：

| 断言 | 实测值 |
| --- | --- |
| 小幅拖动不改档 | 指针 `6.22px` → `value 2 → 2` |
| 阻滞期位移比 | 指针 `6.22px`，拇指 `0.87px`，**比值 0.140** |
| 未突破松手弹回 | `visual=2`（整数档心） |
| 超阈值突破一档 | `21.58px`（阈值 `0.370` 档 = `15.36px`）→ `value 2 → 3` |
| 突破后对齐档心 | `visual=3 value=3` |
| 旋钮最右 → 最轻 | 两滑块 `threshold` 同时变 `0.12` |
| 旋钮最左 → 最费力 | 两滑块 `threshold` 同时变 `0.62` |
| 最费力时 0.5 档拉不动 | `20.75px` → `value 3 → 3` |
| 最轻时同样 0.5 档能突破 | `value 3 → 4`，`visual 3.000 → 4.000` |
| 两个面板共存 | 触感面板标题与配色实验室标题同时存在 |
| 布局几何 | 见第 6 节表格 |
| 390px 无横向溢出 | `scrollW 391 / innerW 391`，触控目标均 ≥44px |
| 运行时错误 | 零 hydration / 零异常 |

**其中「最费力时拉不动 / 最轻时能突破」这一对是本轮最有价值的断言**：同一个物理拖动
（0.5 档），仅因旋钮位置不同而结果相反 —— 这同时证明了阈值真的接进了手感模型，
而不只是改了一个 `data-threshold` 属性。

### 9. 探针自身的 bug（四次，均非产品缺陷）

1. **选择器命中页头按钮**：`document.querySelector('.toy-button')` 拿到的是页头 cream「登录」按钮
   （宽 54px），导致「左栏按钮列 360px」误报 FAIL。改为在 `#touch-panel-title` 的
   `closest('section')` 范围内取 `.toy-button`。
2. **变量重名**：布局段用 `const knobLeft` 表示旋钮左边缘，后面旋钮拖动段又用
   `const knobLeft = await readKnob()` —— 后者在块级作用域里合法，但读代码时极易混淆。已改名。
3. **`File.Edit` 又删掉一行的 JSX 闭合 `>`**：`style={{…}}` 那行后面原本的 `>` 被覆盖，导致
   `TS2657: JSX expressions must have one parent element`。**这是同类失误的第 N 次** ——
   行范围必须覆盖完整语法单元。
4. **截图恰好是夜间态**：第一轮跑完时 cookie 已被前一步的主题测试写成 `night`，截图看着像
   「重做后变暗了」。补一步显式写 `playbook-theme=light` 再截图，日间态正常。
   **教训与前一轮「观感存疑必须回到实测」同源：截图前要先确定被测状态。**

### 10. 未验证范围（诚实列出）

- **真实触屏拖动未测**：只用 `Input.dispatchMouseEvent`。`pointerType: touch` 与
  `touch-action: none` 的实际拦截效果未验。
- **屏幕阅读器朗读未测**：`aria-valuetext` 在滑块上读档位、在旋钮上读「第 N 档，共 M 档」，
  实际朗读顺序未验。
- **「够不够费力」只能由用户上手判断**。`CREEP_RATIO`（0.14）、`THRESHOLD_MIN`（0.12）、
  `THRESHOLD_MAX`（0.62）是我按「几乎不动 → 突然弹开」的定性目标调的可调常量，没有真人手感测试。
- 只在 Chromium（Edge）上验证，未测 Firefox / Safari。
- 旋钮快速拖过 ±135° 边界会贴边停住，没做跨边界回绕 —— 刻意（旋钮本就该有物理限位），
  但未与用户确认。

### 12. 追加更正：指针停在两档之间会「闪烁」（D-25 的阈值下限是错的）

**用户报告**：

> 鼠标拖动滑块的时候会，鼠标如果在两个档位中间，滑块就会在两个档位闪烁

这是 D-25 自身引入的缺陷，不是配置问题。用户描述得很精确：**只在「两档之间」发生**。

#### 12.1 三个叠加的根因

**① 阈值下限低于几何档界（主因）**

D-25 把 `THRESHOLD_MIN` 定成 `0.12`。0.12 档远小于半档（0.5），而 **0.5 档正是两个档位的分界线所在的位置**。
于是指针还停在中点时，「累积位移 ≥ threshold」这个判据就已经成立 —— 档位换到了下一档，
可指针**并没有越过任何档界**。下一次 `pointermove` 事件（哪怕只是 1px 的系统抖动）算出的
累积位移仍在中点附近、仍满足判据，于是又反向换回来。这就是闪烁。

**关键认识：0.5 不是一个可调参数，是几何事实。** 阈值小于 0.5 时，突破判据与档界位置脱钩，
系统在物理上就不可能只有一个稳定状态。D-25 说「0.12 = 最轻」，实际上是把「抖动」当成了「轻」。

**② 突破与回退发生在同一个坐标上**

旧判据推进和回退共用 `|total| >= threshold`。即使把阈值提到 0.5 以上，只要两个方向的阈值相同，
突破点就等于回退点；指针恰好停在那个坐标时，仍然会来回翻。**必须有回差。**

**③ 高频 `pointermove` 读到旧的 state**

`handlePointerMove` 闭包捕获渲染时的 `anchor` / `creep`。鼠标以 120Hz+ 上报时，同一帧内可能连着
好几个 move，后一个读到的还是旧 `anchor`，算出的 `total` 方向是错的。这一层会把①②造成的抖动放大。

#### 12.2 三处修改

| 项 | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `THRESHOLD_MIN` | `0.12` | **`0.5`** | 0.5 档 = 档界位置，是稳定性的**几何下限**，不是调参 |
| `THRESHOLD_MAX` | `0.62` | **`0.95`** | 上限也要跟着抬，否则区间只剩 0.12 档、手感差异全无。0.95 = 几乎拖到下一档才弹 |
| 回差 `HYSTERESIS` | 无 | **`0.6`** | 退回方向要 `threshold + 0.6` 才生效，把突破点与回退点错开 |

`resolve()` 的判据从

```ts
if (Math.abs(total) >= threshold) { /* 突破 */ }
```

改为

```ts
// 推进与回退用不同阈值：中间是一条死带，指针停在死带里不产生任何状态变化
const need = total > 0 ? threshold : threshold + HYSTERESIS
if (Math.abs(total) >= need) {
  const next = clampIndex(Math.round(targetRaw), detents)
  if (next !== curAnchor) return { anchor: next, creep: 0 }   // 没换档就不算突破
}
return { anchor: curAnchor, creep: total * CREEP_RATIO }
```

**另外把 `anchor` / `creep` 的拖动期真值搬进 `useRef`**（`anchorRef` / `creepRef`），
`setState` 只用于驱动渲染。ref 是同步写，不会被异步更新拖后，于是同一帧里的多个 move
始终读到最新值。滑块与旋钮都改了。

#### 12.3 修改后的阈值映射

| 旋钮位置 | `ease` | `threshold` | 观感 |
| --- | --- | --- | --- |
| 最右 | 1.0 | `0.50` | 一过两档中点就弹（最轻） |
| 中间 | 0.5 | `0.725` | 默认 |
| 最左 | 0.0 | `0.95` | 几乎拖到下一档才弹（最费力） |

宽度 0.45 档，手感差异明显，且**每一端都保证指针确实越过了档界**。旋钮自身固定 `0.5` + 回差 `0.6`。

#### 12.4 验证（`flick-check.mjs`，11/11 PASS）

核心断言是**复现用户场景**：把指针精确停在 `value + 0.5`（两档中点），然后以 ±0.06 档的幅度
抖动 24 次，用 `MutationObserver` 记录 `data-value` 的每次变化。

| 断言 | 实测 |
| --- | --- |
| **两档中点抖动不闪** | 24 次 mutation，`distinct values=["2"]`，**flips=0** |
| 值始终停在单一档 | `distinct=["2"]` |
| 阻滞未被破坏 | 指针 8.30px → 拇指 1.16px，**比值 0.140**（与 D-25 相同） |
| 超阈值仍突破一档 | `34.24px`（阈值 `0.725` 档 = `30.09px`）→ value 2→3 |
| 长拉能到顶档（阈值不过紧） | value 4 / max 4 |
| 主题滑块中点同样稳定 | 0 次 value 变化，flips=0 |
| 旋钮不改阈值联动 | easy `0.5` < default `0.725` < hard `0.95` |
| 旋钮中点不闪 | 0 次档位变化，flips=0 |
| 阈值遵守 0.5 几何下限 | `easy=0.5` / `hard=0.95` |
| 运行时错误 | 零 hydration / 零异常 |

**「长拉能到顶档」这条是必须有的反向对照**：把阈值抬高有「矫枉过正、滑块拖不动」的风险。
它证明 0.95 仍在可拖动范围内。

#### 12.5 这次暴露的两个方法论教训

**① 手感参数不能脱离几何约束去调。**
D-25 把 `THRESHOLD_MIN` 当成纯手感旋钮，从 0.12 到 1.0 随意取值。但阈值与「档界在哪」是同一个
坐标系里的量，0.5 是分界线。**任何表示「离散化边界」的参数，都必须先算清它的几何含义，再谈手感。**
这和 D-21 的教训同构（滑块位置只能由一个机制决定 / 档位计算不能复用错误语义的 `clampIndex`）。

**② D-25 的 24/24 PASS 依然没抓到这个缺陷。**
因为所有断言都在测「**单方向**拖动」：拖一步、看是否换档。没有一条断言测
「**指针停在边界上不动时会怎样**」。稳定性（不发散、不自激）与响应性（能换档）是两类性质，
只测后者必然漏掉前者。**新增规则：任何带阈值的离散化控件，必须有一条「停在阈值附近抖动、断言状态不翻转」的用例。**

顺带记下两个探针 bug（均非产品缺陷）：长拉用例里 `yOf` 是「raw 越大 y 越小」，我写成
`yOf(a) + 正向增量` 变成了向下拖；旋钮用例监听 `data-angle` 而那是含 `creep` 的**视觉**角度、
每帧都该变，要验闪烁必须看**离散档位** `data-value`。

---

## D-26 触感面板视觉重做：纯色色块 + 立体侧面 + 布局重排

### 1. 用户提的四条，逐条对应

用户原话（四条并列，必须全部满足）：

> 滑块、旋钮的风格要和按钮统一，都是纯色色块构成，尽量不要使用线条勾勒
>
> 滑块分为滑槽和滑块两部分，滑块本身和和按钮一样拥有下层侧面阴影，但是随着滑块有上划到下，侧面阴影的位置也有变化，例如滑块在上侧时漏出的侧面在下方，滑块在下侧时漏出的侧面在上方，正中间位置则不会露出侧面，滑槽周围也要显示刻度
>
> 旋钮和按钮一样拥有下层侧面阴影，整体有两个大小一致但是位置上下错开的圆构成，但是侧面阴影不跟随转动，再引入旋钮刻度显示围绕在侧面阴影圆周围，旋钮顶部圆可以遮挡一部分刻度，来深化立体效果，刻度显示要跟随实际颗粒度变化，实际颗粒度变化是刻度使用快读淡入淡出变化。
>
> 触感面板中的布局还需要改进：整体分为左右两大块，左边是标题两个按钮，将简介删除，仅保留标题，两个按钮中开始阅读更大，右侧是两个滑块和旋钮，两个滑块和旋钮应该在面板中垂直居中，面板中的控件的分布更均匀，左右两边不要有过大的空隙，尽量上下左右的空隙一致

| # | 要求 | 实现位置 |
| --- | --- | --- |
| 1 | 纯色色块、不用线条 | 全控件零 `border`；体积只由亮色 cap 压在暗色 base 上形成 |
| 2 | 滑块 = 滑槽 + 滑块；侧面随位置反向露出；滑槽周围有刻度 | `wallOffset = THUMB_DEPTH * (2 * frac - 1)`；每档左右各一条实色刻度 |
| 3 | 旋钮 = 两个等大错开圆；侧面不随转动；刻度环被顶部圆压住；刻度跟随颗粒度并淡入淡出 | base/cap 各 224px 错开 14px；base 不含 `rotate`；刻度环夹在两者之间；`tickDetents` + `tickVisible` |
| 4 | 左右两大块；删简介；开始阅读更大；右侧整组垂直居中；空隙均匀 | 左栏 `lg:w-[460px]` 只有标题 + 两按钮；右组 `items-center`；`lg:justify-center lg:gap-14` |

隐含硬约束：**手感逻辑不得退化**。`THRESHOLD_MIN = 0.5` / `THRESHOLD_MAX = 0.95` / `HYSTERESIS = 0.6`
与 `anchorRef` + `creepRef` 的拖动期真值方案（D-25 §12）**逐字保留**，本轮只改视觉层。

### 2. 为什么必须去掉描边（这是语言问题，不是审美问题）

D-25 用 `border: 2px solid var(--ink)` 勾控件轮廓，那是「线稿」语言。而 `ToyButton`（D-02）的
体积**从来不靠描边**：

```
外层 .toy-button      背景 = --base（暗）
内层 .toy-button__top 背景 = --cap（亮），translateY(-depth)
```

只靠「亮色面压在暗色面上」就形成了厚度。全站按钮**一个 border 都没有**（唯一例外是
`f309b47` 事故后补的注释与结构，仍然不是描边）。

于是结论是刚性的：**控件要与按钮统一，就必须同样只用实色面 + 侧面，不能有描边。**

颜色也全部走语义 token，不出现十六进制（D-22 的约束同样适用于本轮）：

| 部位 | token |
| --- | --- |
| 滑槽 | `var(--line)` |
| 刻度 | `var(--ink)`（激活 0.75 / 未激活 0.28 透明度） |
| 滑块 cap / 旋钮 cap | `var(--cream)` |
| 滑块侧面 / 旋钮侧面 | `var(--coral-base)` |

### 3. 滑块：侧面方向随位置翻转

D-25 的拇指是「一层带描边的圆角块」。现在拆成两层实色块：

```tsx
<span data-thumb className="pointer-events-none absolute left-1/2"
  style={{ top: thumbTop, width: THUMB_W, height: THUMB_H, transform: 'translate(-50%, -50%)' }}>
  {/* 下层：侧面。位置随 frac 变化 */}
  <span data-thumb-wall className="absolute inset-0 rounded-[13px]"
    style={{ background: 'var(--coral-base)', transform: `translateY(${wallOffset}px)`, ... }} />
  {/* 上层：cap */}
  <span data-thumb-cap className="absolute inset-0 grid place-items-center rounded-[13px]"
    style={{ background: 'var(--cream)' }}>…</span>
</span>
```

偏移量：

```ts
const frac = detents > 1 ? visual / (detents - 1) : 1
const wallOffset = THUMB_DEPTH * (2 * frac - 1)   // THUMB_DEPTH = 9
```

| `frac` | `wallOffset` | 视觉效果 |
| --- | --- | --- |
| `1`（最上档） | `+9` | base 下移 → **侧面露在下方** |
| `0.5`（正中） | `0` | 两层完全重合 → **不露侧面** |
| `0`（最下档） | `-9` | base 上移 → **侧面露在上方** |

**为什么用 `2*frac - 1` 而不是别的曲线**：用户要的是「上侧露下、下侧露上、正中不露」，这是
一个**关于中点奇对称、在中点过零**的线性映射，`2*frac - 1` 是最简形式。任何非线性曲线
（如 `sign(d)*|d|^p`）都会让两端露出量相同但近中点处变化过快，反而失去「正中刚好贴合」的观感。

位移方向与 `visual` 关系由 `dragging` 控制 `transition`：

```ts
transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1.4, 0.4, 1)'
```

拖动中关掉过渡的理由与 D-25 §4 相同：磁滞本身就是一条位移曲线，再叠 CSS 补间等于双重延迟。

### 4. 滑槽的刻度

滑槽是 20px 宽的圆角纯色实块（`var(--line)`），**不是轨道 + 描边**。刻度不画在槽上，而是
画在槽**两侧**：每档一对 `10px × 4px` 圆角实色短条，左条 `left: 20`、右条 `left: 58`，
激活档透明度 `0.75`、其余 `0.28`。5 档滑块因此渲染 **10 条**（左 5 右 5）。

刻度条的 `top` 与拇指共用同一套插值：

```ts
`calc(${SLIDER_INSET}px + (100% - ${SLIDER_INSET * 2}px) * ${1 - markFrac})`
```

**刻度必须用实色条而不是 `border` 或 `background-image` 渐变**：前者会引入描边语言，后者无法
逐档高亮激活态。

### 5. 旋钮：两个等大圆 + 被压住的刻度环

```
DOM 顺序决定遮挡（同层后者在上）：
  ① base 圆   --coral-base, 224px, translateY(+7px),  不含 rotate
  ② 刻度环    translateY(+7px)，圆心对齐 base
  ③ cap 圆    --cream,       224px, translateY(-7px), rotate(visualDeg)
```

| 常量 | 值 | 作用 |
| --- | --- | --- |
| `KNOB_SIZE` | 300 | 命中区 |
| `KNOB_DISC` | 224 | **base 与 cap 都用这个尺寸** |
| `KNOB_DEPTH` | 14 | base `+7` / cap `-7`，两者错开 14px |
| `KNOB_TICK_INNER` | 88 | 刻度内端半径 |
| `KNOB_TICK_OUTER` | 128 | 刻度外端半径 |
| `TICK_FADE_MS` | 110 | 淡出 → 换数量 → 淡入 |

**侧面不跟随转动是硬要求，实现方式是一句话：base 圆的 `transform` 里根本没有 `rotate`。**

```tsx
// ① 侧面：只有位移，没有 rotate
transform: `translate(-50%, -50%) translateY(${KNOB_DEPTH / 2}px)`
// ③ 顶面：位移 + rotate
transform: `translate(-50%, -50%) translateY(-${KNOB_DEPTH / 2}px) rotate(${visualDeg}deg)`
```

刻度内端 88 < cap 半径 112，所以 cap 会**压住刻度环内侧一截**（实测内端被压到 81.1，外端 133.1
露出）—— 这就是立体感的来源，也是用户明确要的「顶部圆遮挡一部分刻度」。

刻度条 `height = 128 - 88 = 40`，宽度按档数取 `4`（>20 档）/ `5`（>10 档）/ `7`，
`transform: rotate(${deg}deg) translateY(-${dist}px)`。

### 6. 刻度数量变化必须淡入淡出（不能直接换）

**直接渲染 `detents` 会看到一圈刻度「瞬间重排」**：20 档变 36 档时，40 条 DOM 同时换角度，
视觉上是一次跳变。改为两级 state：

```tsx
const [tickDetents, setTickDetents] = useState(detents)
const [tickVisible, setTickVisible] = useState(true)

useEffect(() => {
  if (detents === tickDetents) return
  setTickVisible(false)                       // 先淡出
  const timer = setTimeout(() => {
    setTickDetents(detents)                   // 不可见时换数量
    setTickVisible(true)                      // 再淡入
  }, TICK_FADE_MS)
  return () => clearTimeout(timer)
}, [detents, tickDetents])
```

刻度环的 `opacity: tickVisible ? 1 : 0` + `transition: opacity 110ms ease`。
**110ms 是「快」的量化**：低于 ~90ms 浏览器几乎不采样中间帧，高于 ~160ms 就会感觉控件在「发呆」。
两个 `data-*` 暴露内部状态供探针断言：`data-tick-detents`、`data-tick-visible`。

### 7. 布局：左右两块、删简介、主按钮更大

```tsx
<section className="relative overflow-hidden rounded-[34px] p-4 sm:p-6 lg:p-8" style={{ background: 'var(--shell)' }}>
  <div className="rounded-[24px] p-5 sm:p-6 lg:p-8" style={{ background: 'var(--surface)' }}>
    <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-center lg:gap-14">

      {/* 左：只有标题 + 两个按钮 */}
      <div className="order-1 flex w-full flex-col gap-5 lg:w-[460px] lg:shrink-0">
        <h2 id="touch-panel-title" className="flex items-center gap-2 font-display text-2xl">…</h2>
        <ToyButton href="/posts" size="large" className="w-full"
          topClassName="h-[112px] justify-between px-7 text-[19px]">开始阅读 …</ToyButton>
        <ToyButton href="/about" size="large" variant="pink" className="w-full"
          topClassName="h-[80px] justify-between px-7">关于我 …</ToyButton>
      </div>

      {/* 右：两个滑块 + 旋钮，整组垂直居中 */}
      <div className="order-2 flex items-center justify-center gap-6 lg:shrink-0 lg:gap-7">
        <DetentSlider detents={5} … />
        <DetentSlider detents={2} … />
        <DetentKnob … />
      </div>
    </div>
  </div>
</section>
```

**删掉的三样东西**：`bio` 段落、说明段落、「旋钮暂未绑定功能」徽标。左侧**只剩标题 + 两个按钮**。
`TouchPanel` 因此**不再接收任何 props**（`siteConfig` 的 import 也从 `page.tsx` 一并删除）。

**不再用 `justify-between` 或 grid `[minmax(0,1fr)_auto_auto]`**：前者把两块顶到两端、中间挖出大洞；
后者把按钮组拉到极左、旋钮推到极右（D-25 §2 已否决过）。现在用 `justify-center` + 固定左栏宽度
`460px`，两侧余量由 `justify-center` 自动均分。

### 8. 布局实测数值（CDP，1440×1600，日间态）

| 实测项 | 数值 | 说明 |
| --- | --- | --- |
| 左右 gutter | `34.0 / 34.0` | **完全相等**，无左右大空隙 |
| 上下 gutter | `32.0 / 52.3` | 同量级 |
| 两块之间 gap | `56.0` | 无大洞 |
| 左块与右组垂直中心偏差 | `13.3px` | 右组已居中 |
| 两个按钮高度 | `123 / 91` | 主按钮（开始阅读）明显更大 |
| 旋钮两圆 | 各 `224 × 224` | **等大** |
| 两圆垂直错开 | `14.00` | `KNOB_DEPTH` |
| 刻度内端 vs cap 半径 | `81.1 < 112.0` | 被压住 |
| 刻度外端 vs cap 半径 | `133.1 > 112.0` | 外侧外露 |
| 卡内容宽 | `1116` | 1440 − 页边 − 两层 padding |

移动端 390px：`scrollW 391 / innerW 391`（无横向溢出），按钮 `290/290`、滑块 `88/88`、旋钮 `300`，
全部 ≥ 44px 触控目标。

### 9. 探针教训（两条，本轮新增）

**① `getBoundingClientRect()` 对带 `rotate()` 的元素返回的是外接包围盒。**

224px 的圆转 45° 后，rect 读到 **315.7 × 315.7**（= `224 × √2 ≈ 316.8`）。
它不仅让「两圆等大」这条断言假失败，还把 `capR` 从真实的 112 放大到 157.9，
连带让「刻度外露」也假失败。

```js
// 错
const cb = cap.getBoundingClientRect()   // 旋转元素 → 外接包围盒
// 对
const w = cap.offsetWidth, h = cap.offsetHeight   // 布局尺寸，不受 transform 影响
```

如果确实需要旋转后的**位置**，可以用「包围盒中心 == 旋转中心」反推：

```js
const realTop = rect.top + rect.height / 2 - h / 2
```

**这是一条通用规则：量尺寸用 `offsetWidth/offsetHeight`，量位置才用 rect，且旋转元素的位置要经中心换算。**

**② 回差使「从当前位置直线拖到中点」不是有效的中点测试。**

`HYSTERESIS = 0.6` 让「反向退档」比「正向推进」多需要 0.6 档，也就是从上方拖下来时每档要
多拖 `threshold + HYSTERESIS ≈ 1.325` 档。所以 `dragTo((detents-1)/2)` 从当前档直线拖到中点，
**根本到不了中点** —— 本轮实测停在 `value = 3`（中点应为 2），`wall = 3.87`，于是假失败。

修法不是放宽断言，而是**让测试走一条物理上可行的路径**：

```js
await dragTo(0)                    // 先到底（正向推进，每档只需 0.725 档）
const atMid = await dragTo((DETENTS - 1) / 2)   // 再正向拖两档到中点
```

实测 `wall = 0`、`value = 2`、`gap = 0.00` —— 正中确实完全不露侧面。

**教训**：断言「A 状态下量值应为 X」时，必须先确认**能稳定到达 A 状态**。这与 §D-25 的教训同源：
测试路径本身也是被测量对象的一部分。

### 10. 验证结果（31/31 PASS）

`.me/tmp/look2.mjs`（CDP + 无头 Edge，1440×1600），31 条断言全过。关键证据：

| 断言 | 实测 |
| --- | --- |
| 控件内无任何描边 | `none` |
| 拇指两层实色、无描边 | `wall=rgb(107,42,45)` / `cap=rgb(228,249,241)` / `borders=0px/0px` |
| 每档一对刻度、左右各一 | `bars=10 left=5 right=5 detents=5` |
| 顶部侧面露在下方 | `wall=+9`，`wallTop−capTop=+9.00` |
| 底部侧面露在上方 | `wall=−5.13`，`wallTop−capTop=−5.13` |
| 方向翻转 | `top=9 / bottom=−5.13` |
| **正中不露侧面** | `wall=0 value=2 gap=0.00` |
| 旋钮两圆等大 | `base=224×224 cap=224×224` |
| 两圆垂直错开 | `deltaTop=14.00` |
| base/cap 实色无描边 | `borders=0px/0px` |
| 刻度环内端被压住 | `tickInner=81.1 < capR=112.0` |
| 刻度环外侧外露 | `tickOuter=133.1 > 112.0` |
| 刻度数 = 档数 | `ticks=20 detents=20` |
| 刻度切换有 opacity 过渡 | `transition=opacity 0.11s` |
| **侧面不随转动** | `before = after = matrix(1,0,0,1,-112,-105)` |
| 顶面随转动 | transform 明显变化 |
| 旋钮仍能改滑块阈值 | `0.725 → 0.524` |
| 刻度数跟随颗粒度 | `20 → 36`（渲染 36） |
| 删 bio 与说明段落 | `paragraphs=0` |
| 两个按钮、主按钮更高 | `heights=[123, 91]` |
| 左右 gutter 相等 | `34.0 / 34.0` |
| 上下 gutter | `32.0 / 52.3` |
| 右组与左块垂直中心 | delta `13.3px` |
| 两块间 gap | `56.0` |
| **阻滞未退化** | 指针 `10.60px` → 拇指 `0.00px` |
| 中点不闪 | `0 mutations, flips=0` |
| 390px 无溢出 | `scrollW 391 / innerW 391` |
| 运行时错误 | 零 |

### 11. 未验证范围（诚实列出）

- **真实触屏未测**：全部用 `Input.dispatchMouseEvent`，`pointerType: touch` 与 `touch-action: none`
  的实际拦截未验。
- **屏幕阅读器未测**：`aria-valuetext` 的朗读顺序未验。
- **风格「够不够统一」是主观判断**：我只提供可测的客观性质（零描边、侧面三段翻转、两圆等大、
  刻度被压、刻度跟随颗粒度、空隙数值相等）。
- 只在 Chromium（Edge）验证，未测 Firefox / Safari。
- **可微调常量**（如果不满意观感，调这几个即可，都在 `touch-panel.tsx` 顶部）：
  `THUMB_DEPTH = 9`（滑块侧面最大深度）、`KNOB_DEPTH = 14`（旋钮两圆错开量）、
  `KNOB_TICK_INNER/OUTER = 88/128`（刻度内外端）、`TICK_FADE_MS = 110`（刻度淡入淡出）。

### 12. 本轮新增的可测锚点

`data-thumb`、`data-thumb-wall`、`data-thumb-cap`、`data-knob-base`、`data-knob-cap`、
`data-knob-ticks`、`data-tick-detents`、`data-tick-visible`、`data-wall`；
沿用 D-25 的 `data-detents`、`data-value`、`data-visual`、`data-threshold`、`data-dragging`、
`data-angle`、`data-knob-readout`。

**探针必须用这些锚点，不得靠 className 或 computed-style 猜测。** 加锚点时注意：`File.Edit`
的行范围必须覆盖完整语法单元（`style={{…}}` 与紧接的 `/>` 是一个整体），否则会吞掉 JSX 收尾 ——
本轮因此连续触发 `TS1005` / `TS1003` / `TS17002` / `TS1381` / `TS1382`。

---

## D-27 修正旋钮刻度位置与末端档位拖不动

用户报的两条：

> 旋钮的刻度应该画在旋钮侧面圆的外围，目前是入侵到了侧面圆内部，导致立体效果失效；滑块和旋钮无法从第二个刻度拖到第一个刻度

两条都是**几何/数学层面的硬缺陷**，不是观感调参。

### 1. 刻度入侵侧面圆：半径取值低于侧面圆半径

D-26 里写的是 `KNOB_TICK_INNER = 88` / `KNOB_TICK_OUTER = 128`，而侧面圆（base）半径是
`KNOB_DISC / 2 = 224 / 2 = 112`。刻度内端 88 < 112 —— **有 24px 长的一段刻度直接画在侧面圆的面上**。

后果正是用户描述的那样：刻度看起来像是刻在侧面的色块上，而不是「围在侧面外的环」，
于是「亮色顶面压在暗色侧面上、侧面外圈还有一圈刻度」这个三层结构就塌成了两层，立体感消失。

**修法**：内端抬到 116，外端 144。

| 常量 | 旧 | 新 | 依据 |
| --- | --- | --- | --- |
| `KNOB_TICK_INNER` | 88 | **116** | `baseR = 112`，留 4px 可见间隙，严格在外 |
| `KNOB_TICK_OUTER` | 128 | **144** | `KNOB_SIZE/2 = 150`，留 6px 不越出命中区 |

改完实测 `tickInner = 115.8 > baseR = 112`、`tickOuter = 144.2 < 150`。

**顶面圆（cap）仍然遮住顶部那一截，这是刻意保留的。** cap 半径同为 112、但 `translateY(-7)`，
刻度环中心对齐 base（`translateY(+7)`），所以两者圆心相距 14。沿正上方，cap 能覆盖到半径

```
14 + capR = 14 + 112 = 126
```

于是顶部刻度在 116..126 之间有 **10px 被 cap 压住**（整条刻度长 `144 - 116 = 28px`），
这正是 D-26 要的「顶面遮挡一部分刻度」。沿水平方向 cap 只覆盖到
`sqrt(112² − 14²) ≈ 111.1 < 116`，所以左右两侧刻度**完全露出**。

两端等大且只错开 14px 时，遮挡量在几何上就这么多 —— **想遮挡更多只能加大 `KNOB_DEPTH`，
不能靠缩小刻度半径**，那会重新变成「刻度画在侧面圆里」。

### 2. 末端档位拖不动：回差的固定量超过了轨道末端的剩余行程

用户说的「无法从第二个刻度拖到第一个刻度」，**滑块与旋钮同因**。

`resolve()` 里的判据是：

```ts
const need = total > 0 ? threshold : threshold + HYSTERESIS
if (Math.abs(total) >= need) { … }
```

`threshold` 的最小值是 `0.5`，`HYSTERESIS = 0.6`，所以**逆向退档最少要 1.1 档的累积位移**。

而从第 2 档（index 1）退到第 1 档（index 0）时，指针最多只能从档心 1 走到轨道端点 0，
**可积累的位移上限恰好是 1.0 档**：

```
1.0 < 1.1   →   判据在数学上永远不成立   →   端档成了「拖不到的死档」
```

这不是手感问题，是不等式无解。D-25 §12 加回差时只验证了「中点不闪」，
没验证「两端可达」——**回差把突破点往后推了 0.6 档，但没有人在两端补回这段行程**。
（D-26 §9 那条「回差让直线拖到中点不可达」的探针教训，其实是同一根因的另一个面：
连中点都可能到不了，端档更必死。）

**修法：末端软着陆（end-room clamp）。**

```ts
const wanted = total > 0 ? threshold : threshold + HYSTERESIS
// 这一方向还剩多少可拖行程（单位：档）
const room = total > 0 ? detents - 1 - curAnchor : curAnchor
const need = Math.min(wanted, room * END_ROOM_RATIO)   // END_ROOM_RATIO = 0.8
```

| 位置 | `room` | `wanted` | `need = min(...)` | 效果 |
| --- | --- | --- | --- | --- |
| 中段（如 5 档停 2、向上） | 2 | 0.5 | **0.5** | 封顶不生效，手感不变 |
| 中段（如 5 档停 2、向下） | 2 | 1.1 | **1.1** | 封顶不生效，回差照旧 |
| 5 档停 1、向下到 0 | 1 | 1.1 | **0.8** | 可达（且不要求压到端点） |
| 5 档停 3、向上到 4 | 1 | 0.5 | **0.5** | 不变（`wanted` 已更小） |
| 旋钮停 index 1、反向到 0 | 1 | 1.1 | **0.8** | 可达 |

**为什么是 0.8 而不是 1.0**：取 1.0 意味着指针必须**精确**压在轨道端点上才算突破，
差 1px 就拖不动，在触屏上几乎不可能做到。0.8 让「接近端点」就能落地。
**为什么 0.8 仍安全**：它大于几何档界 0.5，所以突破点依然落在档界之后，
不会把 D-25 §12 修掉的中点闪烁重新引回来。

`DetentSlider` 与 `DetentKnob` 两处 `resolve` 同步修改（旋钮的 `knobThreshold 0.5` /
`knobHysteresis 0.6` 数值不变，只加同一层封顶）。

### 3. 验证（`.me/tmp/d27.mjs`，CDP + 无头 Edge，11/11 PASS）

| 断言 | 实测 |
| --- | --- |
| 刻度内端在侧面圆之外 | `tickInner=115.8 > baseR=112` |
| 刻度外端不越出命中区 | `tickOuter=144.2 < 150` |
| cap 仍遮住刻度环顶部 | `tickInner=115.8 < capUpReach=126` |
| cap 不遮住左右两侧刻度 | `tickInner=115.8 > capSideReach=111.1` |
| **5 档滑块 1 → 0 可达** | `value=0` |
| 并且能反向回到 1 | `value=1` |
| **2 档主题滑块 1 → 0 可达** | `value=0` |
| **旋钮 index 1 → 0 可达** | `value=0`（共 8 档） |
| 阻滞未退化 | 指针 `6.36px` → 拇指 `0.90px`，比值 **0.142** |
| 中点抖动不闪 | `mutations=0`，`flips=0` |
| 运行时错误 | 0 |

截图目视（`.me/tmp/d27-knob.png` 2× 特写、`d27-panel.png` 面板 1.5×）确认：刻度整圈都在侧面圆外，
顶部几条被顶面圆压住一截，侧面在下方露出一道深色月牙 —— 三层结构恢复。

### 4. 第四类探针缺陷：旋转中心的坐标系

第一次跑探针时报 `tickInner=108.9 < baseR=112` 假失败。原因是**量半径的原点取错了**：

- 刻度容器 `[data-knob-ticks]` 与 base 都带 `translateY(+7)`，它们的**共同圆心**比
  `KNOB_SIZE` 容器的几何中心**低 7px**。
- 探针原来用 `KNOB_SIZE` 的 `getBoundingClientRect()` 中心当原点，于是所有半径都被算小 ~7px
  （115.8 → 108.9）。

**规则**：量「圆环半径」时，原点必须是**圆环自己**的矩形中心，不是外层容器的中心。
与 D-26 §9 的 `offsetWidth` 教训合并成一条更通用的原则 —— **先确认坐标系，再量长度**。

### 5. 未验证范围

- 真实触屏未测（仍为 `Input.dispatchMouseEvent`）。
- 移动端 390px 只做了静态推断：`tickOuter = 144 < KNOB_SIZE/2 = 150`，因此不会比容器更宽；
  未重新跑 390px 的 `scrollWidth` 断言（该轮脚本因 PowerShell heredoc 转义失败未执行）。
- 屏幕阅读器、Firefox/Safari 未测。
- 「末端 0.8 档就落地」的手感由用户上手判断；若要更紧，调 `END_ROOM_RATIO`（上限 1.0）。

---

## D-28 滑块上下拖动阻力必须对称：抛弃回差，改用「阈值 + 死区」

用户报：

> 滑块往上拖时，鼠标拖动到上面一个刻度，滑块就能跟过去，但是下拖时，鼠标要往下拖动到 1.5 甚至 2 个刻度，滑块才动

### 1. 根因：回差只加在一个方向

D-25 §12 为了消除中点闪烁，给「退回方向」单独加了 0.6 档回差：

```ts
const need = total > 0 ? threshold : threshold + HYSTERESIS
```

这个写法**天然不对称**：正向只需 `threshold`，反向需要 `threshold + 0.6`。
默认 `threshold = 0.725` 时：

| 方向 | 所需行程 | 折算成「格」 |
| --- | --- | --- |
| 向上 | 0.725 档 | 约 0.7 格 → 用户说「一个刻度就跟过去」 |
| 向下 | 1.325 档 | 约 1.3~1.5 格 → 用户说「要拖 1.5 甚至 2 个刻度」 |

实测比值 `1.325 / 0.725 = 1.83`，与用户的主观描述完全吻合。
**这是一次「为修 bug 引入新 bug」的典型**：回差解决了闪烁，代价是方向性偏差。

### 2. 关键认识：闪烁其实不需要回差来防

回差的论证是「突破点与回退点重合 → 指针停在那里会来回翻」。但仔细推导会发现不必如此：

> **突破后，指针与档心的距离必然 ≤ 0.5 档。**

因为换档条件是 `next = round(raw) !== anchor`，`round` 在两档中点取整——
指针没有越过半档就不会换档。所以突破那一刻，`|raw - newAnchor| ≤ 0.5`。

于是**只要 `threshold > 0.5`，这个位置本身就不满足反向判据**，下一条 `pointermove`
（哪怕 1px 抖动）也无法翻回去。不需要任何额外的回差量。

反过来说，`threshold = 0.5` 时突破点恰好落在半档处，`|raw - anchor| = 0.5 = threshold`，
判据取等号成立 —— 这是**唯一会闪的临界值**。D-25 选 0.5 作下限，等于踩在刀刃上，
所以当时必须再加 0.6 回差才稳得住。

### 3. 修法：双向同阈值，把下限从 0.5 抬到 0.65

```ts
// 修改前
const need = total > 0 ? threshold : threshold + HYSTERESIS
// 修改后：双向同值，方向不改变阻力
const need = Math.min(threshold, room * END_ROOM_RATIO)
```

同时把 `THRESHOLD_MIN` 从 `0.5` 抬到 **`0.65`**，`HYSTERESIS` 常量**整个删除**。

**为什么 0.65**：每个档心周围形成一条**宽度 `2t − 1` 档的死区**（`t` 为阈值）：

| `t` | 死区宽度 `2t−1` | 含义 |
| --- | --- | --- |
| 0.50 | **0** | 无死区，突破点即回退点 → 必闪 |
| 0.65 | **0.30** | 指针在中点 ±0.15 档内抖动绝不翻转 |
| 0.95 | 0.90 | 极宽死区，阻力很大 |

`2t − 1` 这个式子值得记住：**死区宽度是阈值超过半档部分的 2 倍**。
0.65 给出 0.30 档死区，实测抖动 ±0.12 与 ±0.14 档都不翻档，且阻力（0.65 档）依然在
「轻到能拖、重到有阻滞感」的区间。

`THRESHOLD_MAX` 保持 `0.95`。末端软着陆（D-27）原样保留，此时它的作用变成
「防止 0.95 逼近轨道末端 1.0 档的物理极限」，仍有必要。

### 4. 旋钮同步

`DetentKnob` 的 `knobThreshold` 从 `0.5` 抬到 **`0.65`**，`knobHysteresis` 删除，
`resolve` 改用同一套 `wanted = knobThreshold` 对称判据。

旋钮阈值**保持固定，不让 ease 回灌自身**：旋钮是「调节器」，它的手感不该被自己调出来的
数反过来改变，否则越拧越钝、无法回中。

### 5. 验证（两个探针，15/15 PASS）

#### `.me/tmp/d28.mjs`（默认档位，threshold = 0.725，8/8）

用细步扫描（0.02 档/步）精确测量「从档心出发，指针走多远第一次换档」：

| 断言 | 实测 |
| --- | --- |
| **上拖与下拖突破行程相同** | 上 `0.820` / 下 `0.820`，**diff = 0.000** |
| 上/下比值接近 1.0 | `ratio = 1.000` |
| 中点抖动不闪（真实鼠标） | 26 次移动后 `values=[2]`，`base=2` |
| 中点抖动不闪（合成 PointerEvent） | `mutations=0` |
| 底端档可达 | `value=0` |
| 顶端档可达 | `value=4 / 4` |
| **阻滞未退化** | 指针 `6.36px` → 拇指 `0.90px`，比值 **0.142**（与 D-25 的 0.14 一致） |
| 旋钮也对称 | 上 `0.660` / 下 `0.660`，**diff = 0.000** |
| 运行时错误 | 0 |

#### `.me/tmp/d28b.mjs`（最轻档位，threshold = 0.65，死区最窄，7/7）

这是最危险的配置——死区只有 0.30 档：

| 断言 | 实测 |
| --- | --- |
| 旋钮推到最轻端 | `value=11 / 11` |
| 滑块阈值确实降到最小 | `threshold=0.65` |
| **最轻档仍对称** | 上 `0.660` / 下 `0.660`，**diff = 0.000** |
| **最窄死区仍不闪** | `values=[2]`，`base=2` |
| 底端档可达 | `value=0` |
| 顶端档可达 | `value=4` |
| 运行时错误 | 0 |

**「最轻档」这一组是必须有的反向对照**：对称化改动最可能破坏的就是极端配置，
只测默认档会漏掉死区归零的退化。

### 6. 方法论教训

**① 用一个物理量同时承担两件事，迟早互相牵制。**
回差被用来「防闪烁」，但它本质是「方向性阻尼」。把一个方向性参数当作稳定性补丁，
结果就是用户体验到方向性偏差。正确做法是**找到真正控制稳定性的那个量**
（这里是 `threshold > 0.5` 给出的死区 `2t − 1`），只用它一个。

**② 「修好了」不等于「没引入新问题」。**
D-25 §12 的回差确实修好了闪烁（探针 11/11 PASS），但**没有一条断言测「上拖与下拖是否一样费力」**。
这是第三次同类教训：
- D-25 24/24 PASS 漏掉「停在边界会闪」
- D-27 11/11 PASS 漏掉「上下阻力不对称」
- 本条 15/15 PASS 补上对称性断言

**新规则：任何「有方向」的交互约束，必须有一条断言比较两个方向的阈值/行程。**
只测「能动」「能到」是不够的，要测「两个方向一样」。

**③ 临界值不是安全值。**
`THRESHOLD_MIN = 0.5` 时死区宽度恰好为 0——这不是「刚好够用」，而是「刚好不够用」。
参数的下限应当留出余量，而不是取理论边界。

### 7. 未验证范围

- 真实触屏未测（仍为 `Input.dispatchMouseEvent`）。
- 屏幕阅读器、Firefox / Safari 未测。
- **「0.65 档是否需要更轻/更重」由用户上手判断**：改 `THRESHOLD_MIN` 即可，
  但**必须保持 > 0.5**，否则死区归零、中点闪烁必然重现。这条是硬约束，不是调参建议。
- `CREEP_RATIO`（0.14）与 `END_ROOM_RATIO`（0.8）本轮未改，行为与 D-27 一致。

## D-29 后台登录改为「邮箱 + 环境变量口令」：删掉一次性令牌链路

### 1. 需求与约束

用户要求：把后台「发送验证邮件 / 一次性登录链接」改成账号口令登录，账号为 `ADMIN_EMAIL`，口令为 `INTERACTION_HASH_SALT`。

约束条件（来自既有架构决策，不得削弱）：

- 每个 Server Action / Route Handler 独立鉴权，不依赖 layout 守卫或 UI 隐藏。
- `middleware.ts` 不是安全边界，只做 cookie 存在性检查。
- 重定向只允许同源白名单后台路径（拒 `//host`、反斜杠、`..`）。
- 后台所有响应带 `X-Robots-Tag: noindex, nofollow`。
- 客户端组件不得引入 server-only 模块。

### 2. 口令为什么不进数据库

旧实现里有一条「令牌只存哈希」的规则。改成口令登录后最容易顺手做的事是新建一张 `admin_credentials` 表存 `sha256(salt + password)`。**这条弯路被明确否决**：

账号来自 `ADMIN_EMAIL`，口令来自 `INTERACTION_HASH_SALT`，两者都是环境变量。服务端每次登录现算现比，数据库里既没有口令也没有口令哈希。拖库这条路根本不产出可用凭据 —— 这比「存哈希再校验」更强，也顺带满足设计文档里「不自建密码存储」的原始约束。

代价必须说清，否则是自欺：改口令 = 改环境变量 + 重启；没有「找回口令」，也没有按时轮换机制。单人后台可接受，多人场景应换成真正的身份提供方。

### 3. 比较方式：先摘要，再恒定时间比较

```
function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest()
}

function safeEqualSecret(left, right) {
  return timingSafeEqual(digest(left), digest(right))
}
```

两个要点：

1. **必须先摘要**。`crypto.timingSafeEqual` 在两侧长度不等时**直接抛异常**，不是返回 `false`。口令长度本身就是信息，直接传原始字符串会得到一个会抛错的比较函数。
2. 摘要后长度恒为 32 字节，`timingSafeEqual` 永不抛，比较耗时与输入长度无关。

同一个函数也用于会话令牌哈希的比较（原来那个 `safeEqualHex` 因为校验的是等长 hex 所以不抛，但换成定长摘要后语义统一、不再依赖「两边一定等长」这个隐含前提）。

### 4. 不提前返回：两项判断必须都算完

```
const emailMatches = isAllowedAdminEmail(normalized)
const passwordMatches = safeEqualSecret(password, adminPassword())

if (emailMatches && passwordMatches) return { ok: true, email: normalized }
return { ok: false, reason: 'denied' }
```

不能在「邮箱不在白名单」时立即 `return`：那样响应时间会变成「该邮箱是否为管理员」的旁路 —— 名单外邮箱比名单内邮箱快一个口令比较的时间。两行都算完再合并，代价是几十微秒，换来的是不可区分。

### 5. 失败文案只有一句

`DENIED_MESSAGE = '邮箱或口令不正确。'`

「邮箱不在名单」与「口令不对」共用同一句话。旧实现里同样是这个思路（对外统一文案防邮箱枚举），本轮延续。

限流键用 `admin-login:${hashValue(\`email:${email}\`)}` —— 内存 Map 里没必要留原始邮箱。参数 `5 次 / 5 分钟`，与旧实现的 `3 次 / 10 分钟` 不同：口令登录是可在线猜测的，窗口要短、次数要松一点，让人输错几次仍能继续，但不足以暴力搜索。

### 6. `isAdminConfigured()` 的语义变了

旧版：`adminAllowlist().length > 0`。

新版：`adminAllowlist().length > 0 && adminPassword().length > 0`。

原因是现在**缺口令等于没有凭据可校验**。如果只检查账号，`INTERACTION_HASH_SALT` 未配置时 `adminPassword()` 返回空串，那么「提交空口令」就会匹配成功 —— 这是一个完全开放的后台。三处守卫（`(protected)/layout.tsx` 的未配置分支、登录 Action 的 `unavailable` 分支、`getAdminIdentity()` 的早退）都调用同一个函数，因此一处修正三处生效。

### 7. 两个输入字段必须是受控的

React 19 在 `<form action={fn}>` 提交后会自动重置非受控字段。口令登录尤其不能这样：口令输错一次，邮箱被清空、口令也没了，人得从头再打一遍。`email` 与 `password` 都用 `useState` + `onChange` 受控。

这条教训来自 D-13 的「编辑器校验失败清空正文」，同一个机制、第二次踩到。

### 8. 删掉的东西

| 删除项 | 理由 |
| --- | --- |
| `app/admin/(auth)/login/verify/route.ts` 整个文件与目录 | 令牌兑换入口，没有令牌就没有兑换 |
| `lib/auth/admin.ts` 的 `createLoginToken` / `consumeLoginToken` | 令牌链路的读端与写端 |
| `TOKEN_TTL_MS`、`generateSecret` 常量与函数 | 只被上面两个函数使用 |
| `LoginState.devLink` 字段与表单里的回显 `devLink` 渲染 | 开发环境回显登录链接，现在没有链接 |
| 新增迁移 `20261023000001_admin_password_login.sql`：`drop table admin_login_tokens` + 重写 `purge_expired_admin_auth()` | 见下 |

**为什么用一条新迁移显式 drop，而不是留着这张表**：留着有一个具体后果 —— `purge_expired_admin_auth()` 仍在 `delete from admin_login_tokens`，而一张没人写入的表永远只有过期行，每次清理都在做无用功；更麻烦的是后来的人读 schema 会以为还存在「发链接登录」这条路径，而代码里根本没有。

**迁移内部的顺序不能反**：先 `create or replace function` 把清理函数对 `admin_login_tokens` 的引用去掉，再 `drop table`。反过来的话，两者之间的窗口里调用清理函数会直接报错。

`admin_sessions` 与 `admin_audit_log` 不动 —— 与新的登录方式完全兼容。

### 9. 验证（真实浏览器 + HTTP，20 项）

用系统无头 Edge + CDP（端口 9395）跑 `.me/tmp/adm-probe.mjs`，同时用 `fetch` 做无 cookie 的 HTTP 基线。验证实例是 3100 端口的生产构建，环境变量注入为 `ADMIN_EMAIL=probe-admin@example.com`、`INTERACTION_HASH_SALT=probe-salt-7f3a9c1e5b2d4a86`（刻意与本地 `.env.local` 无关）。

| 断言 | 实测 |
| --- | --- |
| 未登录访问 `/admin` 被重定向 | `307` → `/admin/login?next=%2Fadmin` |
| 重定向响应也带 noindex | `noindex, nofollow` |
| 登录页可访问且带 noindex | `200` / `noindex, nofollow` |
| 口令框 autocomplete 正确 | `current-password` 存在 |
| 旧的「发送登录链接」文案已消失 | `false` |
| 旧的「一次性登录链接」文案已消失 | `false` |
| `devLink` 字样已从 HTML 消失 | `false` |
| `/admin/login/verify` 路由已不存在 | `404` |
| `?next=//evil.com` 被清洗 | 隐藏域 = `/admin` |
| `?next=https://evil.com/x` 被清洗 | 隐藏域 = `/admin` |
| `?next=/admin/posts` 正常保留 | 隐藏域 = `/admin/posts` |
| **口令错误被拒，且邮箱不被清空** | 停在 `/admin/login`；文案「邮箱或口令不正确。」；`aria-invalid` 命中 2 个字段；`emailValue` 仍为 `probe-admin@example.com` |
| **口令正确可进入后台** | 落到 `/admin`；无错误文案；`aria-invalid=0`；页面出现「退出登录」 |
| 会话 cookie 属性 | 存在；`httpOnly=true`；`sameSite=Lax` |
| 带有效 cookie 访问 `/admin` | `200`；带 `noindex, nofollow`；渲染出后台外壳 |
| **伪造 cookie 被服务端拒绝** | `307` → `/admin/login?next=/admin`（middleware 只验存在，真正拒绝来自 `requireAdmin()`） |
| 点击退出后回到登录页 | `/admin/login`，登录表单在场 |
| 退出后再访问 `/admin` | `307` → `/admin/login?next=%2Fadmin` |
| 连续失败触发限流 | 第 4 次起文案变为「尝试过于频繁，请 NNN 秒后再试。」 |
| 运行时错误 | 0（无 `FATAL`、无 `PROFILE_CLEANUP_FAILED`） |

限流触发在第 4 次而非第 6 次，是因为本次会话此前已消耗 1 次失败尝试（口令错误那一轮），计数是同一个桶、同一进程内累积 —— 这正是限流该有的行为，不是缺陷。

`typecheck` 0；`next build` 0（13/13 静态页，`/admin/login` 存在、无 `/admin/login/verify` 条目）；路由类型未退化（公开内容页仍为 `○ Static` / `● SSG`）；迁移 dry-run 只列出 `20261023000001_admin_password_login.sql` 一条。

### 10. 一个探针层面的坑

第一版验证时，`.next/types/validator.ts` 里仍有指向已删除 `verify/route.ts` 的引用，`tsc` 报 `TS2307`。这不是源码错误 —— `.next` 是上一轮构建的产物。**先跑一次 `next build` 让 Next 重新生成 `.next/types`，再跑 typecheck**，错误消失。顺序反过来会一直看到这条幽灵错误。

### 11. 未验证范围

- 真实触屏、屏幕阅读器、Firefox / Safari 未测（仅 Chromium 无头 + CDP）。
- 口令强度没有服务端校验 —— `INTERACTION_HASH_SALT` 若被填成短串，登录依然接受。这是刻意的：它是部署者自己的凭据，加最小长度门槛只会让人把短串改成短串加点号的更差做法。生产部署应使用足够长的随机串。
- 多实例部署时内存限流各自独立计数（已知局限，与 `lib/interactions/rate-limit.ts` 的既有说明一致）。
- 没有口令轮换、没有多用户、没有「找回口令」。用户明确只要求单人账号口令登录，这些不在范围内。

## D-30 `scripts/` 下的工具必须自己加载 `.env.local`

### 1. 症状与误判

换一台电脑部署，按文档配好 `.env.local`，`npm run dev` 首页与文章页都正常。但访问任何真正读库的页面（首页文章列表）报：

```
Error: [db] 查询失败：relation "public.posts" does not exist
```

第一反应是「代码里的表名写错了」。实际不是：`lib/data/adapters/postgres.ts` 第 162 行与第 172 行写的都是 `from public.posts`，schema 限定名完整、拼写正确。

真正的原因是**那个库从来没跑过迁移**，`public` schema 是空的。`posts` 不存在不是因为名字错，是因为表根本没建。

### 2. 为什么迁移没跑成

关键事实：**Node 不会自动加载 `.env.local`**，那是 Next.js 的运行时行为。

`scripts/` 下的工具（`db-migrate.mjs`、`db-import-content.mjs`、`db-aggregate.mjs`、`db-health.mjs`、`db-setup.mjs`）都是 `node scripts/xxx.mjs` 直接跑，走纯 Node，看不到 `.env.local`。修复前 `scripts/` 里对 `--env-file`、`dotenv`、`loadEnvFile` 的检索命中数都是 **0**。

于是形成一条很隐蔽的失效链：

| 步骤 | 用户看到 | 实际情况 |
| --- | --- | --- |
| 配好 `.env.local` | 「配置完成」 | — |
| `npm run dev` | 页面正常 | Next 加载了 `.env.local`，连上库 |
| `npm run db:migrate` | `[migrate] 缺少 DATABASE_URL。示例：postgres://user:pass@127.0.0.1:5432/playbook` | 纯 Node 读不到那个文件 |
| 以为「配置有问题」但配置明明对 | 卡住 | 错误信息把人指向一个已经配好的文件 |
| 跳过迁移直接跑 dev | 首页 500 | 连上了一个空库 |

**错误信息指向了错误的排查方向**，这比报错本身更贵。实测复现：在没有任何 `DATABASE_URL` 环境变量的全新 shell 里跑 `npm run db:migrate:dry`，修复前 `退出码 1` + 「缺少 DATABASE_URL」；修复后 `退出码 0` + 正常列出 `将执行 20261023000001_admin_password_login.sql`。

### 3. 修法：`scripts/lib/load-env.mjs`

一个 66 行的模块，被 5 个脚本在 import 区首位副作用引入：

```
import './lib/load-env.mjs'
```

它按 Next.js 的优先级顺序尝试 `.env.<NODE_ENV>.local` → `.env.local` → `.env.<NODE_ENV>` → `.env`，逐行解析 `KEY=VALUE` 后写入 `process.env`。

三条边界是刻意设计的：

1. **不覆盖已有环境变量**。CI 里显式传入的值必须胜过文件内容，否则「本地能跑、CI 跑错库」这类问题会回来。
2. **不打印任何东西**。连键名都不打印 —— 日志里不该出现配置指纹。
3. **文件不存在是正常的**，静默跳过。首次克隆、CI 环境都没有 `.env.local`，不能因此报错。

### 4. 两个解析细节

**引号内的值不剥注释**：口令、连接串里可能有 `#`。所以成对引号包裹的值只去引号、不处理注释；只有未加引号的值才把「空格 + `#`」之后当注释。这与 dotenv 的习惯一致。

**`NODE_ENV=test` 时跳过 `.env.local`**：与 Next.js 的行为对齐，避免测试跑在开发者本地库上。

### 5. 验证

| 断言 | 修复前 | 修复后 |
| --- | --- | --- |
| 全新 shell（无 `DATABASE_URL`）跑 `db:migrate:dry` 退出码 | `1` | **`0`** |
| 输出 | `[migrate] 缺少 DATABASE_URL` | `[migrate] 目标数据库：自建 PostgreSQL` + `将执行 20261023000001_admin_password_login.sql` |
| 5 个脚本 `node --check` | — | 全部 `0` |
| `load-env.mjs` 语法 | — | `0` |
| 改动范围 | — | 5 个脚本各 +2 行，新增 1 个文件 |

### 6. 方法论教训

**「配置好了」和「这条命令读到了配置」是两件事。**

排查时我一开始也在怀疑表名、schema、代码。真正定位靠的是一次对照实验：在**同一台机器、同一个项目**上，从环境变量里拿走 `DATABASE_URL` 后重跑同一个命令。如果它在「配置明明存在」的情况下依然报缺配置，那就说明它压根没读那个配置文件 —— 这是唯一能区分「配置错」与「读取路径错」的办法。

以后凡是「文档说配这里、命令说不认识」的分歧，都应该先做这个对照，而不是先读配置内容。

### 7. 未验证范围

- 未在 Linux / macOS 下跑过（`readFileSync` + `path.join` 是平台无关的，但没有实测）。
- 未验证含 `\r\n` 的 `.env.local`（解析用了 `split(/\r?\n/)`，理论上覆盖，但没有实测样本）。
- 未验证带 BOM 的 `.env.local`。若首个键名带 BOM，正则 `/^[A-Za-z_][A-Za-z0-9_]*$/` 会拒绝该行，表现为「这个键没生效」而不是报错。这是有意的保守行为，不是遗漏。
- 未处理多行值（`KEY="line1\nline2"`）。当前项目的 env 都是单行。

## D-31 文章 slug 与时间轴节点 ID 改为服务端自动生成

### 1. 需求

原文：`文章和时间轴的slug应该是自动生成的唯一id值，而不是让用户自己填`

改造前有两处手填：`/admin/posts/new` 的「网址标识（slug）」输入框，`/admin/timeline` 的「节点 ID」输入框。两者都是正则 `^[a-z0-9]+(?:-[a-z0-9]+)*$` 的约束，作者必须自己想一个符合格式、且尚未被占用的串。

### 2. 为什么不再让人填

用户要写的是内容，不是网址。要求作者为一个中文标题想一个「小写字母、数字与连字符」的串，结果只有三种：

- 与内容无关的占位词（`post-1`、`test`、`a`）；
- 从别处复制来的重复词，第一次撞上唯一约束才知道要改；
- 干脆不填，然后被格式校验拦下来。

这三件事都不该由写字的人承担。slug 是**标识**，不是**内容** —— 标识的职责是唯一且稳定，恰好是随机串最擅长的事。

### 3. 为什么不用标题转写

最直觉的方案是「把标题 slugify 成拼音或英文短横线串」。这条路在本项目里走不通：

- **中文标题经 slugify 只剩空串。** 「把个人网站做成一台可玩的记录机」一个 ASCII 字母都没有，任何 `[^a-z0-9]` 过滤后都是 `''`，而数据库有 `constraint posts_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')` —— 空串直接被拒绝，表现为创建失败。
- **转拼音则既不可读又易撞。** 「关于我」与「关于你」的拼音前缀相同，长短标题压缩后碰撞概率远高于随机串；而且拼音串对一个中文读者来说仍然不是「可读的网址」，只是把不可读从字母变成了另一串字母。

更关键的一点：**标题是会改的。** 一旦 slug 由标题派生，改标题就会顺手改掉网址，任何已分享出去的链接都会失效。把「改名」与「换地址」绑在一起，是这类系统最常见的破坏性设计。

### 4. 为什么是 12 位十六进制

生成规则：

| 对象 | 形态 | 例 |
| --- | --- | --- |
| 文章 slug | `post-<12 位小写 hex>` | `post-83f57d70e773` |
| 时间轴节点 ID | `tl-<12 位小写 hex>` | `tl-a3ac727196ad` |

12 位十六进制 = **48 位随机**，共 **2.8×10^14** 个取值。按生日界估算，要在一张表里堆到约 **2000 万行**，碰撞概率才到 50% —— 个人内容站几十年都到不了这个量级。

长度上是取舍：`post-` 加 12 位共 **17 字符**，放进 `/posts/post-83f57d70e773` 仍然读得下去、能整段选中复制；再短（8 位 = 32 位随机）在百万行量级就开始有可感知的碰撞；再长则开始影响 URL 的可读与可记。

`tl-` 与 `post-` 前缀的作用不是防碰撞，而是**在只看字符串时就能分辨这是哪类标识** —— 后台日志、活动事件、缓存失效键里到处都是裸 id，有前缀就不必回头查表。

### 5. 唯一性不靠概率，靠约束

生成器只负责给出**候选值**。真正的保证来自数据库约束，配合 `on conflict ... do nothing returning ...` 让「撞了就换一个」在**一条语句里原子完成**：

```
insert into public.posts (...) values (...)
on conflict (slug) do nothing
returning slug
```

`returning` 行数为 0 说明这一轮撞了，换一个候选重试，上限 `SLUG_GENERATE_ATTEMPTS = 4`。时间轴新建同理（`ID_GENERATE_ATTEMPTS = 4`）。

**这里刻意不用「先查再插」。** 旧实现里有一个 `postSlugExists(slug)`，在插入前单独查一次。那种写法有一个 TOCTOU 窗口：查完之后、插入之前，另一条请求可能刚好插入了同一个值，于是两条都以为自己是唯一的，其中一条在约束上失败并抛出未被处理的错误。改用 `on conflict do nothing returning` 之后，判断与写入是同一个原子操作，窗口不存在。`postSlugExists` 已随本次改动删除。

值得注意的是「4 次都撞」这个分支实际上永远不会走到。留着它不是为了容错，而是为了**不写出一个可能死循环的 `while(true)`**：任何「重试直到成功」的循环都必须有一个明确的出口，哪怕这个出口在数学上不可达。

### 6. 生成后不可变

- 编辑时 slug 只作为**定位条件**：`where slug = $1 and version = $2`，永远不会出现在 `UPDATE` 的 `SET` 列表里。
- 编辑页用 `<input type="hidden" name="slug">` 把原值带回，仅用于定位；表单上没有可见输入框，用户改不了。
- 时间轴节点同理：编辑态渲染 hidden 的 `id` 并在页面上只读展示「节点 ID xxx · 由系统生成，不可修改」。

**改标题是编辑行为，换网址是破坏行为，两者本来就不该绑在一起。** 这条约束的收益是：以后任何标题、摘要、封面的调整都不会让历史链接 404，也不需要维护重定向表。

`GENERATED_ID_PATTERN = /^(?:tl|post)-[0-9a-f]{12}$/` 只做**形状**校验，用来挡「手工构造的请求拿编辑表单当新建提交」这类情况，不做业务校验 —— 存在的意义是把「显然不像本系统生成的 id」拒在数据库之外，而不是判断这个 id 是否属于某人。

### 7. 界面与表单的具体变化

| 位置 | 改造前 | 改造后 |
| --- | --- | --- |
| `/admin/posts/new` 发布面板 | 可编辑的 slug 输入框 | 说明文字：「保存时自动生成（形如 post-3f9a2b1c5d7e），不需要填。生成后不会变，改标题也不影响已有链接。」 |
| `/admin/posts/<slug>/edit` 发布面板 | 可编辑的 slug 输入框 | 只读展示当前 slug + 「由系统生成，不可修改（改网址会让已有链接失效）」 |
| `/admin/timeline` 新建表单 | 必填的「节点 ID」输入框 | 无输入框 |
| `/admin/timeline` 编辑表单 | 必填的「节点 ID」输入框 | hidden + 只读展示当前 ID |

服务端对应两处：

- `savePostAction` 里 `const slug = expectedVersion === null ? null : submittedSlug` —— 新建恒为 `null`（生成），编辑必须带回原值。若编辑态拿不到 slug 就返回「缺少文章标识，请刷新页面后重试。」，而不是悄悄当成新建。
- `upsertPost` / `upsertTimelineItem` 的入参把 `slug` / `id` 改为 `string | null`，`null` 是「请生成」的唯一信号。

`lib/admin/ids.ts` 是本次唯一新增的文件（54 行），只导出 `createPostSlug()` 与 `createTimelineId()`，内部共用 `randomHex(length)`（`randomBytes` 多取一字节再截断，不把长度写死成偶数假设）。文件头注释写明了上面四条设计理由，避免以后有人「优化」成标题转写。

### 8. 两个实现层面的坑

**① TypeScript 不认这种形式的 `never` 收窄。**

```ts
const fail = (code: string): never => redirect(withParam(returnTo, 'error', code))

const savedId = result.id            // string | null
if (!savedId) fail('generate_failed')
// 下面 4 行全部报 TS2322 / TS2345：savedId 仍是 string | null
```

箭头函数自身的返回类型标注**不足以**让编译器把它当作 control-flow 断言。它只认带显式变量类型标注的断言函数（`const fail: (code: string) => never = ...`）。修法是让它走控制流返回值：

```ts
if (savedId === null) return fail('generate_failed')
```

没有改成给 `fail` 加显式类型标注，因为那会同时影响文件里的两处 `fail` 定义与全部调用点风格；`return fail(...)` 更直白，也让「这里确实会提前结束函数」在阅读时一眼可见。

**② `const` 声明写在函数之后是合法的。**

`ID_GENERATE_ATTEMPTS` 声明在 `upsertTimelineItem` 函数体之后。这是合法的：顶层 `const` 的暂时性死区只影响**声明之前执行的代码**，而函数体在调用时才求值。第一次读代码时容易误以为这是 bug —— 它不是，但值得在这里留一句，免得下次被「善意」地挪走。

### 9. 一次「路由退化」的误报

本轮构建后，终端里 `next build` 的输出把 `/timeline` 与 `/timeline/[id]` 显示成：

```
├ ƒ /timeline        6.45 kB   119 kB
├ ƒ /timeline/[id]     128 B   121 kB
```

`ƒ` 是 Dynamic。公开内容页从 `○ Static` 变成 Dynamic 属于必须查明的问题 —— 但本轮改动只碰了后台文件。

两条证据排除了它：

- **源码侧**：`app/(site)/timeline/page.tsx` 没有 `export const dynamic`、不读 `searchParams`；`app/(site)/timeline/[id]/page.tsx` 有 `generateStaticParams`。按 Next 的判定规则，两者都不该是 Dynamic。
- **原始字节对照**：用隔离副本构建 HEAD 做对照，然后直接读两份日志的字节：

```
39 92 3f 00 3c 92 3f 00   →   ├  ○     （U+251C, U+25CB = Static）
```

含本轮改动的构建与 HEAD 副本构建，timeline 两行的**状态字节完全相同**，都是 `├ ○`。

结论：`ƒ` 是 **UTF-16LE → UTF-8 转码后图形字符在终端跨行叠印产生的显示伪影**，日志文件里从来不存在这个字符。**没有路由类型退化，不需要任何代码改动。**

方法论：**日志里的可疑字符必须读原始字节确认，不能采信终端渲染结果。** `node … > log` 在 PowerShell 下产出 UTF-16LE 带 BOM；`Get-Content -Encoding utf8` 读会乱码；转码成 UTF-8 之后的图形字符仍可能在终端叠印成别的字形。这与早前「`getBoundingClientRect()` 对旋转元素返回外接包围盒」同源 —— **先确认你量的是不是你以为的那个量。**

### 10. 验证

`npm run typecheck = 0`；`npm run build = 0`（13/13 静态页）；`npm run db:migrate:dry = 0`（只列 `20261023000001_admin_password_login.sql`）；HEAD 隔离副本构建 `HEAD_BUILD = 0`，同样 13/13。

真实浏览器验收（生产构建跑在 3100，无头 Edge + CDP，会话用探针专用环境变量注入）：

| 断言 | 实测 |
| --- | --- |
| 新建文章页**可见** slug 输入框数量 | **0** |
| 新建文章页页面含「自动生成」提示 | `true` |
| 保存草稿后落到的路径 | `/admin/posts/post-83f57d70e773/edit` |
| 生成的 slug | `post-83f57d70e773`（符合 `post-<12hex>`） |
| 二次保存后路径 | `/admin/posts/post-83f57d70e773/edit` |
| 二次保存后 slug 是否改变 | **未变** |
| 新建时间轴节点**可见** ID 输入框数量 | **0** |
| 旧文章 URL `/posts/playful-recorder` | 正常 |
| 旧文章 URL `/posts/pan` | 正常 |
| 生成后 `/timeline/<id>` 可访问 | 可访问（落库 id `tl-a3ac727196ad`，格式正确） |
| 两个公开内容页的路由类型 | `/timeline` = `○ Static`、`/timeline/[id]` = `● SSG`（未退化） |

时间轴节点 ID 不是在浏览器里读出来的：`/admin/timeline` 需要会话且内容需客户端渲染，探针用无 cookie 的 `Invoke-WebRequest` 复核时得到 307、`<code>` 扫描必然落空。改为用只读 SQL 直接核对落库结果确认创建成功 —— **这是探针取数方式的问题，不是产品缺陷。**

验收产生的两行数据（`posts.slug = post-83f57d70e773`、`timeline_items.id = tl-a3ac727196ad`）已按精确条件 `delete` 清除，库回到 `posts = 2`（`pan`、`playful-recorder`）、`timeline_items = 0`。

### 11. 未验证范围

- 真实触屏、屏幕阅读器、Firefox / Safari 未测（仅 Chromium 无头 + CDP）。
- 「12 位是否够短 / 够长」是算术估算，**没有做压力验证** —— 没有真的灌入百万行去测碰撞率。随机空间的计算是对的，工程上的量级判断是推断。
- 时间轴**新建**走 `on conflict (id) do nothing`（撞了换一个），**编辑**仍走 `on conflict (id) do update`（乐观锁 + `coalesce` 保留首次发布时刻）。两条路径**没有做并发压测**，原子性由 PostgreSQL 的 `on conflict` 语义保证，不是由测试证明的。
- 存量数据的 slug 没有被重新生成。`content/posts/playful-recorder.mdx` 的 frontmatter 里仍是 `slug: 'playful-recorder'`，`npm run db:import` 按 slug upsert，走的还是旧值。**生成规则只作用于后台新建路径，不作用于 MDX 导入路径** —— 这是刻意的（导入是「我有一份文件，它叫什么就是什么」），但意味着将来若想让文件导入也用随机 slug，需要另外设计。
- `lib/content/schema.ts` 的 `postFrontmatterSchema` 仍要求 `slug` 必填，未随之放宽。同上，文件导入路径未变。
- `RANDOM_HEX_LENGTH = 12` 与 `timeline/actions.ts` 里的 `GENERATED_ID_PATTERN = /^(?:tl|post)-[0-9a-f]{12}$/` 是**耦合的两个常量**，改一处必须同步另一处。没有为它们建立共享常量，因为分属「生成」与「校验」两个方向，合并成一个常量的收益小于它引入的间接层。
- `posts_slug_check` 的格式约束没有随本次改动调整（仍是 `^[a-z0-9]+(?:-[a-z0-9]+)*$`）。生成值恰好符合它，所以不需要迁移；但这意味着**约束仍是唯一真正拦在数据库层的东西**，将来若改生成格式（比如加下划线）会在这里被拒。

## D-32 正文编辑器改为 CodeMirror 源码编辑 + 实时检查 + LaTeX/Mermaid 渲染

### 1. 需求

原文：`再改进一下文章的正文编辑器，有没有行业内广泛使用的开源的富文本编辑器，包括对markdown实时检查，以及latex公式、mermaid实时渲染`

拆成四件事：① 换掉裸 `<textarea>`；② 用业界通用的开源方案；③ 对 Markdown 做实时检查；④ LaTeX 与 Mermaid 要渲染，且是「实时」的。

### 2. 直接结论：不是富文本编辑器，是源码编辑器

**「富文本编辑器」与「Markdown 为唯一真相」在本项目里不能同时成立。**

正文的权威格式是 Markdown 源码，服务端把它编译成 HTML。TipTap、Lexical、ProseMirror 这一层「文档模型 + 双向序列化」的编辑器，Markdown 只是它们的**导入导出格式**：加载时解析成文档树，保存时序列化回 Markdown。这个往返不是无损的 —— 公式的定界符风格、图表的围栏信息、表格对齐方式、代码块的语言标记、列表的松紧，都会在往返中被规范化成编辑器自己的偏好。对一个以源码为唯一真相的系统，那等于把可靠的数据格式换成了不可靠的中间表示。

所以选的是 **CodeMirror 6**：它编辑的就是源码本身，光标、撤销、输入法、粘贴、查找全部走浏览器原生行为。这是 Markdown 源码编辑这一层里最通用的开源实现（Obsidian、Joplin、Replit 都是它），也是「业界广泛使用」这条要求最直接的回答。

**「所见即所得」的诉求由预览面板承担**，而且预览是只读的 —— 它不会被误编辑改坏，也不参与存储。

### 3. 一个必须先解决的冲突：MDX 与 LaTeX 不兼容

改之前正文是 MDX（`next-mdx-remote` 的 `compileMDX`）。**MDX 把 `{` 当作 JS 表达式的起始符**，而 LaTeX 的 `\frac{a}{b}` 里到处是 `{a}` 这样的花括号。在 MDX 下，正文里的公式会被当成表达式求值，直接渲染失败。这个冲突没有折中方案：公式与 MDX 的表达式语法共用同一组定界符。

同时发现：原来的 `renderMdx` **从来没有传入过 `components` 白名单**。也就是说 MDX 的 JSX 能力在本项目里一直是「装了但没接线」，只剩「构建期可以执行任意 JS」这一个副作用。放弃它的成本为零。

于是正文渲染从 MDX 换成 **GFM Markdown + 白名单 rehype 插件**，`lib/content/mdx.ts` 删除，新增 `lib/content/markdown.ts`。`next-mdx-remote` 随之卸载（`removed 59 packages`，审计告警从 12 条降到 11 条）。

**内容没有丢**：现有 MDX 里没有任何 JSX 标签、`import` 或 `export`（实测 `<[A-Z]` 0 条、`^\s*import\s` 0 条、`^\s*export\s` 0 条；唯一的 `{` 在 CSS 代码围栏内部）。换成 Markdown 之后行为不变，而内嵌 HTML 仍然可用（`rehype-raw`）。

### 4. 依赖选择与一次真实的版本冲突

最终新增 13 条直接依赖：

| 用途 | 包 |
| --- | --- |
| 编辑器 | `codemirror@6.0.2`、`@codemirror/state`、`@codemirror/view`、`@codemirror/lang-markdown`、`@codemirror/lint` |
| 管线 | `unified`、`remark-parse`、`remark-gfm`、`remark-math`、`remark-rehype`、`rehype-raw`、`rehype-stringify` |
| 公式 | `rehype-katex`、`katex@^0.16.0` |
| 图表 | `mermaid@^11` |

**踩到的坑值得记下来。** 第一次装 `mermaid@12.2.0`，`npm install` 打了 5 段 `EBADENGINE` 警告 —— 它要求 `node >=22.12.0`，而本项目跑在 **Node 20.16.0**（`package.json` 声明 `>=20.9.0`）。降到 `mermaid@^11`（实装 11.17.2，无 `engines` 字段）之后，警告降到 1 段：`katex@0.19.1` 依赖 `commander@15.0.0`，同样要求 `>=22.12.0`。把 `katex` 降到 `^0.16.0` 之后警告才完全消失。

`rehype-katex@7.0.1` 对 katex 的约束在 **`dependencies`**（`"katex": "^0.16.0"`）里，不是 `peerDependencies` —— 这一条查了它的 `package.json` 才确认。

**验证方式不是「警告没了就算过」**：写了一个脚本递归扫描 `node_modules` 下全部 `package.json` 的 `engines.node`，机械判定有没有要求高于 20.16.0 的：

```
SCANNED=610   SKIPPED=1   BADCOUNT=0     （装 rehype-raw、卸 next-mdx-remote 之后）
SCANNED=554   SKIPPED=1   BADCOUNT=0     （最终状态）
```

`SKIPPED=1` 跳过的是 `node_modules/next/dist/compiled/`（Next 自己的内嵌依赖，145 个子目录）。另用一段独立的 PowerShell 正则重扫交叉核验，`ALL_PKGJSON=610` 与 `BADCOUNT=0` 与脚本一致。

**嵌套副本的不一致要留意**：顶层 `katex` 是 0.16.0，而 `rehype-katex`/`mermaid`/`micromark-extension-math` 各自嵌套了一份 0.16.47（它们的范围是 `^0.16.47`）。渲染用嵌套那份，客户端 CSS 用顶层那份。0.16.0 与 0.16.47 的 class 名一致（`.katex`、`.katex-display`、`.katex-html`），CSS 兼容；若将来出现新字符渲染异常，把顶层 `katex` 提到 `^0.16.47` 即可（同样无 `engines` 字段）。

### 5. 渲染管线：公开页与预览必须是同一个 processor

`lib/content/markdown.ts` 导出唯一的 `renderMarkdownToHtml(source)`，公开文章页与后台预览**都调它**。

**为什么这件事不能省**：如果预览在客户端另写一套渲染，两边迟早会不一致，而「预览里好好的、发布后坏了」是最难查的一类问题。共用 processor 之后，「预览看到的就是发布后的样子」是结构保证，不是设计意图。

插件顺序有硬约束：

1. `rehypeRaw` 靠前 —— 否则正文里的原生 HTML 会被丢掉。
2. `rehypeStripDangerous` 紧跟其后 —— 这是唯一能拦住 `<script>` 的位置（`rehype-raw` 刚把 HTML 解析成真实节点）。
3. `rehypeMermaidFence` 必须在 `rehypePrettyCode` **之前** —— Shiki 不认识 `mermaid` 这个语言，会把它降级成无高亮的 `<pre><code>`，把客户端渲染要用的节点结构一起改掉。
4. `rehypeKatex` 必须在 `remarkRehype` 之后 —— 它处理的是已经变成 `span.math-inline` / `div.math-display` 的 hast 节点。

两个自写的 transformer：

**`rehypeMermaidFence`** 把 ```mermaid 围栏换成 `<pre class="mermaid">源码</pre>`，只保留源码文本，**不预渲染成 SVG**。原因是 mermaid 需要真实的 DOM 与布局度量才能算节点尺寸；在 Node 里只能靠 jsdom，而且几 MB 的解析器会让每次构建都变慢。

**`rehypeStripDangerous`** 是这次引入 `rehype-raw` 的配套代价。`rehype-raw` 会把 `<script>`、`<iframe>`、`onclick=` 原样保留到最终 HTML 里。本站的写作者就是站长本人，风险不高，但这属于「一旦发生就没有挽回余地」的一类问题，而拦住它只需要一份黑名单：拦 `script / iframe / object / embed / base / link / meta / style / form / input / button` 这些能执行与外联的标签，剥掉所有 `on*` 属性，并把 `href` / `src` 限制在 `http(s) / mailto / tel / # / 相对路径` 之内。排版类 HTML（`<div align>`、`<kbd>`、`<sup>`）不受影响。

### 6. 实时检查：报「几乎确定是写错了」的问题

`lib/content/markdown-lint.ts` 是纯函数，不依赖浏览器解析器，所以规则与线上编译时的行为能对得上。六类：

| 检查 | 严重级 | 为什么值得报 |
| --- | --- | --- |
| 围栏代码块未闭合 | error | 后面的全部内容会被吞进代码块 |
| `$$` 块级公式未配对 | error | 公式起止边界不明，渲染结果不可预期 |
| 链接地址缺右括号 `](` | error | 链接会整段退化成纯文本 |
| 图片缺替代文字 `![](…)` | warning | 无障碍要求，与封面 alt 同一条规则 |
| 空 mermaid 图表块 | warning | 一定是个没写完的占位 |
| h4–h6 标题 / 标题跳级 | warning | 目录只收 h2/h3；跳级是结构错误 |

**刻意不做的事**：不猜行内公式的配对（`$a` 后面隔三个段落才出现 `b$`，任何启发式都会误报），也不做完整的 Markdown 语法校验。草稿允许是半成品，把「还没写完」报成错误会让诊断栏变成噪音 —— 而噪音会让人直接关掉它，那比没有诊断更糟。行内公式写错会在预览里直接显示成 KaTeX 的错误原文，看得见，不必再猜一遍。

诊断走 CodeMirror 自己的 lint 通道：有问题的行直接被标上波浪线，不是另开一张清单。mermaid 的语法检查用 mermaid 自己的 `parse()`，只有正文里真的存在 mermaid 围栏时才会去加载那几 MB 的解析器。

### 7. 界面与提交契约

编辑器仍是三面板单栏结构，全部用 `ToyButton`（`variant`/`pressed`）：

- **编辑**：CodeMirror（行号、括号匹配、撤销、搜索）+ 四个插入按钮（行内公式 / 公式块 / 图表 / 代码块）+ 行内诊断波浪线。
- **预览**：停手 450ms 后调 `previewBody` Server Action，用同一个 processor 渲染；mermaid 在客户端画，并监听 `<html data-theme>` 重画（否则深色背景上会留着一张浅色主题的图）。
- **检查**：一份可点击的清单，点一条就跳回对应行。

**提交契约没有破**：CodeMirror 是 `contenteditable`，不是表单控件，它不会自己进入 `FormData`。所以保留一个 `<input type="hidden" name="body" value={body}>` —— `body` 仍然是受控 state（D-13 的「失败不丢稿」要求），隐藏字段只负责把它变成可提交的值。

**预览为什么是 Server Action 而不是一条路由**：路由要额外处理 token、noindex 与鉴权三件事；一个 Action 天然继承当前会话，也不需要把未发布的正文暴露在任何可被索引的 URL 上（包括「`noindex` 但可抓取」这种半暴露）。Action 里同样独立调 `requireAdmin()`，不依赖 layout 守卫。

### 8. 公开页的成本控制

文章页仍然是**服务端渲染好 HTML 随 RSC 下发**，客户端只多一个 `MermaidRoot`：等 DOM 就位后把 `pre.mermaid` 画成图。首屏与 SEO 都不受影响，路由类型也没有退化。

KaTeX 的 CSS 从 `app/layout.tsx` 引入（`import 'katex/dist/katex.min.css'`）。它只定义公式的字体与盒子，**不选任何颜色**，与 5 色派生体系不冲突；字体文件由 CSS 里的 `@font-face` 引用，浏览器只在页面上真的出现公式时才去下载对应字形。

### 9. 验证

`npm run typecheck = 0`；隔离副本生产构建 `BUILD=0`（13/13 静态页，`/posts/[slug]` 仍为 `● SSG`、`/timeline/[id]` 仍为 `● SSG`、`/timeline` 仍为 `○ Static`，**无路由类型退化**）。

真实浏览器验收（无头 Edge + CDP，生产实例跑在 3100，探针环境变量注入）：

| 断言 | 实测 |
| --- | --- |
| 新建文章页 `.cm-editor` 数量 | **1** |
| `contenteditable` 的编辑器容器 | **1** |
| 名为 `body` 的**可见**输入框 | **0**（`total=1, types=["hidden"]`） |
| 名为 `slug` 的可见输入框 | **0** |
| 三个面板按钮 + 四个插入按钮 | 全部存在 |
| KaTeX 的 CSS 已进入文档 | **true** |
| 输入未闭合围栏后的检查面板 | **1 条错误：第 20 行 这个代码块没有闭合** |
| 行内诊断标记（`.cm-lintRange-*`） | **1** |
| 预览：`.katex` 节点 | **2**（1 个行内 + 1 个 `.katex-display` 块级） |
| 预览：mermaid `pre` → `svg` | **1 → 1**，`data-mermaid-error` **0** |
| 预览：Shiki 代码高亮 | **2** 个 figure |
| `/posts/playful-recorder` | h2 **2**、h3 **1**、table **1**、`pre code` **1**，标题正确 |
| `/posts/pan` | 正文渲染正常 |
| 首页 | 正常（触感面板、配色实验室、快捷入口均在） |

截图三张（编辑器预览 / 公开文章页 / 首页）已由我本人逐张目视核对：行内公式 `E = mc²` 与块级 `\frac{a}{b} = c` 均正确排版，Mermaid 流程图（开始 → 结束）渲染为带箭头连线的 SVG，未闭合围栏那段被整段吃进代码块 —— 与诊断报告完全一致。

**体积变化要说明**：`/admin/posts/new` 与 `/admin/posts/[slug]/edit` 的 First Load JS 从 108 kB 涨到 **334 kB**（CodeMirror + Mermaid 进入后台 bundle）。这是后台页面，只有管理员会访问；公开内容页的体积与路由类型都没有变化。Mermaid 本身是动态 `import()`，只有正文里真的出现图表时才下载。

### 10. 未验证范围

- 真实触屏、屏幕阅读器、Firefox / Safari 未测（仅 Chromium 无头 + CDP）。
- **中文输入法未实测**。CodeMirror 走的是浏览器原生编辑行为，理论上比自制富文本更稳，但没有在真实 IME 下打过一段中文。
- 移动端（390px）未实测。编辑器给了 `max-height: 58vh` 与横向滚动，但没有在真机上看过。
- **大文档未压测**。诊断是全文扫描 + 600ms 防抖，几万字级别没有测过耗时；预览有 20 万字符的硬上限。
- mermaid 的实际渲染依赖用户浏览器。图中字体、换行、复杂子图在极端情况下可能与预览有差异。
- **KaTeX 与 Shiki 的样式是「借来的」**：KaTeX 的字体按它自己的设计，不参与 5 色体系；Shiki 用的是 `github-light` 主题。两者都没有跟随明暗主题切换，暗色模式下公式与代码块的底色仍是浅色（`keepBackground: false` 让代码块底色取 `--soft`，公式则是透明底）。这是刻意的取舍：让 KaTeX 跟随主题需要重写它的 CSS 变量，收益小于风险。
- 语法高亮依赖 Shiki 的语言子集，未知语言会退化成无高亮代码块。
- 存量文章没有回填任何公式或图表。`content/posts/playful-recorder.mdx` 正文未改动。
- MDX 相关的**文件扩展名与导入脚本未改**：`content/posts/*.mdx` 仍叫 `.mdx`，`scripts/db-import-content.mjs` 仍接受 `.md`/`.mdx`。它们现在按 Markdown 解析，行为与之前一致，但文件名里的「mdx」已经是历史遗留。

### 11. 一个值得记住的取舍

**「富文本」是一类需求的名字，不是它的解法。** 用户要的是「写起来更顺手、看得见效果、公式图表能渲染」，这三件事分别对应编辑器、预览、渲染管线三个东西，没有一件要求把存储格式从源码换成文档树。反过来，真的换上富文本编辑器，第一个坏掉的恰恰是公式与图表 —— 它们在文档树里没有原生表示，只能塞进自定义节点，而自定义节点的 Markdown 序列化必然是本项目自己维护的一份私有格式。


---

## D-33 配色对比度审计与 15 项不合格修复

### 1. 需求

用户原话：`扫描检查一下全部配色是否符合对比度要求`，随后：`开始修改`。

两步：先只读审计，不擅自改配色；拿到明确授权后再修。

### 2. 审计方法与范围

写 `.me/tmp/agent-41c1af08b3cc/contrast-audit.mjs`，用项目自带的 `typescript.transpileModule` 把 `lib/theme/palette-core.ts` 转译成 ESM **直接 import**，不另写一份对比度公式 —— 否则「审计通过」只能证明审计脚本自己算得对。

范围是 6 套预设 × 日间 / 夜间两态 × 页面里真实存在的每一条前景 / 背景配对。判据：正文 `--ink` 在 canvas / surface 上按项目自己的 AAA **7:1**；其余文字 **4.5:1**；焦点环等非文本 **3:1**。

### 3. 第一版审计报了 26 项，其中 11 项是审计自己的错

**误报一：`--ink` on `--shell`（6 条）。** 我把 `--shell` 当成了文字背景。搜全部引用后确认它只有 4 处，**全部是 `background`**（about 头像块、配色实验室与触感面板的外层），且里面永远再套一层 `--surface` 才放文字。这不是真实配对，删除。

**误报二：`--ink` on `--soft` 按 7:1 判（5 条）。** `--soft` 上的文字有两类：代码块 `font-size: 0.875rem`（非大号字，只需 4.5），引用块用的是 `--muted` 不是 `--ink`。按 4.5 重算全部通过。

**这两次剔除都来自「先确认配对在页面上真的存在、字号真的要求这么高」，而不是「先相信脚本」。** 审计脚本会犯错，且错误方向常常是过于严格；报假阳性比漏报更伤信任。

### 4. 最终真实结果：192 项中 15 项不合格

**类型 A：`--muted` on `--soft`，11 项（6 套预设的日夜两态里 11 个组合）。**

| 配色 | 修复前 | 要求 |
| --- | --- | --- |
| classic/light | 4.41 | 4.5 |
| tide/light | 4.27 | 4.5 |
| tide/night | 3.83 | 4.5 |
| harbor/light | 4.12 | 4.5 |
| harbor/night | 3.77 | 4.5 |
| sunrise/light | 4.32 | 4.5 |
| sunrise/night | 3.80 | 4.5 |
| meadow/light | 4.18 | 4.5 |
| meadow/night | 3.74 | 4.5 |
| ember/light | 3.81 | 4.5 |
| ember/night | 3.87 | 4.5 |

真实渲染位置：`.tag-chip`（`app/globals.css` 里 `color: var(--muted)` + `background: var(--soft)`，字号 **11px**，每张文章卡都有）；以及十余处空状态提示（首页、文章列表、统计、活动、评论、后台多页）。

**根因不是配色选得不好，是约束漏了一层。** `--muted` 生成时只对 `[canvas, surface]` 求解，而 `--soft` 是比两者都深（日间）/ 都亮（夜间）的第三种底色 —— 它从来不在求解范围里。

**类型 B：夜间 `--sky` on `--surface`，4 项。** tide 3.60、sunrise 3.57、meadow 3.58、ember 3.71（要求 4.5）。

真实渲染位置只有一处：`.prose-playbook a` 的夜间分支 `color: var(--sky)`，正文链接 16px。同一项在 canvas 上 12/12 全部通过，只在更亮的 surface 上失败。

**根因是语义越界。** `--sky` 是按钮面（cap），只保证与 `--on-accent` 的对比，被拿去当正文链接色属于超范围使用。harbor/night 10.9、classic/night 8.9 通过只是因为那两个预设的 `--sky` 碰巧够亮，不是设计保证。

### 5. 修复

**类型 A：把 `soft` 加进 `muted` 的对比参照数组。** 日间与夜间各一处 `ensureContrastEither(..., [canvas, surface, soft], AA_TEXT, ...)`。同时把 `soft` 提成局部常量，免得在 return 里再算一次与求解用的不是同一个值。

**类型 B：新增 `--link` token，正文链接不再复用按钮色。** 日间从原来的 `shade(p3, 0.45)` 起、夜间从 `tint(p3, 0.25)` 起，都对 `[canvas, surface, soft]` 求解到 AA。CSS 里 `.prose-playbook a` 改成 `color: var(--link)`，**主题分支整个删掉** —— 日夜两套各有一份 `--link`，不再需要 `:root[data-theme='night']` 那条覆盖。

### 6. 一次差点引入的回归：`--ink` 不能加 soft

第一版修复里我把 `soft` 也加进了 `--ink` 的 7:1 参照数组，理由是「同一个道理」。跑完整 token 对比才发现：**tide/night 与 sunrise/night 的 `--ink` 被一路提亮到纯白**（`#fefcf8` → `#ffffff`、`#fdf6e9` → `#ffffff`），连带 `--line` / `--grid` 的 rgba 也跟着变。

原因很简单：`--soft` 上的正文只出现在代码块里，**字号 0.875rem 是非大号字，7:1 对它本来就不适用**（按 4.5 早就通过）。强行要求只会白白丢掉色相。已回退，并把这条理由写进代码注释。

**这件事的方法论意义**：一行「顺手也加上」的改动，靠 typecheck 和截图都发现不了（纯白与近白在截图上几乎无差别），只有**逐 token 比对新旧派生值**才能暴露。

### 7. 验证

**审计脚本重跑：`TOTAL=192 FAILCOUNT=0`。** 最紧的一项 sunrise/night `--link` on `--soft` = 4.51（要求 4.5）。

**逐 token 等价性：`SAME=265 CHANGED=11 ADDED=12`。** `CHANGED_KEYS=--muted` 恰好 11 个（就是那 11 项失败），`ADDED_KEYS=--link` 12 个（6 套 × 日夜）。`--ink`、`--focus`、`--coral/pink/cream/mint/sky/lilac`、`--on-accent`、`--line`、`--grid` 全部逐字节不变 —— **按钮的 12 项、正文的 12 项、焦点环的 12 项都不可能回归。**

`npm run typecheck` 退出码 0。

### 8. 未覆盖

- `.tag-chip` 选中态的 `--ink` on `color-mix(in srgb, var(--pink) 34%, var(--surface))` 仍未算 —— 需要实现 color-mix 的求解，不是拒绝改，是这次没做。
- 半透明 `--line` / `--grid` 叠色后的边框对比度未算（非文字，WCAG 无硬性要求）。
- `--base` 与 cap 的落差未按 3:1 算 —— 它是结构不是文字。
- 本轮是 token 级计算，未采集浏览器实际 computed style。
- 390px 移动端本轮仍未验证。

### 9. 一条值得记住的结论

**「全部通过」和「构造上保证通过」是两回事。** 审计前的 177 项通过里，有相当一部分是「这几套预设碰巧够」，而不是「派生层保证它够」—— `--sky` 链接色就是典型：12 套里 8 套通过，但那 8 套只是运气。修完之后，链接色改成了对三层底色统一求解，通过才变成构造出来的保证。
所以这里的选择不是「CodeMirror 比 TipTap 好」，而是：**当源码本身就是产品的数据格式时，编辑器应当编辑源码，而不是编辑它的某个投影。**

---

## D-34 后台与代码高亮的对比度修复

### 1. 需求

用户原话：

> 后台编辑文章、时间轴、评论等还有配色对比度问题，出错通常出现在文本和背景色，导致文本可读性差，尤其是markdown代码高亮的配色

D-33 已经在 token 级做到 `FAILCOUNT=0`，但用户报告的仍然存在。**这不是重复劳动，也不是错觉 —— 是 D-33 的审计口径有盲区。**

D-33 量的是「派生层算出来的 token 两两配对」。它从来没有量过：

1. **亮色 cap 上写 `--ink` 或干脆不写 `color`（继承）** —— `--ink` 的 7:1 保证只对 canvas / surface 成立，夜里它是浅色；
2. **组件里写死的十六进制色值** —— 三套 `#4a2d11` / `#2a2118` / `#211522`；
3. **构建期被内联进 HTML 的颜色** —— Shiki 与 CodeMirror 的主题色在构建时就是固定 hex，`data-theme` 切换对它们**完全无效**。

第三类是本轮的主要工作量，也是用户单独强调的那一项。

### 2. 扫描方法与原始数字

**后台**：无头 Edge（CDP）真实登录 `/admin/login`（探针凭据），遍历 8 个页面 × 日间/夜间两态，**逐个可见文本节点**读 `getComputedStyle().color`，再向上回溯到第一个不透明背景（沿途合成半透明层），按 WCAG 判定（大号字 3:1，其余 4.5:1）。

修复前：`TOTAL_NODES=1244 FAIL_NODES=54 GROUPS=5`

| 分组 | 位置 | 实测 |
|---|---|---|
| 1 | 概览 night「当前没有待办事项」`<p style="background: var(--mint)">` | `#f3fcf9` on `#82e2bf` = **1.48** |
| 2 | 活动 night「公开」徽标 ×37（`background: var(--mint); color: var(--ink)`） | **1.48** |
| 3 | 文章列表 night「精选」徽标（`background: var(--cream)`，无 `color`） | `#f3fcf9` on `#dff7ee` = **1.08** |
| 4 | 编辑文章 night CodeMirror token ×14（`#404740` on `#282129`） | **1.64** |
| 5 | 编辑文章 night CodeMirror token ×1（`#221199` on `#282129`） | **1.20** |

**Shiki**：先用 Node 侧脚本把 `github-light` 的 19 个 token 色 × 6 套预设 × 日夜 × `--soft` 全算一遍：`TOTAL=228 FAILCOUNT=150`，其中夜间 19/19 全挂，最差 `#032f62` = **1.01**。再用真实浏览器复核 `/posts/playful-recorder`（15 个 span）：日间挂 2 个（`#e36209` = 3.24），夜间挂 11 个（最差 `#24292e` = **1.14**）。

### 3. 根因：三类「构建期硬编码」

| 来源 | 位置 | 硬编码 | 后果 |
|---|---|---|---|
| Shiki 内置主题 | `lib/content/markdown.ts` 原 `theme: 'github-light'` | 19 个固定 hex | 夜间 19/19 挂，最差 1.01:1 |
| CodeMirror 默认高亮 | `@codemirror/language` 的 `defaultHighlightStyle` | `#404740` / `#708` / `#219` / `#a11` / `#e40` / `#00f` / `#30a` / `#085` / `#167` / `#256` / `#00c` / `#940` / `#f00` | 夜间 1.64 / 1.20 |
| 组件写死亮 cap 文字色 | 9 个文件 13 处 | `#4a2d11` / `#2a2118` / `#211522`，以及「无显式 color 继承 `--ink`」 | 夜间 1.08~1.48 |

**这三类同源：颜色在构建期被固化，`data-theme` 切换对它们无效。** 所以这不是「配色没调好」，而是「主题根本没有日夜两态」。修法必须是把颜色从构建期搬到运行期，而不是换一个主题色。

### 4. 突破口：Shiki 不校验颜色格式

先用探针确认 Shiki 会把非标准颜色值原样输出：

```html
<span style="color:var(--code-keyword)">const</span>
```

再验证完整自定义主题（含 `colors['editor.foreground']`）：`HARDCODED_COLORS_IN_OUTPUT=[]`、`HAS_BBBBBB=false` —— 输出里零个硬编码颜色，也没有未覆盖 token 回退到默认灰。

**结论：一份主题对象吃两套 CSS 变量**（`:root` 与 `:root[data-theme='night']`），切主题时代码块自动跟着变。不需要第二份主题、不需要客户端重渲染、不增加首屏成本。

### 5. 8 个 `--code-*` 的设计

新增 `deriveCodeTokens(p1, p2, p3, ink, muted, soft, theme)`，每色都对 `--soft`（代码块的实际底色、三层浅底里最差的那层）求解 AA：

| token | 语义 | 日间种子 | 夜间种子 |
|---|---|---|---|
| `--code-plain` | 标点、普通标识符 | `ink`（复用，不重解） | `ink` |
| `--code-comment` | 注释 | `muted` | `muted` |
| `--code-keyword` | 关键字、storage | `shade(p1, 0.28)` | `p1` |
| `--code-string` | 字符串 | `shade(p2, 0.32)` | `shade(p2, 0.05)` |
| `--code-number` | 数字、常量 | `shade(p3, 0.3)` | `p3` |
| `--code-entity` | 实体、函数名 | `shade(mix(p1,p3,0.5), 0.3)` | 同 mix |
| `--code-type` | 类型、类名 | `shade(mix(p2,p3,0.4), 0.34)` | `shade(..., 0.06)` |
| `--code-name` | 变量名、属性名 | `shade(p1, 0.1)` | `p1` |

**为什么只有 8 个**：语法高亮的色相数量超过 8 个，就不可能全部同时满足 4.5:1 —— 调色板一亮，相邻色的区分度只能靠人眼而不是对比度。8 个覆盖关键字 / 字符串 / 数字 / 注释 / 类型 / 名称 / 实体 / 标点八类语义，其余区分手段（字重、斜体）在主题里一并给。

### 6. CodeMirror 与 Shiki 共用同一批变量

编辑器里的 Markdown 源码与发布后的代码块是**同一段文字的两种呈现**，它们应该看起来像同一套配色。共用之后，配色只在 `deriveCodeTokens()` 一处定义，改一处两边同步。

`syntaxHighlighting()` 同时接受多个 `HighlightStyle`，**后注册的优先级更高**。`basicSetup` 里已经注册了 `defaultHighlightStyle`，因此扩展数组里追加的 `syntaxTheme` 会覆盖它。

`@codemirror/language` 不重新导出 `tags`（其 `.d.ts` 的 `export {…}` 列表里没有），必须从 `@lezer/highlight` 导入。后者此前只是传递依赖，本轮提为显式依赖 `^1.2.5`（实装 1.2.5，无 `engines` 字段，无 EBADENGINE，审计告警仍 11 条）。

### 7. 亮色 cap 上的正确文字色是 `--on-accent`，不是 `--ink`

`--mint` / `--cream` / `--coral` / `--sky` / `--pink` 都是 **cap（按钮面）**，它们的可读性保证是「`--on-accent` 压在上面 ≥4.5:1」，由 `capOn()` 在派生时逐个验证（5 个 cap × 日/夜 × 6 套 = 60 项，本轮全部实测通过，最差 4.53）。

而 `--ink` 的保证是「压在 canvas / surface 上 ≥7:1」。**夜间 `--ink` 是浅色**，压在亮 cap 上就是浅字压浅底。

所以「亮色块当底」的每一处都必须显式写 `color: var(--on-accent)`。**继承是不安全的**，因为父级通常继承到 `body` 的 `--ink`。

本轮改掉的 13 处（9 个文件）：三套硬编码 hex 全部替换，两处 `color: var(--ink)` 改为 `--on-accent`，两处完全没有 `color` 的补上。

### 8. 一次真实的自我制造回归

改 `palette-core.ts` 时，`File.Edit` 的行范围把日间派生函数里的 `--lilac` / `--lilac-base` 两行**误删了**（夜间那两行还在）。

**`npm run typecheck` 完全没有报错** —— 因为 token 是 `Record<string, string>`，少两个 key 类型上合法。只有 `next build` 在预渲染 `/` 时崩溃才暴露：`Cannot read properties of undefined (reading 'trim')`。

两处修正：

1. 补回那两行；
2. **新增逐 token 新旧比对作为回归守卫**（`diff-tokens-d34.mjs`）：用 `git show HEAD:lib/theme/palette-core.ts` 与工作区版本各自派生 6 套 × 日夜的全部 token，逐一比对。结果 `SAME=288 CHANGED=0 ADDED=96 REMOVED=0` —— 证明现在是纯增量。

**这条教训值得单独记：`typecheck` 通过不代表改动没有破坏数据。** 对于「动态 key 的配置对象」，唯一能在编译前抓到缺失的手段是逐项比对新旧产出。

### 9. 验证

| 层 | 方法 | 结果 |
|---|---|---|
| 后台 8 页 × 日夜 | 真实登录，逐文本节点 computed style | `TOTAL_NODES=1242 FAIL_NODES=0 GROUPS=0` |
| 公开页 Shiki | 真实浏览器，16 个 token span | 日间 `TOKENS=16 FAIL=0`、夜间 `TOKENS=16 FAIL=0` |
| 编辑器 CodeMirror | 真实浏览器，`.cm-content span` | `EDITOR_TOTAL=36 EDITOR_FAIL=0` |
| `--code-*` 派生层 | Node 侧 6 套 × 日夜 × 8 色 + 5 cap | `TOTAL=156 FAILCOUNT=0` |
| 擦边值精查 | 六位小数复核 | `BELOW_4.5=0`，`MIN=4.502534` |
| 逐 token 回归 | 新旧派生值比对 | `SAME=288 CHANGED=0 ADDED=96 REMOVED=0` |
| 构建 | 隔离副本 `next build` | `BUILD=0`，13/13 静态页，路由类型与上一版逐字一致 |

**Shiki 侧最关键的证据**：修复后每个 span 的 `style=color:var(--code-entity)` 等**原样保留了变量**，而不是 hex。同一份 HTML、不同 CSS 变量，日间最紧 4.59、夜间最紧 4.56 —— 这才是「主题真的日夜两态」的实证。

**CodeMirror 侧最关键的证据**：修前的 `#404740`（1.64）与 `#221199`（1.20）已完全消失；`--code-plain` 日间 `#1c121d`（18.13）→ 夜间 `#f3fcf9`（15.00），`--code-comment` 日间 `#737074`（4.86）→ 夜间 `#9b9d9e`（5.75）。

### 10. 未覆盖

- `.tag-chip` 选中态（`--ink` on `color-mix(in srgb, var(--pink) 34%, var(--surface))`）仍未算 —— 与 D-33 相同的遗留项。
- 半透明 `--line` / `--grid` 叠色后的边框对比度未算（非文字，WCAG 无硬性要求）。
- 390px 移动端本轮仍未验证。
- 未测 Firefox / Safari、真实触屏、屏幕阅读器。
- 只验证了 `classic` 这一套预设的真实浏览器渲染（`--code-*` 的 6 套 × 日夜由 Node 侧派生层覆盖，未逐套起浏览器）。

### 11. 一条值得记住的结论

**颜色一旦在构建期被内联，运行期的主题切换就彻底失效。** 这一类缺陷不会出现在 token 审计里，因为审计量的是 token 值，不是渲染后的 DOM。判断「配色对不对」必须回到真实渲染的文字节点 —— D-33 的 `FAILCOUNT=0` 与用户的「还是看不清」并不矛盾，它们量的是两个不同的东西。


---

## D-35 原生表单控件的主题化

### 1. 需求

用户原话：

> 有些UI配色还是不对，例如文章的评论编辑区域，在暗色调下，文本框还是白色的

### 2. 根因：这一类控件从未被主题化

**D-33 与 D-34 都量不到这个问题，因为它们数的是「文本节点」。** 空输入框里没有文本节点 —— `<textarea>` 的 `value` 是表单状态，不是 DOM 文本。所以「暗色下文本框还是白色」在两次审计里都是**结构性盲区**，不是量错了。

真正的成因是两条叠加，且都不是配色问题：

1. **Tailwind preflight 不给 `input[type=text|email|date]` / `textarea` / `select` 设背景。** 它只给 `button` 与 `input:where([type='button'|'reset'|'submit'])` 设了 `background-color: transparent`。其余控件落到浏览器 UA 的 `Field` 系统色 —— 那个颜色**恒为白色，与 `data-theme` 完全无关**。
2. **preflight 把这些控件的 `color` 设为 `inherit`。** 夜间 `--ink` 是浅色（`#f3fcf9`），于是变成**浅字压白底**。

第 3 条是渲染层的：`color-scheme` 从未声明过。它不控制 CSS 背景，但**控制 UA 自绘的那部分像素** —— `select` 的展开箭头与选项列表、`date` 的日历图标、`checkbox` 的勾选块、滚动条、控件内部的焦点环。不声明，这些像素在夜间会保持「白底深字」的系统默认。

### 3. 影响范围

全站 21 个文字类控件，全部是同一状态：

| 位置 | 控件 | 数量 |
|---|---|---|
| `components/interactions/comment-section.tsx` | 昵称 input、邮箱 input、评论 textarea | 3 |
| `app/admin/(protected)/posts/post-editor.tsx` | 标题、摘要、日期、分类、标签、封面、封面说明 | 7 |
| `app/admin/(protected)/timeline/page.tsx` | 标题、正文、类型 select、状态 select、日期、图片地址、图片替代文本、外部链接、4 个筛选控件 | 9 |
| `app/admin/(auth)/login/login-form.tsx` | 邮箱、口令 | 2 |

这些组件里原本只有 `borderColor` 内联样式，**没有一处设 `background` 或 `color`** —— 它们在等 CSS 兜底，而 CSS 从未兜底。

### 4. 修法

只改 `app/globals.css` 的 `@layer base`，共 55 行纯增量，不动任何组件：

```css
input:not([type='button']):not([type='reset']):not([type='submit']):not([type='checkbox']):not([type='radio']):not([type='range']),
textarea,
select {
  background-color: var(--surface);
  color: var(--ink);
}

:where(input, textarea, select):disabled {
  background-color: var(--soft);
  color: var(--muted);
}

input::placeholder,
textarea::placeholder {
  color: var(--muted);
}
```

外加 `:root { color-scheme: light }` 与 `:root[data-theme='night'] { color-scheme: dark }`。

**三个刻意的选择：**

1. **用 `var(--surface)` 而不是 `--soft`。** 输入框在视觉上是「内容层」，与卡片同层；`--soft` 是「凹陷/次级」层，用在禁用态。
2. **不用 `:where()` 降优先级。** preflight 的 `color: inherit` 是元素选择器，`:where()` 的权重为 0，拼不过它。这里必须显式给足够的特异度（6 个 `:not()` 把权重抬到 (0,6,0) 级别）。
3. **排除 checkbox / radio / range。** 它们由 UA 整体绘制，设 `background` 既无效也会破坏原生外观；改用 `color-scheme` 让 UA 自己跟随，这是唯一正确的路径。

`::placeholder` 也一并修掉：preflight 把它写死成 `gray.400`（`#9ca3af`）—— 那是个**硬编码色值**，违反「组件里不得出现十六进制色值」的同一条原则；夜间在白底上勉强可见、在深底上直接消失。改 `--muted` 后与全站「次要文字」同口径（已对 canvas / surface / soft 三层求解 AA 4.5）。

### 5. 验证

新写探针 `probe-form-controls.mjs`，逐控件读 `getComputedStyle().backgroundColor` 与 `color`，覆盖 5 个页面 × 日夜两态：

```
TOTAL_CONTROLS=66   FAIL_CONTROLS=0
```

| 页面 | 控件数 | 夜间 textarea 实测 |
|---|---|---|
| `/posts/playful-recorder`（评论表单） | 3 | `#f3fcf9` on `#282129` = **15.00** |
| `/admin/posts/new` | 8 | 同上 |
| `/admin/posts/playful-recorder/edit` | 8 | 同上 |
| `/admin/timeline` | 12 | 同上 |
| `/admin/login` | 2 | `#f3fcf9` on `#282129` = **15.00** |

**最关键的证据是 `ownBg`**：夜间实测 `ownBg=rgb(40, 33, 41)`，即 `--surface` 的当期值 `#282129`。修前它会是 `rgb(255, 255, 255)`（UA Field）。这不是「碰巧好看」，是**控件自己的背景真的换成了当期 token**。

`color-scheme` 10/10 全对（5 页 × 2 态）：日间 `light`、夜间 `dark`。

**截图取证**（不止数字）：夜间评论表单与时间轴管理页已逐像素确认 —— 输入框、textarea、两个 `select` 全部为深色；`select` 的展开箭头与日期控件的日历图标也已是浅色，说明 `color-scheme` 在 UA 自绘层生效。日间截图确认没有回归（输入框仍为浅色 `#fdfffe`，与页面同层）。

**回归验证**：`scan-admin3.log` → `TOTAL_NODES=1238 FAIL_NODES=0`；`scan-shiki3.log` → 日夜各 `TOKENS=16 FAIL=0`。D-33 与 D-34 的成果零回归。`next build` → `BUILD=0`。

### 6. 未覆盖

- `input[type='date']` 的日期选择面板本身（点开后的弹层）未截图验证 —— 它由浏览器绘制，`color-scheme` 理论上覆盖，但没有像素证据。
- 未测 Firefox / Safari 的 `Field` 系统色行为差异。
- 390px 移动端本轮仍未验证。
- `:autofill` 状态未处理 —— Chrome 的自动填充会强制覆盖背景色为浅蓝（`-webkit-autofill`）。当前没有登录表单保存密码以外的自动填充场景，本轮未做。

### 7. 一条值得记住的结论

**「逐文本节点审计」有一个结构性盲区：它看不见空控件。** D-33/D-34 量了 1238 个文本节点、数十个代码 token，全部为 0 失败，而用户一眼就能看到「文本框还是白的」—— 因为那个白色从来没有被任何文本节点表示过。

判断配色是否合格，除了「渲染后的文字」，「**渲染后的控件自身**」是独立的第二类对象，必须单独列举、单独量。这一次我把「页面上有哪些 form 控件」当成一次显式的清点（42 个开标签，21 个文字类），而不是靠文本遍历顺带发现。

---

## D-36 文章阅读页正文宽度与页头页脚对齐

### 1. 需求

用户原话：

> 文章阅读页面的布局，文章显示的宽度最好和顶部底部一致

参照物是页头与页脚的内容宽度，验收对象是 `/posts/[slug]` 正文的显示宽度。用户要的是
**视觉上的左右边界对齐**，而不是「正文无限变宽」—— 但两者在本项目里发生了真实冲突，
见第 5 节。

### 2. 先实测，再动手

这一轮最重要的纪律是：**不得靠阅读 JSX 推断布局**。原因很简单 —— 读到的事实只有
「第 106 行写着 `minmax(0,720px)`」，而用户看到的偏移量取决于容器宽度、`gap`、
`justify-content` 三者的实际组合，只能量。

先读清布局链，确定「一致」的目标值：

| 文件 | 关键事实 |
|---|---|
| `app/(site)/layout.tsx` | `<main id="main-content" className="page-shell">` 内依次是 `<SiteHeader />`、`{children}`、`<SiteFooter />` —— **三者同处一个容器** |
| `components/site/site-header.tsx` | `<header className="flex items-center justify-between gap-5 pb-6 pt-7">`，无宽度类 |
| `components/site/site-footer.tsx` | 同上，无宽度类 |
| `app/globals.css` | `.page-shell { width: min(1180px, calc(100% - 40px)); margin-inline: auto }` |

因此 header / footer 天然撑满 `.page-shell`，**不一致只可能来自正文那一层**。

然后用只读 CDP 对用户正在运行的 dev server（3000 端口）实测，两个文章页 × 三档视口：

| 视口 | 容器 | 正文 | 目录 | 左缘差 | 右缘差 |
|---|---|---|---|---|---|
| 1440 | `130..1310`（1180） | `236..956`（720） | `984..1204`（220） | **106** | **354** |
| 1024 | `20..1004`（984） | `28..748`（720） | `776..996`（220） | **8** | **256** |
| 768 | `20..748`（728） | `20..748`（728） | 不显示 | 0 | 0 |

`grid-template-columns` 实测为 `720px 220px`、`justify-content` 为 `center`。

**这就是「不一致」的量化值**：只在 `lg`（≥1024）生效；720+28+220=968px 的内容被居中放进
984~1180px 的容器，左边缘多出 106px 空白，右边缘被 220px 目录列放大到 354px。
768（单列）本来是齐的 —— 说明问题确实是「两列布局 + 居中」造成的，不是容器本身。

### 3. 两次不达标的尝试（保留在记录里）

**第一次**：`minmax(0,760px) 220px` + `justify-between`。想法是「正文保持设计文档推荐的
760px 上限，靠两端对齐消除左右空白」。实测左缘差 **0**、右缘差 **420** —— 右边缘依然
差得更多，因为 760+28+220=1008 与 1180 之间仍有 172px 被 `justify-between` 分给了中间的
gap。**用户说「宽度一致」，这只做到了「一条边一致」。**

**第二次**：`minmax(0,1fr) 220px`，去掉 `justify-*`。实测正文 `130..1062`（932px），
左差 0、右差 248（= 220 目录 + 28 gap）。对**有目录**的文章这已经正确 —— 阅读区整体
贴住容器两端。但截图暴露出一个我事先没想到的真实缺陷：

**`/posts/pan`（无目录）仍然空出 220px 右列**，正文 932px、右差 248px，视觉上是一条
偏左的窄带漂浮在大片空白里。原因是网格第二列无条件存在。

### 4. 最终改法

`app/(site)/posts/[slug]/page.tsx`，三处：

```tsx
// 1. 目录为空时不给右列留位
const hasToc = toc.length > 0

// 2. 网格列按 hasToc 条件生成
<div
  className={`mt-8 grid gap-7 lg:items-start ${
    hasToc ? 'lg:grid-cols-[minmax(0,1fr)_220px]' : 'lg:grid-cols-1'
  }`}
>
```

```diff
- <header className="max-w-[760px] pt-5">
+ <header className="pt-5">
```

三个决定：

1. **正文列用 `minmax(0,1fr)` 而非 `1fr`。** 正文里有 `pre` / `table` / 长 URL，
   不加 0 下限时网格轨道会被内容顶宽，导致页面级横向溢出。这是 CSS Grid 的既知行为。
2. **目录列条件生成，而不是用 `lg:grid-cols-1` 占位。** 不加 `hasToc` 判断时，
   无目录文章会白白保留 220px 的右列 —— 这正是第二次尝试留下的缺陷。
3. **标题块去掉 `max-w-[760px]`。** 正文拉满后，标题继续限宽会让标题右缘与正文右缘
   错开。去掉后 `articleHeader` 实测与 `.page-shell` 同宽（`130..1310`）。

### 5. 与设计文档的冲突，以及如何取舍

`docs/design/pages/03-post-detail.md` 第 23 行写的是：

> 正文推荐宽度 `680px - 760px`。目录、分享栏不应挤压正文到不可读宽度。

**这是一个真实的冲突**：设计文档要求正文有可读宽度上限，用户当轮要求宽度与页头页脚一致。
两者不可能同时满足于 1180px 容器内的有目录文章（1180 − 220 − 28 = 932 > 760）。

取舍：**以用户当轮指令为准**，正文列吃满剩余宽度。可读性不做虚假承诺 —— 932px 确实
超过了「约 75 字符」的经验行宽，靠 `leading-[1.85]` 大行高与 `text-base` 字号缓解，
而不是靠一个与页头错位的宽度。

无目录文章正文实测 1180px，这个宽度在 1440 视口下明显偏宽。**这一点必须如实标注为已知
取舍**（见第 7 节），若用户日后觉得太宽，可给正文列加一个 `max-w` 上限并让它居中 —— 
但那就回到了「与页头不一致」的原始问题。

### 6. 验证

| 项 | 结果 |
|---|---|
| `npm run typecheck` | `TC=0` |
| 隔离副本 `next build` | `BUILD=0`，13/13 静态页 |
| 路由类型 | `PRERENDER_ROUTES=10` / `DYNAMIC_ROUTES=2`（`/posts/[slug]`、`/timeline/[id]`）—— **与 D-35 基线完全一致** |
| 生产构建实测 1440（有目录） | 正文 `130..1062`（932），目录 `1090..1310`，左差 **0**、右差 248（目录列本身） |
| 生产构建实测 1440（无目录） | 正文 `130..1310`（1180），左差 **0**、右差 **0** |
| 生产构建实测 1024 | 左差 0、右差 248 |
| 生产构建实测 390 | 左差 0、右差 0，`grid=362px` |
| 横向溢出 | 1440 / 1024 / 390 三档 `scrollWidth == clientWidth`，`hscroll=false` |
| `scan-admin.mjs` 回归 | `TOTAL_NODES=1244 FAIL_NODES=0 GROUPS=0` |
| `scan-shiki.mjs` 回归 | 日 `TOKENS=16 FAIL=0`、夜 `TOKENS=16 FAIL=0` |
| `probe-form-controls.mjs` 回归 | `TOTAL_CONTROLS=66 FAIL_CONTROLS=0` |

**截图逐张 `Image.View` 确认**（不是只看路径）：`article-toc-1440`（正文左缘与页头同线、
目录贴右缘）、`article-notoc-1440`（正文横跨全宽、右缘与页头同线）、`article-toc-1024`、
`article-toc-390`（移动端排版正常）。

溢出检查里唯一越界的元素是既有的 skip-link（`absolute left-[-9999px]`，设计如此），
不是回归。

**路由类型为什么不用 build 日志的图形字符判定**：`○ ● ƒ` 在 PowerShell 重定向 + 终端转码后
会变成 `閳?`，无法可靠区分。改为直接读 `.next/prerender-manifest.json` 的 `routes` 与
`dynamicRoutes` 键列表 —— 这是构建产物本身，不受任何显示层干扰。

### 7. 未覆盖

- **无目录文章正文宽 1180px 偏宽**，这是本轮明确的取舍结果，未做进一步收敛。
- 未测 Firefox / Safari 的 Grid `minmax(0,1fr)` 表现差异（理论上一致）。
- 未做真实触屏验证。
- 未验证其他 5 套配色下的观感（宽度与配色无关，但截图仅取证了 `classic`）。

### 8. 一条值得记住的结论

**「对齐」是一个双边约束，只对齐一边等于没对齐。**

第一次尝试把正文撑到 760px 并 `justify-between`，左缘差 0 —— 如果只盯着「正文左边有没有
空白」，会误判为成功。真正暴露问题的是**把左差与右差当成两个独立的量一起报出来**。

同样值得记的是**第二次尝试的缺陷不是靠推理发现的，是靠看截图发现的**。数字上
`左差 0 / 右差 248` 对两个页面完全一致，看起来「方案对了」；而 `/posts/pan` 没有目录，
那 248px 是**纯空白**而不是目录列 —— 这个区别只有画面能表达。**像素对齐是必要条件，
不是充分条件。**

还有一条工具层教训：`File.Edit` 的行范围又一次没有覆盖完整语法单元（把
`<div className="min-w-0">` 一起吞掉，`TC=2`）。这是本项目**第三次**因同一条纪律出错，
已当场 `npm run typecheck` 捕获并补回。删除型编辑之后必须立刻 typecheck，不能攒着。

---

## D-37 浅色模式按钮侧壁过重：按「与按钮面的落差」反解侧壁

### 1. 需求

用户原话：

> 浅色模式下的主页默认配色有些不协调，尤其是按钮的侧面阴影

两处措辞都需要先翻译成可测量的量，否则改完无法证明改对了，也无法知道有没有把夜间调坏：

- 「浅色模式」—— 只针对 `data-theme='light'`，默认预设 `classic`。
- 「按钮的侧面阴影」—— 在本项目里**不是** CSS `box-shadow`，而是 `.toy-button` 外层元素的 `background: var(--base)`，即被按钮面遮住、按下去会露出来的那块深色侧壁（D-23 确立的结构，见本文件 12 节）。`.toy-card` 的 `box-shadow: 0 8px 0 var(--card-base-color)` 与页头品牌标的 `box-shadow: 0 6px 0 var(--coral-base)` 同源，一并受影响。

用户说的是「主页」，但配色是全局 token，改动必然波及全站，因此验证必须覆盖主页之外的页面。

### 2. 先实测再动手

用 CDP 直连无头 Edge 对用户正在运行的 dev server 做只读探测（1440×1600）。classic / light 的六个色对实测：

| 色对 | cap（按钮面） | base（侧壁） | cap/base | cap/canvas | **base/canvas** |
|---|---|---|---|---|---|
| coral | `#ff656c` | `#6b2a2d` | 3.68 | 2.81 | **10.33** |
| pink | `#ffa0a4` | `#803336` | 4.42 | 1.91 | **8.43** |
| cream | `#e4f9f1` | `#487c69` | 4.38 | 1.08 | 4.72 |
| mint | `#82e2bf` | `#487c69` | 3.11 | 1.42 | 4.72 |
| sky | `#8dd1ff` | `#4e738c` | 3.06 | 1.62 | 4.96 |
| lilac | `#d1afc4` | `#634e5b` | 3.84 | 1.94 | 7.44 |

夜间同项：`base/canvas` 全部落在 **1.01~2.45**（classic/coral 1.37、classic/pink 1.50、classic/cream 2.45）。

把 6 套预设 × 6 色对 × 日夜两态共 72 组全量跑一遍：

- **light：36/36 全部 `base/canvas` > 4.5**，最高 harbor/coral 13.93、ember/coral 11.86。
- **night：0/36 超过 4.5**，全部 1.01~2.45。

### 3. 根因

**根因一：同一个 `shade` 系数在明暗两端的含义完全不同。**

日间用 `shade(p1, 0.58)` 这类固定比例，只知道「往黑里混多少」，不知道混出来的颜色在画布上有多重。浅色画布（`#f9fefc`）上混 0.58 立刻产生 10 的落差；深色画布（`#160e16`）上混 0.7 也只有 1.4。**系数不是强度，对比度才是强度。** 于是同一套「立体」视觉语言，日夜两态的实际强度差约 7 倍 —— 浅色下侧壁读起来是一道黑边，而不是「一实体块的暗面」。

**根因二：`base/canvas` 不能独立于 `cap` 压低（关键，推翻了最初的假设）。**

三个量存在恒等关系：

```
base/canvas = cap/canvas × cap/base
```

推导：`base/canvas = (L_canvas+0.05)/(L_base+0.05)`，`cap/base = (L_cap+0.05)/(L_base+0.05)`，两者相除即得 `(L_canvas+0.05)/(L_cap+0.05) = cap/canvas`。

所以在**不动按钮面**的前提下，想让侧壁在画布上变轻，唯一可调的就是「面与壁的落差」`cap/base`。这直接否定了最初「把日间 `base/canvas` 调到与夜间同量级的 2.5~5」的想法：coral 的 `cap/canvas` 是 2.81，即使 `cap/base` 压到 2.0，`base/canvas` 仍是 5.63。**该目标在数学上不可达**，必须改换表述 —— 正确的目标是「六个色对的 `cap/base` 统一，且不低于设计要求的 2:1」。

**根因三：`cream` 按钮面与画布几乎同色（`cap/canvas = 1.08`），这是设计固有张力，不是本轮缺陷。**

`--cream` 定义为 `tint(p2, 0.78)`（次强调色的极浅版），用途是「标签、徽标、浅底块」。要让它与画布有 1.5 的辨识度，得把 tint 降到 0.05，那时它已等同 `--mint`，cream 变体失去存在意义。所以「快捷入口按钮面看不见」是**使用层**问题（把极浅版当按钮面用），不是 token 层问题；它也确实解释了为什么用户会觉得该处侧壁特别抢眼 —— 侧壁是那些按钮上唯一可见的形体元素。本轮不动使用方式，只把侧壁重量收敛到与其他色对一致。

### 4. 改法

只改 `lib/theme/palette-core.ts` 的 `deriveLightTokens`，**夜间一行未动**。

新增常量：

```ts
/** 侧壁与按钮面之间应有的对比度（D-37）：设计文档要求 ≥2:1，这里留 10% 余量。
 * 同时要求六个色对**统一**取这个值 —— 侧壁轻重不一致本身就是「不协调」。 */
const WALL_CONTRAST = 2.2
```

新增函数（按与按钮面的落差反解，而不是猜混合比例）：

```ts
function wallOn(source: Rgb, cap: Rgb): Rgb {
  const wall = ensureContrast(shade(source, 0.2), cap, WALL_CONTRAST, 'darker')
  // 对比度是对称的，只求解数值分不出「面亮壁暗」与「面暗壁亮」。
  // 侧壁是按钮面下方的实体，物理上必须更暗（D-23 第 4 条不变量），
  // 因此方向不成立时从更深的起点重解。
  if (luminance(wall) < luminance(cap)) return wall
  return ensureContrast(shade(source, 0.6), cap, WALL_CONTRAST, 'darker')
}
```

六个按钮面提成中间变量（侧壁需要拿到按钮面的实际颜色），六个 `--*-base` 改用 `wallOn`：

```ts
const capCoral = capOn(p1, onAccent)
const capPink = capOn(tint(p1, 0.38), onAccent)
const capCream = capOn(tint(p2, 0.78), onAccent)
const capMint = capOn(p2, onAccent)
const capSky = capOn(p3, onAccent)
const capLilac = capOn(tint(mix(p1, p3, 0.5), 0.2), onAccent)
```

```ts
'--coral': toHex(capCoral),
'--coral-base': toHex(wallOn(p1, capCoral)),
'--pink': toHex(capPink),
'--pink-base': toHex(wallOn(p1, capPink)),
'--cream': toHex(capCream),
'--cream-base': toHex(wallOn(p2, capCream)),
'--mint': toHex(capMint),
'--mint-base': toHex(wallOn(p2, capMint)),
'--sky': toHex(capSky),
'--sky-base': toHex(wallOn(p3, capSky)),
'--lilac': toHex(capLilac),
'--lilac-base': toHex(wallOn(mix(p1, p3, 0.5), capLilac)),
```

先压暗 20% 再求解，是因为源色本身可能很浅（例如 harbor 的 `#bfad5a`），从原色出发需要混很多才够 2.2。

**没有做的事**：

- 不改 `deriveNightTokens`。夜间 `cap/base` 3.93~8.10、`base/canvas` 1.01~2.45 正是「暗面」该有的量级，改它等于把对的改成错的。
- 不改 `--shell`。classic 日间 `shell/canvas = 1.32`（两块大面板几乎融进画布）确实存在，但它与侧壁过重在视觉上互相放大；侧壁变浅后挤压感明显缓解。动 shell 会改变触感面板与配色实验室两块大面板的观感，超出用户点名的范围，记为**未改项**。
- 不改 6 个 cap 的派生系数，不改 `config/palette.ts` 的预设色值，不改 `app/globals.css` 的任何一行。
- 不改 `.tag-chip` 的选中态、不改 `.toy-card` 的 8px 底座厚度。

### 5. 验证

**Node 侧全量（6 套 × 6 色对 × 日夜 = 72 组）**

改后 classic / light：

| 色对 | cap | base | cap/base | **base/canvas** | base/canvas 变化 |
|---|---|---|---|---|---|
| coral | `#ff656c` | `#9f3f43` | 2.24 | 6.31 | 10.33 → 6.31 |
| pink | `#ffa0a4` | `#cc5156` | 2.22 | 4.22 | 8.43 → 4.22 |
| cream | `#e4f9f1` | `#68b599` | 2.21 | 2.38 | 4.72 → 2.38 |
| mint | `#82e2bf` | `#55947d` | 2.29 | 3.48 | 4.72 → 3.48 |
| sky | `#8dd1ff` | `#5c89a7` | 2.27 | 3.69 | 4.96 → 3.69 |
| lilac | `#d1afc4` | `#8f7083` | 2.21 | 4.28 | 7.44 → 4.28 |

全 36 组日间里，`cap/base` 有 29 组落在 2.20~2.30；4 组落在 2.49~2.90（源色本身很浅，压暗 20% 后已足够深，`ensureContrast` 起点即达标，未继续混合）；3 组 cream 例外：tide 2.60、sunrise 2.72、meadow 3.30、ember 5.25 —— cream 的 `cap` 极浅，`wallOn` 需要一路压到很深的源色，而 `ensureContrast` 的 0.02 步长在深色段一格跨度过大。ember 的 5.25 是全表最高值，仍远低于改前日间的 10~14。

**不变量断言（72 项，全部通过）**

| 项 | 门槛 | 实测 |
|---|---|---|
| `--on-accent` vs 6 个 cap | ≥ 4.5 | `MIN_FG=4.526781 @ ember/light/lilac`，`FAIL_FG=0` |
| `cap` vs `base`（立体厚度） | ≥ 2.0（设计文档 2:1） | `MIN_WALL=2.204233 @ harbor/light/lilac`，`FAIL_WALL=0` |
| `base` vs `canvas` | 仅记录 | `MIN=1.005140`（meadow/night/lilac）、`MAX=8.249006`（ember/light/sky） |
| `TOTAL_CHECKS` | 72 | 72 |

**token 回归守卫**

`diff-tokens-d34.mjs` 第一次跑出 `CHANGED=0`，与本轮实际改动矛盾 —— 查明是它的输入 `pc-new.mjs` 仍是 D-34 时期的旧副本（`wallOn` 命中数 0），拿旧版本与旧版本比必然全等。**这是假阴性，不能当证据。** 重建基线（`git show HEAD:lib/theme/palette-core.ts` → `pc-old.ts`，工作区 → `pc-new.ts`，各自转译）后重跑：

```
SAME=348
CHANGED=36
ADDED=0
REMOVED=0
CHANGED_KEYS=--coral-base,--pink-base,--cream-base,--mint-base,--sky-base,--lilac-base
REMOVED_KEYS=(none)
```

`CHANGED=36` 恰为 6 套 × 6 色对，全部 `*/light`，全部是 `--*-base`；**夜间 36 组一行未变**；`REMOVED=0` 说明没有 token 丢失。

**构建与路由类型**

隔离副本（`.me/buildcheck` + junction + 3100 端口，全程未碰用户 dev server 的 `.next`）：

| 项 | 结果 |
|---|---|
| `next build` | `BUILD=0`，`Compiled successfully in 55s` |
| 静态生成 | `Generating static pages (13/13)` |
| `PRERENDER_ROUTES` | **10** |
| `DYNAMIC_ROUTES` | **2**（`/posts/[slug]`、`/timeline/[id]`） |

与 D-35 / D-36 基线完全一致，公开页仍为 Static / SSG。路由类型取自 `.next/prerender-manifest.json` 的键列表，不用 build 日志里的图形字符（`○ ● ƒ` 经 PowerShell 重定向与终端转码后会变成 `鈼?`，无法可靠区分）。

**回归扫描（对 3100 生产实例）**

| 脚本 | 结果 |
|---|---|
| `scan-admin` | `TOTAL_NODES=1242 FAIL_NODES=0 GROUPS=0`，8 页 × 日夜 |
| `scan-shiki` | 日 `TOKENS=16 FAIL=0`、夜 `TOKENS=16 FAIL=0` |
| `probe-form-controls` | `TOTAL_CONTROLS=66 FAIL_CONTROLS=0`，`color-scheme` 日夜正确 |

`TOTAL_NODES` 比 D-36 的 1244 少 2，是文章页内容变化所致（本轮未改任何后台页面结构），非回归。

**其它页面与移动端（3100 生产实例）**

| 页面 | `--coral-base` | 横向溢出 |
|---|---|---|
| `/posts` | `#9f3f43` | false |
| `/about` | `#9f3f43` | false |
| `/timeline` | `#9f3f43` | false |
| `/stats` | `#9f3f43` | false |
| `/posts/playful-recorder` | `#9f3f43` | false |
| `/admin/login` | `#9f3f43` | false |

390px（`Emulation.setDeviceMetricsOverride`，不用 `--window-size=390`）：

- 主页：`hscroll=false`，`.page-shell` 宽 **362px**（左 14 / 右 376），按钮高 49px（≥44 触控目标）
- 文章列表：`hscroll=false`，`.page-shell` 宽 362px，按钮高 49px

**观感确认（逐张 `Image.View`，不是只看路径）**

主页 light 三段 + night 首屏、4 张按钮特写（大按钮 / 快捷入口 cream / 页头 / 文章卡）、文章列表 / 文章详情 / 登录页、移动端 2 张 —— 共 14 张。确认：侧壁由接近黑边的深暗红变成同色相的中等暗面；夜间画面与改前逐像素一致；cream 快捷入口的侧壁不再是唯一可见的形体元素。

### 6. 未覆盖

- `--shell` 日间 `shell/canvas = 1.32`（classic）未改，见第 4 节。
- `cream` 按钮面与画布 `cap/canvas = 1.08` 未改 —— 属使用层问题，见第 3 节。
- `.tag-chip` 选中态、`--line` / `--grid` 半透明边框叠色后的对比度仍未计算（D-33 遗留）。
- 未测 Firefox / Safari。派生全部在构建期完成，与浏览器无关，理论上无差异。
- 未测真实触屏与屏幕阅读器。

### 7. 一条值得记住的结论

**「把观感翻译成数字」之后，还要检查这个数字是不是真能独立调整。**

本轮最初的目标是「让日间 `base/canvas` 降到与夜间同量级」。这个目标听起来完全合理，量化也到位，但它忽略了一个恒等式：`base/canvas = cap/canvas × cap/base`。在按钮面不动的前提下，侧壁在画布上的重量并不能单独压低 —— 它被按钮面钉住了。如果不先验证这个自由度，就会陷入「系数一降再降、`cap/base` 却塌到 1、按钮面与侧壁再也分不清」的死胡同，而 `base/canvas` 仍达不到目标。

正确的目标不是「让某个数字到达某个值」，而是「找到一个实际可调的自由度，并对它求解」。本轮的自由度是 `cap/base`，解法是 `wallOn`：不再猜混合比例，而是按与按钮面的落差反解到设计文档要求的 2:1（取 2.2 留余量）。

顺带记下第二次踩到的同类陷阱：**回归守卫自己也可能失效。** `diff-tokens-d34.mjs` 报 `CHANGED=0` 时，第一反应是「改动没生效」；实际是它的基线输入是 D-34 时期的旧副本，拿旧版本与旧版本比必然全等。守卫的输入必须与被测对象同步刷新，否则它会安静地给出「一切正常」——这比报错更危险。

---

## D-38 手机浏览器下主页布局错乱：元素级取证，四处固有宽度

### 1. 需求

用户报告：「在手机浏览器下，主页布局会出现问题」。

这条报告直接否定了上一轮（D-37）「390px 无横向溢出」的结论。D-37 是在 390px 下验过 `hscroll=false` 才收工的，而用户在真机上看到的却是坏的。因此本轮的第一件事不是改代码，而是先回答：**上一轮的检查为什么没发现？**

### 2. 先实测再动手：上一轮的检查为什么是假阴性

两层原因，彼此独立，任何一层单独存在都会让检查失效：

1. **被裁切的溢出不会产生滚动条。** 触感面板的外层是 `<section class="relative overflow-hidden rounded-[34px] ...">`。`overflow: hidden` 把内部溢出直接裁掉，页面既没有横向滚动条，`documentElement.scrollWidth` 也可能不被撑开。凡是「元素在自己容器里溢出、而容器自己裁切」的情形，页面级 `hscroll` 天然看不见。
2. **整数容差吃掉了 1px 的真相。** D-37 的判据是 `scrollWidth > clientWidth + 1`，而实测页面的真实溢出是 391 对 390 —— 差值恰好 1，被 `+1` 容差吞掉。容差本意是滤掉亚像素抖动，但它同时把「1px 系统误差级的真实溢出」一起滤掉了。

结论：**对这套代码，页面级横向溢出不能作为移动端布局健康的证据。** 本轮改用元素级取证 —— 对每个可见元素同时量两件事：`getBoundingClientRect()` 相对视口的左右边界、相对父元素的左右边界；并对每个元素单独比较 `scrollWidth` 与 `clientWidth`。后者能把被 `overflow: hidden` 掩盖的溢出也照出来。

### 3. 根因：四处，全部是「固有宽度大于可用宽度」

#### 3.1 活动列表把整页撑到 391px 最小宽度（波及全站，最严重）

`components/site/activity-feed.tsx` 原为 `<ol className="grid gap-2.5">`。

单列 grid 的默认轨道是 `auto`，它按项目的 **min-content** 取宽。项目内是 `a.flex` 加 `span.min-w-0.truncate`，而 Tailwind 的 `truncate` 含 `white-space: nowrap`，于是长标题的 min-content 约为 377px，`li` 恒定 377px —— 320、360、390 三档实测**全都是 377**，与视口宽度无关。`14 + 377 = 391`，正是实测到的 `innerW` 与 `docScrollW`。

这里有一个容易走错的岔路：给 `li` 加 `min-w-0` 无效。grid item 的 `min-width: auto` 由轨道的 `minmax()` 决定，不由项目自身决定。

#### 3.2 触感面板控件行溢出 117px，旋钮被裁、滑块被挤出左边界

`components/site/touch-panel.tsx` 的控件行原为 `order-2 flex items-center justify-center gap-6 ...`。外层 `flex-col` 只管「左块 / 右块」两栏，管不到右块内部的这一行，所以这一行**始终横排**。

三个控件的宽度是硬编码像素：每个滑块轨道 `SLIDER_HIT_WIDTH = 88`，旋钮容器 `KNOB_SIZE = 300`。390px 视口下内容区只有 290px，需求约 407px，溢出 117px —— 被面板的 `overflow: hidden` 静默裁掉。

实测（390 视口，`page-shell` 362）：

| 元素 | clientW | scrollW | 溢出 |
|---|---|---|---|
| `section.relative overflow-hidden rounded-[34px] p-4` | 362 | 443 | 81（被裁） |
| `div.rounded-[24px] p-5` | 330 | 427 | 97 |
| `div.flex flex-col gap-7` | 290 | 407 | 117 |
| `div.order-2 flex items-center justify-center gap-6` | 290 | 407 | 117 |

元件级：旋钮组固定 300px，`l=157 r=457`（右溢 67）；滑块轨道 `l=-67 r=21`（左溢 67，半个滑块在屏幕外）。

#### 3.3 页头在 320px 下固有宽度 319px

`components/site/site-header.tsx`：品牌链接 161px + 页头横向间距 20px + 右侧组（主题开关 + 登录按钮，导航链接在 `sm` 以下本就 `hidden`）138px = **319px**，而 320px 视口的 `.page-shell` 只有 `min(100% - 28px, 1180px)` = **292px**。溢出 27px，把 `innerW` 顶到 333。

这一处是**既有缺陷，不是本轮改动引入的**：改动前 320px 的 `innerW` 是 391，右侧组同样坐在 195..333。只是被 3.1 的更大溢出掩盖着。

#### 3.4 配色实验室的五个色槽在窄屏把十六进制值裁掉

`components/site/palette-lab.tsx` 原为 `mt-5 grid grid-cols-5 gap-2`。每个色槽是 `border-2 p-2`，共占去 20px 水平空间：

| 视口 | 每列宽 | 内容宽 | 十六进制文本所需 | 结果 |
|---|---|---|---|---|
| 320 | 65.3 | 16 | 43 | 严重裁切 |
| 390 | 88.7 | 30 | 43 | 仍被裁（`#FF656C` 显示为 `#FF656`） |

390px 下同样被裁，说明这不是「只有极窄屏才有」的问题，而是 5 列在移动端根本放不下 7 个字符的等宽十六进制串。

### 4. 改法

四处都是「把固有宽度降到可用宽度以内」，方式各不相同，全部用现有断点体系，不新增 CSS 文件、不改 `app/globals.css`。

#### 4.1 活动列表

`grid` → `grid grid-cols-1 gap-2.5`。Tailwind 的 `grid-cols-1` 展开为 `repeat(1, minmax(0, 1fr))`，**那个 0 下限**才是起作用的部分：轨道下限归零后，轨道才能等于容器宽，而不是被内容撑到 min-content。

#### 4.2 触感面板：两层结构 + 窄屏旋钮尺寸

**结构**：控件区改成两层。外层 `flex flex-col items-center justify-center gap-6 lg:flex-row lg:shrink-0 lg:gap-7` 负责「窄屏堆叠 / 宽屏横排」；两个滑块再包进一个 `flex items-center justify-center gap-6` 子行。窄屏得到「滑块行 88+88+24=200」+「旋钮行 210」；`lg` 及以上 `lg:flex-row` 精确复现原来的一行三列，桌面观感不变。

**尺寸**：新增 `KNOB_COMPACT`（桌面值 × 0.7 后逐项取整）：

```
size 210 / disc 157 / tickInner 81 / tickOuter 101
depth 10 / pointerTop 10 / pointerLen 32 / pointerW 8
```

选择用 `useSyncExternalStore` + `matchMedia(COMPACT_QUERY)`，`COMPACT_QUERY = '(max-width: 1023px)'`，server snapshot 固定 `false`。选 1023 而不是某个随手值，是为了与 Tailwind `lg:` 停止生效的宽度对齐 —— 让 JS 的判断点和 CSS 的断点落在同一处，否则会在某个宽度区间出现「布局已经横排、旋钮还是小号」的错配。

**D-27 三条几何不变式在窄屏值上复核**（这是换尺寸时最容易被破坏的东西）：

- 刻度内端 81 > 底面圆半径 157/2 = 78.5 —— 刻度整圈严格在底面圆之外
- 刻度外端 101 < 容器半径 210/2 = 105 —— 刻度不超出容器
- 顶面圆上移 `depth/2 = 5` 后覆盖面到 78.5 + 10 = 88.5 > 81 —— 顶部刻度仍被顶面压住，三层结构成立

**明确否决的两种做法**：

- `transform: scale`：缩放不改变布局尺寸。300px 仍然占着 300px 的位置，溢出一点没少。
- `zoom`：各引擎对「`getBoundingClientRect()` 是否包含缩放」的返回值不一致，而旋钮的 `rawFromPointer` 正是用这个矩形的中心算 `atan2` 求角度。一旦矩形含缩放，指针角度会整体偏掉 —— 手感的几何基础就被换掉了。

#### 4.3 页头：窄档压缩 + 换行兜底

- 页头：`gap-5` → `gap-x-3 gap-y-3`，并在 `min-[360px]` 起恢复 `gap-x-5`；同时加 `flex-wrap`，右侧组加 `ml-auto`。
- 品牌：`text-2xl` → `text-xl`、`gap-[11px]` → `gap-2`，`min-[360px]:` 起恢复原值。
- 右侧组：`gap-2.5` → `gap-2`，`min-[360px]:gap-2.5`。

窄档所需：品牌 139 + 间距 12 + 右侧组 136 = **287 ≤ 292**。`flex-wrap` 是兜底 —— 字体度量在不同平台有细微差异，万一某一台机器算出来差几像素，它会换行右对齐，而不是溢出。`min-[360px]:` 保证 360 及以上完全保持原样。

没有选择「把导航收进汉堡菜单」：导航链接在 `sm` 以下本来就是 `hidden`，320px 下右侧组只有主题开关和登录按钮，两者都是必需的常驻控件，收进菜单反而增加一次点击。这不是一次导航交互的改动。

#### 4.4 配色实验室：窄屏三列

`grid-cols-5` → `grid-cols-3`，`min-[480px]:grid-cols-5`。

480 这个阈值不是猜的：五列在 480px 时每列 68px、内容宽 48px，刚好容下 48px 的十六进制文本（实测 `maxSpanOver=0`）。320–414 一律三列（3+2 两行），每列内容宽 45–77px，全部放得下。

#### 4.5 没有做的事

- `app/globals.css` 零改动。`.page-shell` 的 `min(100% - 28px, 1180px)` 在 320px 下给出 292px，是合理值，问题不在外壳。
- 未改 `config/palette.ts`、未改任何配色 token（D-37 已闭环）。
- 未改 `DetentSlider` 的尺寸常量与手感状态机（`anchor`/`creep`/`THRESHOLD_MIN`/`CREEP_RATIO` 全部原值）。
- 未给 `.stat` 做任何处理。414px 下 `.stat` 报 `sw=204 cw=184 ox=hidden`，看似溢出；读 CSS 可知那是 `::after` 装饰圆故意放在 `right:-20px`，`.stat` 本来就是 `overflow: hidden` —— 这正是它存在的理由，不是缺陷。
- 未在窄屏改导航交互（理由见 4.3）。

### 5. 验证

**类型**：`npm run typecheck` 在每次改动后执行，`$LASTEXITCODE=0`。

**元素级边界（四档视口，CDP `Emulation.setDeviceMetricsOverride`）**

改前：320/360/390 三档 `innerW` 均为 391。

改后（`probe-mobile-after2.log`）：

| 视口 | innerW | viewportOverCount | parentOverCount |
|---|---|---|---|
| 320 | 320 | 0 | 0 |
| 360 | 360 | 0 | 0 |
| 390 | 390 | 0 | 0 |
| 414 | 414 | 0 | 0 |

**页头（`probe-compact-f38b/c/d.log`，五档）**

320：`headerW=292`、`headerScrollW=292`、品牌 `l=14 r=153 w=139`、右侧组 `l=170 r=306 w=136`。
340/360/375/390：`headerScrollW == headerW`（312/332/347/362），品牌在 ≥360 恢复 161px、右侧组恢复 138px，与改动前逐像素一致。

**色槽（`probe-swatch2-f38.log`，九档 320…1440）**

九档 `maxOver` 全为 0。320 档仅 `#8DD1FF` 一个 span 溢出 1px（`sw=46 cw=45`），其余全部为 0。1440 档列宽 `208.797px × 5`，与改动前完全一致 —— 桌面零回归。

**隔离副本生产构建**

`robocopy` → `mklink /J node_modules` → 副本内 `next build`：`BUILD_EXIT=0`，`Compiled successfully in 44s`，`Generating static pages (13/13)`。

路由类型从 `.next/prerender-manifest.json` 读，**不从构建日志的符号读**（`○ ● ƒ` 经 PowerShell 重定向会变成乱码）：`routes` 10 个键（`/_not-found`、`/robots.txt`、`/about`、`/sitemap.xml`、`/rss.xml`、`/`、`/timeline`、`/stats`、`/posts/pan`、`/posts/playful-recorder`），`dynamicRoutes` 2 个键（`/timeline/[id]`、`/posts/[slug]`）—— 与 D-35/D-36 基线完全相同，没有退化。

**三项回归扫描（对 3100 端口的生产构建实例）**

- `scan-admin`：`TOTAL_NODES=1242 FAIL_NODES=0 GROUPS=0`（8 个后台页 × 明暗两态）
- `scan-shiki`：`/posts/playful-recorder` 明暗两态各 `TOKENS=16 FAIL=0`
- `probe-form-controls`：`TOTAL_CONTROLS=66 FAIL_CONTROLS=0`，`color-scheme` 与 `data-theme` 逐页一致

**观感确认（逐张 `Image.View`，不是只看路径）**

320 页头特写、320 触感面板、390 全页五分段、360 首屏与快捷入口、320/390/1440 三个宽度的色槽特写 —— 逐张确认：页头四个元素全部落在 320 视口内且有右侧留白；触感面板控件纵向堆叠、旋钮完整不再被裁；滑块不再贴左边缘；概览卡片右列完整；活动列表每条都收在边框内、长标题以省略号截断；色槽在 320/390 为 3+2 两行、十六进制值完整，1440 为一行五列且与改前一致。

**一处异常读数及处理**

改完页头源码后第一次跑探针，320 档报 `knobBoxW=300`（桌面尺寸），而 340/360/375/390 都是 210。同一脚本同一顺序、此前 320 档报的也是 210。连续重跑两次（换端口 9505），两次都是 210。

判断：dev server 重新编译期间首屏未完成 hydration，`useSyncExternalStore` 仍返回 server snapshot 的 `false`，于是画的是桌面尺寸；探针在编译窗口内采样，采到了这个瞬时态。结论有两次重复测量支撑，不是产品缺陷。**但这也说明一件事：在 dev server 上取瞬时测量值必须先确认 hydration 已完成，否则会把编译竞态当成布局缺陷。**

### 6. 未覆盖

- 未测真机（iOS Safari / Android Chrome）。全部测量走 CDP 的 `Emulation.setDeviceMetricsOverride`，与真实设备在 `dvh`、地址栏收缩、字体度量上可能有差异。页头留了 `flex-wrap` 兜底正是针对字体度量差异。
- 未测 Firefox / Safari。
- 未测横屏与平板中间宽度（415–479、481–639）。
- `--shell` 日间 `shell/canvas = 1.32`、`cream` 的 `cap/canvas = 1.08` 仍是 D-37 记录在案的遗留项，本轮未动。
- `.tag-chip` 选中态、`--line` / `--grid` 叠色后对比度仍未计算（D-33 遗留）。
- `config/site.ts` 的 `/feed.xml` 与真实路由 `/rss.xml` 不一致（实测 404 vs 200），与本轮无关，未在本轮改动。

### 7. 一条值得记住的结论

**验证方法本身会失效，而且失效时不会报错。**

D-37 在 390px 下测出 `hscroll=false` 就收工了，用户却在真机上看到布局错乱。复盘时发现两个独立漏洞：`overflow: hidden` 让「容器内溢出」不产生任何滚动条；`+1` 容差让 391 对 390 的 1px 真实溢出被判为正常。两条叠加，检查表全是绿灯，缺陷一个不少。

这和 D-37 记下的「回归守卫自己也可能失效」是同一类错误，但这次更隐蔽 —— 上一次是守卫的**输入**过期（拿旧版本比旧版本必然全等），这一次是守卫的**观测量**选错了（页面级滚动条根本看不见元素级裁切）。

由此得到两条可复用的规则：

1. **审计的观测量必须与被测对象的失效方式匹配。** 「溢出」有两种：撑破视口（会产生滚动条）和被祖先裁切（不会）。只测前者，等于对后者完全不设防。这也是本项目第二次遇到「审计维度没有按对象种类枚举」的问题 —— 第一次是侧壁（`base/canvas`）既不是文本、也不是控件自身背景，因此在前几轮全员零失败的情况下一直没人量它。
2. **容差必须小于你要检测的最小缺陷。** `+1` 容差能滤掉亚像素抖动，但 1px 的整页位移是真实缺陷。当容差与最小缺陷同量级时，检查就失去了分辨力 —— 而它不会告诉你这件事。

顺带记下一条操作纪律：**在 dev server 上取瞬时测量值，必须先把「编译竞态」和「产品缺陷」分开。** 本轮就出现过一次 `knobBoxW=300` 的假警报，靠连续两次重跑排除。做法是固定的：同一测量重复两次，一致才采信。
