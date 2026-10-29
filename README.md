# Playbook

一个面向长期写作、思考与互动的个人内容站。视觉上是「扁平卡通矢量 + 立体按压」，工程上是 Next.js 15 App Router 的静态优先实现 —— 公开页面全部预渲染，主题与互动被隔离成小型客户端岛。

- **文章**：Markdown 写作，支持代码高亮、LaTeX 公式、Mermaid 图表、自动生成目录
- **时间轴**：年月分组、类型筛选的节点式记录
- **互动**：点赞、评论（审核制）、浏览量
- **统计**：站点活跃度、趋势、热门内容
- **后台**：文章管理、正文编辑器、评论审核、时间轴管理
- **5 色配色体系**：全站颜色由 5 个值派生，支持日间 / 夜间两套，且可在页面里现场调
- **无需数据库也能跑**：没有 `DATABASE_URL` 时自动回退到文件 / 种子适配器，整站照常构建与浏览

---

## 快速开始

要求 **Node.js ≥ 20.9**（`package.json` 的 `engines`）。开发机实测 Node v20.16.0 / npm 10.8.1。

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。**做到这一步就够了** —— 没有数据库时文章从 `content/posts/*.mdx` 读取，时间轴用种子数据，页面全部可浏览；点赞、评论、浏览量会明确提示需要数据库，后台整体关闭。

### 一键启动（Windows）

双击根目录的 `start-dev.bat`。它会依次：

1. 检查 Node 版本，必要时自动 `npm install`
2. 若本地库已 `db:setup` 过，先 `db:stop` 再 `db:start`（干净重启）；从未 setup 过则跳过并照常启动
3. `npm run dev`，默认 3000 端口

数据库起不来不会阻塞站点：脚本会打印警告并继续，此时文件模式仍然可用。

### 启用数据库（点赞 / 评论 / 统计 / 后台）

```bash
npm run db:setup     # 首次：下载 PostgreSQL 二进制、建数据目录、建库
npm run db:start     # 每次开机后启动
npm run db:migrate   # 建表
npm run db:import    # 把 content/posts/*.mdx 同步进 posts 表
npm run db:health    # 自检
npm run db:stop      # 停止
```

`db:setup` 用的是上游官方 PostgreSQL 二进制（实测 18.4），装在 `.me/pg/` 下，**不进 `package.json` 依赖**，只监听 `127.0.0.1`。它结束时会打印需要写进 `.env.local` 的连接串。

迁移、聚合、导入等细节与常见问题（端口占用、连接超时、孤儿进程）见 **[docs/LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md)**。

---

## 环境变量

复制 [`.env.example`](.env.example) 为 `.env.local`（已被 `.gitignore` 排除）。**全部可留空**，留空时按下表降级。

