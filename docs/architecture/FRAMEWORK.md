# 底层框架说明

描述当前已落地的工程骨架与模块边界，供后续开发直接遵循。基线决策见 [DECISIONS.md](DECISIONS.md)。

技术栈：Next.js 15 App Router · React 19 · TypeScript 5.9（strict）· Tailwind CSS 3.4 · MDX · Supabase（Phase 5 起启用）。

---

## 1. 分层结构

```text
app/                路由与页面编排（Server Component 优先）
components/ui/      基础视觉组件（ToyButton / ThemeToggle）
components/site/    站点外壳（Header / Footer / Nav）
config/             站点身份、导航与快捷入口配置
lib/content/        内容管线（schema → repository → toc / mdx）
lib/interactions/   互动领域契约与校验器
lib/cache/          缓存 tag 与失效矩阵
lib/activity/       活动事件枚举
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
| `/timeline` | Static | Phase 4 接入数据后改为 ISR |
| `/stats` | Static | Phase 7 接入聚合后改为 ISR |
| `/robots.txt`、`/sitemap.xml` | Static | 由路由生成 |

First Load JS 共享 103 kB。根布局必须保持不读 `cookies()`，否则整站退化为 Dynamic。

---

## 7. 后续阶段的接入点

| 阶段 | 接入位置 | 说明 |
| --- | --- | --- |
| Phase 4 | `app/(site)/timeline/page.tsx` | 先用本地种子数据，再接 Supabase |
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
