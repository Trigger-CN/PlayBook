# 底层框架说明

描述当前已落地的工程骨架与模块边界，供后续开发直接遵循。基线决策见 [DECISIONS.md](DECISIONS.md)。

技术栈：Next.js 15 App Router · React 19 · TypeScript 5.9（strict）· Tailwind CSS 3.4 · MDX · Supabase（Phase 5 起启用）。

---

## 1. 分层结构

```text
app/                路由与页面编排（Server Component 优先）
components/ui/      基础视觉组件（ToyButton / ToyCard / StatBlock / ThemeToggle）
components/site/    站点外壳（Header / Footer / Nav）
config/             站点身份、导航与快捷入口配置
lib/content/        内容管线（schema → repository → toc / mdx）
lib/interactions/   互动领域契约与校验器
lib/cache/          缓存 tag 与失效矩阵
lib/activity/       活动事件枚举
lib/timeline/       时间轴领域（类型 → 视图 → 种子仓库）
lib/supabase/       数据访问客户端
content/posts/      MDX 正文（MVP 真实来源）
docs/architecture/  决策与框架说明
```

依赖方向严格向下：页面 → 组件/仓库 → 领域契约。领域层不得反向依赖页面。

---

## 2. 主题系统

两套 CSS 变量定义在 `app/globals.css` 的 `:root` 与 `:root[data-theme='night']`。六个交互色全部成对定义（cap / base），底座不通过运行时变暗生成。

主题持久化遵循 D-08：cookie 为真源，根布局静态输出默认主题，`<head>` 内联脚本在首绘前纠正。这样既避免闪烁，又保住静态生成。

**约束**：客户端组件只能从 `lib/theme-shared.ts` 取主题常量；禁止引入带 `server-only` 的模块。

---

## 3. 立体按钮

`.toy-button` 是项目唯一的按压结构，实现于 `app/globals.css`，React 封装在 `components/ui/toy-button.tsx`。

结构不变量：

- 外层元素是唯一交互根（`button` 或 `a`），承担语义、点击区域与焦点环；其背景即深色底座。
- 外层水平 padding 必须为 `0`；水平留白只放在内层 `.toy-button__top`。
- 内外圆角一致，按钮面按下后边缘仍对齐。
- 厚度来自外层底部 padding 与按钮面负向位移，不使用模糊阴影。
- hover 只移动内层，不移动外层占位（避免布局抖动）。
- transition 只作用于 `transform` 与轻量 `filter`。

尺寸与色对通过 CSS 变量覆盖，不复制状态规则。`pressed` 只切换色对与 `aria-pressed`，不保持物理按下位移。

---

## 4. 内容管线

```text
content/posts/*.mdx
  → gray-matter 解析 frontmatter
  → zod 校验（失败即抛错，构建失败而非静默跳过）
  → 过滤 draft 与未来文章
  → 生成 PostIndexItem 索引（含 readingTime）
  → 列表/首页消费索引，详情页编译正文
```

`lib/content/repository.ts` 暴露 `PostRepository` 接口：`list` / `getBySlug` / `listTags` / `listCategories`。页面只依赖接口，后续切换数据库正文源时提供另一实现即可，调用契约不变。