| 变量 | 作用 | 留空的后果 |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | 站点绝对地址，用于 canonical / OG / RSS / sitemap | 回退 `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL 连接串 | 整站回退到文件 / 种子适配器，互动与后台不可用 |
| `DATABASE_SSL` | 需要 TLS 时设 `require`（托管库通常需要） | 本机自建库不需要 |
| `DATABASE_POOL_MAX` | 连接池上限 | 默认 10；Serverless 建议调到 3 |
| `INTERACTION_HASH_SALT` | 把 IP / UA / 邮箱哈希成不可逆值；**同时就是后台登录口令** | 用进程内随机盐，重启后哈希全变；后台同时关闭 |
| `ADMIN_EMAIL` | 后台登录账号，逗号分隔可多个 | **整个后台关闭**（刻意的安全默认值） |
| `NEXT_PUBLIC_PALETTE` | 切换配色预设 id（构建期读取） | 用 `config/palette.ts` 里的默认预设 |
| `NEXT_PUBLIC_SUPABASE_URL` 等 | 为将来替换自建库预留 | 不影响运行 |

`SUPABASE_SERVICE_ROLE_KEY` 是 server-only，绝不可出现在客户端 bundle 或日志里。`TURNSTILE_*` 目前只为 Phase 6 预留，**尚未接入**。

登录 = `ADMIN_EMAIL` + `INTERACTION_HASH_SALT` 充当口令。库里既无口令也无口令哈希，会话记在 `admin_sessions`（只存哈希）。

---

## 常用脚本

`package.json` 中实际定义的全部 14 条：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产构建 |
| `npm run typecheck` | `tsc --noEmit` 类型检查 |
| `npm run db:setup` | 装二进制 + 建数据目录 + 建库 |
| `npm run db:start` | 启动数据库（后台常驻） |
| `npm run db:stop` | 停止数据库 |
| `npm run db:migrate` | 应用迁移（幂等） |
| `npm run db:migrate:dry` | 只列出会应用哪些迁移 |
| `npm run db:seed` | 迁移后写入 `supabase/seed.sql` |
| `npm run db:health` | 连通性 + 版本 + 迁移清单 + schema 自检 |
| `npm run db:import` | MDX → `posts.body`（幂等，内容未变则跳过） |
| `npm run db:import:dry` | 只报告会新增 / 更新 / 跳过哪些文章 |
| `npm run db:aggregate` | 每日统计聚合（`--date` 单日 / `--days N` 回填） |

> 项目**没有**配置 lint 脚本，`npm run lint` 不存在。提交前的健康检查就是 `npm run typecheck`。

---

## 技术栈

下表版本为 `node_modules` 实测值，非 `package.json` 的声明范围。

| 类别 | 依赖 | 实测版本 |
| --- | --- | --- |
| 框架 | next | 15.5.28 |
| | react / react-dom | 19.3.1 |
| 语言 | typescript | 5.9.3（`strict: true`） |
| 样式 | tailwindcss | 3.4.19 |
| 数据库 | pg | 8.23.1 |
| | @supabase/supabase-js / @supabase/ssr | 2.45.4 / 0.5.2（**精确锁定**，解锁会解析到要求 Node ≥22 的版本） |
| 校验 | zod | 3.25.76 |
| 内容管线 | unified / remark-parse / remark-gfm / remark-math | 11.0.5 / 11.0.0 / 4.0.1 / 6.0.0 |
| | remark-rehype / rehype-stringify / rehype-raw | 11.1.2 / 10.0.1 / 7.0.0 |
| | rehype-slug / rehype-autolink-headings / rehype-katex | 6.0.0 / 7.1.0 / 7.0.1 |
| 工具 | clsx / tailwind-merge / server-only | 2.1.1 / 2.6.1 / 0.0.1 |
| | gray-matter | 4.0.3 |
| 代码高亮 | shiki / rehype-pretty-code | 1.29.2 / 0.14.5 |
| 数学 / 图表 | katex / mermaid | 0.16.0 / 11.17.2 |
| 编辑器 | codemirror + @codemirror/lang-markdown / lint / state / view | 6.0.2 等 |
| | @lezer/highlight | 1.2.5 |

`@supabase/*` 与 `pg`、`@types/pg` 刻意**精确锁版本**，不用 `^`。

---

## 目录结构

```text
app/
  (site)/              公开站点：首页 / 文章 / 时间轴 / 统计 / 关于
  admin/(auth)/        后台登录（不在守卫内）
  admin/(protected)/   后台受保护区：仪表盘 / 文章 / 时间轴 / 评论 / 活跃度 / 分析
  api/                 Route Handler：comments / likes / views
  rss.xml/             RSS 2.0 feed
  robots.ts sitemap.ts Metadata 路由
  layout.tsx           根布局：注入配色 CSS 与主题纠正脚本
  globals.css          全部样式：base 层 + 两段 components 层（含 .page-shell、.prose-playbook）
components/
  ui/                  ToyButton / ToyCard / StatBlock / ThemeToggle / Icon
  site/                站点外壳与页面级客户端岛（导航、页脚、配色实验室、触感面板、时间轴浏览器）
  content/             正文渲染壳（Mermaid 挂载）
  interactions/        点赞、评论、浏览量三块客户端岛
  timeline/ stats/     领域展示组件
config/                site.ts（站点身份与导航）、palette.ts（5 色预设，颜色唯一来源）
content/posts/         MDX 正文（无数据库时的真实来源）
lib/
  data/               端口层：ports.ts 接口 + adapters/{file,postgres}
  content/            内容管线：schema → repository → markdown 渲染 / toc
  theme/              palette-core（纯函数派生）+ palette-css（带 server-only 守卫）
  auth/               admin 会话与口令校验
  db/                 pool 与 query 封装
  interactions/       互动校验、限流、快照
  admin/ timeline/ stats/ activity/ cache/ supabase/
scripts/             数据库 setup / start / stop / migrate / import / aggregate / health
supabase/migrations/ 12 个 SQL 迁移（自建库与 Supabase 共用同一套）
public/images/       静态图片
docs/                设计与架构文档（见下）
types/               预留
```

`tsconfig.json` 的路径别名是 `@/*` → `./*`。`node_modules`、`demo`、`docs` 不参与类型检查。

---

## 路由

下表状态码为对 3000 端口实际请求的结果（未登录、跟随重定向关闭）。

| 路由 | 状态 | 说明 |
| --- | --- | --- |
| `/` | 200 | 首页：介绍、快捷入口、最近内容、统计摘要 |
| `/posts` | 200 | 文章发现页，支持 `?q=`（关键词）`?tag=` `?category=` `?sort=`（`published` / `updated` / `featured`）`?page=` |
| `/posts/[slug]` | 200 | 文章详情：正文、目录、互动、相关文章 |
| `/timeline` | 200 | 时间轴列表，年月分组与类型筛选 |
| `/timeline/[id]` | 200 | 时间轴节点详情 |
| `/stats` | 200 | 公开统计 |
| `/about` | 200 | 关于 |
| `/admin` | 307 → `/admin/login` | 未登录时由会话检查重定向 |
| `/admin/login` | 200 | 后台登录 |
| `/admin/{posts,timeline,comments,activity,analytics}` | 需登录 | 后台受保护区 |
| `/api/comments` | GET / POST | 读取已审核评论（GET）、提交评论（POST，默认进 `pending`） |
| `/api/likes` | GET / POST | 读取点赞数（GET）、点赞 / 取消（POST，乐观更新） |
| `/api/views` | POST | 记录浏览量；文件模式下静默返回而不是报错 |
| `/rss.xml` | 200 | RSS 2.0（只含摘要，不含全文） |
| `/robots.txt` | 200 | disallow `/admin`、`/api/`、`/preview/` |
| `/sitemap.xml` | 200 | 站点地图 |

公开页面全部**预渲染**：`/posts/[slug]` 与 `/timeline/[id]` 走 `generateStaticParams`，其余为纯静态。根布局刻意不调用 `cookies()` / `headers()`，否则整站会退化为 Dynamic；主题靠「静态输出默认值 + `<head>` 内联脚本纠正」。

---

## 配色与主题

全站颜色的**唯一来源**是 [`config/palette.ts`](config/palette.ts) 的 5 个值，其余 token 全由它们派生，组件里不得出现十六进制色值。

5 个槽位的语义固定：前 3 位是强调色（主 / 次 / 第三），第 4、5 位是深中性色，**最深的那位必须放第 5 位**（正文色 `--ink` 由它压暗得到，放浅了对比度会不足）。

三种改法，任选其一：

1. 改 `customColors` —— 填 5 个十六进制值，全站立刻跟随
2. 改 `DEFAULT_PALETTE_ID` 换预设（内置 `classic`、`tide`、`harbor`、`sunrise`、`meadow`、`ember` 六套）
3. 设 `NEXT_PUBLIC_PALETTE=<预设 id>`，不改代码即可切换

三者都在**构建期**解析，因此根布局仍是静态输出。派生逻辑在 `lib/theme/palette-core.ts`（纯函数，无 DOM、无 `process.env`），对比度可在 Node 里直接断言。

主题（日间 / 夜间）与配色是两件事：主题存在 cookie 里，由内联脚本在首绘前应用 `data-theme`，避免闪烁。

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | 产品需求：目标、范围、REQ 编号 |
| [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) | 技术架构：分层、数据模型、安全边界 |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | 分阶段开发路线 |
| [docs/LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md) | 本地数据库：搭建、启停、迁移、常见问题 |
| [docs/architecture/FRAMEWORK.md](docs/architecture/FRAMEWORK.md) | 已落地骨架与模块边界，写代码前必读 |
| [docs/architecture/DECISIONS.md](docs/architecture/DECISIONS.md) | **决策记录（D-01 → D-36）**，冲突时以此为准 |
| [docs/design/README.md](docs/design/README.md) | 设计文档索引 |
| [docs/design/modules/](docs/design/modules/) | 14 篇跨页面模块设计 |
| [docs/design/pages/](docs/design/pages/) | 16 篇页面设计 |
| [demo/theme-system-demo.html](demo/theme-system-demo.html) | 视觉主题 Demo（可直接用浏览器打开） |

**遇到与文档冲突时，`DECISIONS.md` 优先级最高** —— 它逐条记录了为什么这样选，以及被否决的方案。

---

## 开发约定

这些不是风格偏好，每一条都对应一次真实的故障或返工，改代码前请先读 `DECISIONS.md` 的对应条目。

**渲染与路由**

- 根布局不得调用 `cookies()` / `headers()`，否则整站退化为 Dynamic
- 公开内容页必须保持 Static / SSG；任何路由类型变化都要查明原因
- 每个 Server Action / Route Handler **独立鉴权**，不依赖 layout 守卫或 UI 隐藏
- `middleware.ts` 只检查会话 cookie 是否存在，**它不是安全边界**
- 页面只能依赖 `lib/data/ports.ts` 的接口，不得直接引用 `lib/db`、`lib/supabase`
- 客户端组件只能从 `lib/theme-shared.ts` 引入主题常量

**视觉与几何**

- 组件里不得出现十六进制色值，只能引用语义 token
- `ToyButton` 是项目唯一的按压结构，业务组件不得复制按钮状态 CSS
- 每张卡片只能有一个交互根，禁止嵌套 `a` / `button`；整卡可点用 stretched link
- 可访问性基线：键盘可操作、触控目标 ≥44px、支持 `prefers-reduced-motion`、390px 移动端可用

**数据与安全**

- 纯日期列必须用 `date` 类型，读取必须用 `to_char(col,'YYYY-MM-DD')`，绝不在 JS 里对 `Date` 调 `toISOString().slice(0,10)`（会少一天）
- 只有 `.env.example` 可以提交；`.env.local` 已被忽略
- `SUPABASE_SERVICE_ROLE_KEY`、`DATABASE_URL` 绝不可进入客户端 bundle 或日志
- 后台错误边界只显示 `error.digest`，绝不渲染 message / stack / SQL
- 评论邮箱只存哈希；后台只返回 `hasEmail` 布尔值
- 重定向只允许同源白名单后台路径（须拒 `//`、`\`、`..`）

**提交前**

```bash
npm run typecheck
```

有 dev server 在跑时**不要**直接 `npm run build` —— `next dev` 与 `next build` 共用 `.next` 目录，会互相撞坏。构建验证请在独立副本里做。

---

## 已知限制

如实记录当前状态，不是待办清单的托辞：

- **RSS 链接指向 404**：`config/site.ts` 里页脚与快捷入口的 RSS 写成 `/feed.xml`，而实际路由是 `/rss.xml`。实测 `/feed.xml` 返回 404。修正只需改这一处字符串，尚未进行。
- **无目录的文章正文宽度较大**：阅读页正文吃满容器（1180px）以保证与页头页脚对齐，超过了设计文档推荐的 680~760px 可读行宽。这是 D-36 里明确的取舍。
- **Cloudflare Turnstile 未接入**：`TURNSTILE_*` 变量仍为空，防滥用目前只靠内存限流。
- **`20261021000002_rls_policies.sql` 从未在真实 Supabase 上执行过**：当前无项目凭据，只做过静态审查。
- **Supabase 路径未实机验证**：数据层可以在 `DATABASE_URL` 指向 Supabase 直连串时工作（共用同一套 SQL），但未在真实 Supabase 项目上跑过。
- **未测 Firefox / Safari**：所有浏览器级验证均在 Chromium 内核完成。
- **六套配色中只有 `classic` 做过真实浏览器渲染验证**，其余五套只经 Node 侧派生层断言。
- **无 CI 配置**：`typecheck` 与构建验证目前是手动执行。

---

## 状态

`master` 分支，37 个提交。技术栈与实现以仓库当前代码为准；路线图文档中的 Phase 划分是规划，不代表全部已交付 —— 实际完成范围请对照 `docs/architecture/DECISIONS.md` 的编号顺序，那里每个决策都对应一次真实的实现与验证。