- 排序：`publishedAt desc`，以 `slug` 作为稳定次键，避免同日文章分页跳动。
- 分页：默认 10 条，上限 50；越界页码收敛到有效页。
- 阅读时间：中文按字、西文按词加权估算，最少 1 分钟。
- 目录：`extractToc` 跳过代码围栏，slug 规则与 `rehype-slug` 一致，保证锚点可跳转。
- 渲染：`compileMDX` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings` + `rehype-pretty-code`，代码高亮在构建期完成，客户端不加载高亮运行时。

**发布前校验**（frontmatter 层已实现）：必填字段、`cover` 存在则 `coverAlt` 必填、slug 唯一（重复即抛错）。

---

## 5. 互动与数据层

`lib/interactions/types.ts` 定义统一目标模型（D-06）：文章用 slug、时间轴用 id 作为 `target_id`。点赞唯一性由数据库约束保证（D-04，`visitor_id NOT NULL`）。

`lib/interactions/validators.ts` 提供客户端与服务端共用的 zod schema：`commentInputSchema`（昵称/正文必填、长度上限）、`likeTargetSchema`、`viewInputSchema`（`path` 必须以 `/` 开头）。

`lib/supabase/server.ts` 使用 `@supabase/ssr` 创建带会话的服务端客户端；`lib/supabase/client.ts` 为惰性浏览器客户端，仅使用 anon key。service role 不得进入客户端。

`lib/cache/tags.ts` 集中定义全部缓存 tag 及失效函数（`postInvalidationTags` / `timelineInvalidationTags`），业务代码禁止手写 tag 字符串。

`lib/activity/events.ts` 是活动事件的唯一定义处（D-03），并提供 `isPublicActivityEvent` 过滤公开可见事件。

---

## 6. 当前渲染策略

构建结果（已验证）：

| 路由 | 类型 | 说明 |
| --- | --- | --- |
| `/` | Static | 首页聚合 |
| `/posts` | Dynamic | 读取 searchParams 做筛选分页 |
| `/posts/[slug]` | SSG | `generateStaticParams` 预渲染全部已发布文章 |
| `/about` | Static | 静态内容 |
| `/timeline` | Static | 读本地种子数据，客户端筛选，不读 searchParams |
| `/timeline/[id]` | SSG | `generateStaticParams` 预渲染全部已发布节点 |
| `/stats` | Static | Phase 7 接入聚合后改为 ISR |
| `/robots.txt`、`/sitemap.xml` | Static | 由路由生成 |

First Load JS 共享 103 kB。根布局必须保持不读 `cookies()`，否则整站退化为 Dynamic。

---

## 7. 后续阶段的接入点

| 阶段 | 接入位置 | 说明 |
| --- | --- | --- |
| Phase 4 | `lib/timeline/repository.ts` | 已用本地种子数据跑通；Phase 5 换实现，页面层不变 |
| Phase 5 | `supabase/migrations/` | 按 D-03/D-04/D-05 建表与约束 |
| Phase 6 | `app/api/likes|comments|views/route.ts` | 复用 `lib/interactions/validators.ts` |
| Phase 7 | `lib/activity`、`lib/cache/tags` | 聚合任务与失效矩阵 |
| Phase 8 | `app/admin/`、`middleware.ts` | `requireAdmin()` 统一授权 |

---

## 8. 本地开发

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # 生产构建
```

环境变量参考 `.env.example`。Phase 5 之前无需配置 Supabase 即可运行；一旦配置，`lib/supabase/*` 才会真正建立连接。

**注意**：PowerShell 会话若以 UNC 路径（`\\?\D:\...`）作为 cwd，npm 的子进程会回退到 `C:\Windows` 并报 `EPERM`。执行命令前先 `Set-Location -LiteralPath 'D:\UnmCode\myweb'`。

---

## 9. 基础组件与时间轴领域

### 9.1 组件分工

| 组件 | 位置 | 职责 |
| --- | --- | --- |
| `ToyButton` | `components/ui/toy-button.tsx` | 唯一按压结构；`topClassName` 只调整按钮面内部排布，不承载状态样式 |
| `ToyCard` | `components/ui/toy-card.tsx` | 实体内容卡；传 `href` 时整卡是链接根，否则是普通容器 |
| `StatBlock` | `components/ui/stat-block.tsx` | 单个数据块，网格由外层 `.stats` 承担 |
| `QuickLinkBar` | `components/site/quick-link-bar.tsx` | 快捷入口阵列，站内外链接共用 `ToyButton` |
| `TimelineCard` | `components/timeline/timeline-card.tsx` | 时间轴节点卡；日期、类型徽标、标题、首段与可选缩略图，列表与首页共用 |

**不变量**：卡片内只能有一个交互根。需要多个链接时改用非链接卡片，禁止在 `a` 内嵌套 `a` 或 `button`。

.stats 使用 `repeat(auto-fit, minmax(170px, 1fr))` 自适应列数，不再用媒体查询硬编码 5/3/2 列，因此任意数量的 `StatBlock` 都能均匀排布。

### 9.2 时间轴

```text
lib/timeline/types.ts       六种类型与三种状态的字面量定义
lib/timeline/view.ts        排序、日期格式化、年/月分组
lib/timeline/seed.ts        本地种子数据（无数据库时的内容来源）
lib/timeline/repository.ts  旧的直接实现；页面已改走 lib/data 端口层
lib/supabase/database.types.ts  数据库 schema 的 TypeScript 映射
config/timeline.ts          类型 → 标签/图标/色对的唯一映射
```

- 排序 `occurredAt desc`，以 `id` 作稳定次键；年/月分组在服务端完成。
- 只有 `status === 'published'` 进入公开页面，`draft` 与 `archived` 均不展示。
- 类型必须同时以文字和颜色表达，颜色只能取自 `config/timeline.ts`。
- 筛选在客户端完成，`/timeline` 因此不读 `searchParams`，保持静态生成。
- 页面通过 `getDataPorts().timeline` 取数据，不直接引用 `seed.ts` 或 SQL。
- Phase 5 接入 Supabase 时只需新增一个适配器，页面层不变。

### 9.3 首页聚合

首页由五个区块组成：Hero、快捷入口、最近文章、最近时间轴、站点概览。

- 最近文章取 `getDataPorts().posts.list({ pageSize: 3 })`。
- 最近时间轴取 `getDataPorts().timeline.listPublic()` 的前 5 条，与 `/timeline` 共用 `TimelineCard`。
- 站点概览的四个数字全部来自真实内容源：已发布文章数取 `list` 返回的 `total`，时间轴记录数取公开节点总数，记录跨度取节点年份去重数，最近更新取文章 `updatedAt ?? publishedAt` 与最新节点的最大日期。
- 浏览量、点赞、评论三项在 Phase 6/7 接入后再补，当前不显示占位数字。

### 9.4 数据端口层与两套实现（当前主用自建 PostgreSQL）

页面只能依赖接口，不直接引用具体数据源。切换实现只改 `getDataPorts()` 一个分支。

```text
lib/data/ports.ts              与驱动无关的接口契约（PostPort / TimelinePort / InteractionPort / StatsPort）
lib/data/index.ts              getDataPorts()：有 DATABASE_URL 走 postgresPorts，否则走 filePorts
lib/data/adapters/file.ts      文件/种子实现；互动方法显式抛错，不假装成功
lib/data/adapters/postgres.ts  自建库实现；只用标准 SQL，无 auth.* / service_role
lib/db/pool.ts                 pg 连接池单例（挂 globalThis，避免 dev 热重载耗尽连接）
lib/db/query.ts                query / queryOne / withTransaction / checkDatabaseHealth
scripts/db-migrate.mjs         迁移执行器：schema_migrations 幂等、单文件单事务、能力探测
scripts/db-health.mjs          连通性与 schema 自检（只打印 host:port/db，不打印连接串）
```

迁移文件分层（SQL 只写一份，自建库与 Supabase 共用）：

```text
supabase/migrations/20261021000001_init_schema.sql            通用：7 张表、28 条约束、索引、触发器
supabase/migrations/20261021000002_rls_policies.sql          【仅 Supabase】RLS + is_admin() + grant to service_role
supabase/migrations/20261021000003_public_counts.sql         通用：四个 security definer 计数/去重函数
supabase/migrations/20261021000004_lock_down_functions.sql   通用：revoke execute from public
supabase/seed.sql                                            开发种子数据，on conflict do nothing
```

Supabase 客户端（保留待切换，当前不被页面调用）：

```text
lib/supabase/env.ts             读取 NEXT_PUBLIC_* 配置，空串视为未配置
lib/supabase/database.types.ts  Database 泛型，随迁移同步维护
lib/supabase/server.ts          createSupabaseServerClient（带会话）/ createSupabaseStaticClient（不带 cookie）
lib/supabase/client.ts          浏览器客户端，只使用 anon key
lib/supabase/admin.ts           service role，首行 import 'server-only'
```

**约束**：

- 页面与业务组件不得直接引用 `lib/db`、`lib/supabase` 或 `lib/timeline/seed`，只能经 `getDataPorts()`。
- `getDataPorts()` 只看 `DATABASE_URL` 是否存在，不做连接探测；配错时错误在首次查询抛出，而不是让构建失败。
- 无 `DATABASE_URL` 时整站仍可构建与运行（回退 `filePorts`）；互动方法会显式报错提示需配置数据库，不返回假的 0。
- 迁移必须可重复执行；新增字段时同步 `database.types.ts`。
- `admin.ts` 只能被 Route Handler、Server Action 或服务端脚本引用；客户端组件一旦引入会在构建期失败，这是有意设置的护栏。
- 公开内容页用 `createSupabaseStaticClient()`，不要用带会话的版本，否则路由会退化为 Dynamic。

**本地数据库工作流**（需自备 PostgreSQL，并把连接串写入 `.env.local`；`.env.local` 不入库）：

```powershell
npm run db:migrate        # 应用未执行的迁移（自建库自动跳过 000002）
npm run db:migrate:dry    # 只列出将执行的迁移
npm run db:seed           # 迁移后写入 seed.sql
npm run db:health         # 连通性 + 表/函数/迁移自检
```

已用真实 PostgreSQL 18.4 验证：迁移全部跑通且幂等、约束拦截有效、去重函数生效、用 `DATABASE_URL` 构建后页面数据确实来自库、无 `DATABASE_URL` 时 25/25 静态页且路由类型不退化。

**已知未验证**：`000002_rls_policies.sql` 从未在真实 Supabase 上执行（缺项目凭据）；文章正文仍留在 MDX，未迁库。
