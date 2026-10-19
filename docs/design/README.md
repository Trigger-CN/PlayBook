# 页面与功能模块设计文档

## 1. 文档目的

本目录把产品需求拆解为可实施的页面设计和跨页面功能设计。每份文档同时覆盖：

- 页面布局或模块边界。
- 用户功能、状态与交互。
- 数据来源、接口和权限。
- Next.js、Supabase、MDX 等实现技术要点。
- 响应式、可访问性、性能和验收标准。

上位约束仍以根目录文档为准：

- [产品需求](../../PRODUCT_REQUIREMENTS.md)
- [技术架构](../../TECHNICAL_ARCHITECTURE.md)
- [开发路线](../../DEVELOPMENT_ROADMAP.md)
- [视觉主题 Demo](../../demo/theme-system-demo.html)
- [基线决策记录](../architecture/DECISIONS.md)（冲突已定案，实现以此为准）
- [底层框架说明](../architecture/FRAMEWORK.md)

## 2. 通用设计约定

- 访客页面使用 Next.js App Router，优先 Server Component；点赞、评论、主题切换等交互隔离为 Client Component。
- 文章正文 MVP 使用 `content/posts/*.mdx`，时间轴和互动数据使用 Supabase。
- 视觉遵循扁平卡通矢量主题；按钮使用明亮按钮面与深色实体底座，详见技术架构 12.3。
- 页面必须支持日间 / 晚间主题、390px 移动端、键盘操作和 `prefers-reduced-motion`。
- 所有动态页面都要定义 loading、empty、error、permission denied 和 stale data 状态。
- MVP 以静态生成、ISR 和聚合数据为主，避免首页或公开页面扫描原始事件表。

## 3. 页面设计文档

| 文档 | 路由 | 阶段 | 核心职责 |
| --- | --- | --- | --- |
| [首页](pages/01-home.md) | `/` | MVP | 个人介绍、内容聚合、快捷入口、统计摘要 |
| [文章发现页](pages/02-post-discovery.md) | `/posts`、`/tags/*`、`/categories/*` | MVP / 增强 | 文章列表、标签分类、筛选搜索 |
| [文章详情页](pages/03-post-detail.md) | `/posts/[slug]` | MVP | MDX 阅读、目录、互动、SEO |
| [时间轴列表页](pages/04-timeline-list.md) | `/timeline` | MVP | 年月分组、类型筛选、节点浏览 |
| [时间轴详情页](pages/05-timeline-detail.md) | `/timeline/[id]` | MVP | 节点详情、媒体、点赞评论 |
| [关于页面](pages/06-about.md) | `/about` | MVP | 个人介绍、经历、项目与联系方式 |
| [公开统计页](pages/07-stats.md) | `/stats` | 增强 | 站点活跃度、趋势、热门内容 |
| [后台登录与框架](pages/08-admin-auth-shell.md) | `/admin/*` | Phase 8 | 权限守卫、后台外壳、导航、统一 loading/error |
| [后台仪表盘](pages/09-admin-dashboard.md) | `/admin` | Phase 8 | 待办、摘要、最近活动 |
| [后台文章管理](pages/10-admin-posts.md) | `/admin/posts/*` | Phase 8+ | 文章列表、搜索筛选、预览入口 |
| [文章书写页](pages/15-post-editor.md) | `/admin/posts/new`、`/admin/posts/[id]/edit` | 后续 | 正文编辑、元数据、预览、校验、发布 |
| [登录页](pages/16-admin-login.md) | `/admin/login` | Phase 8 | 认证入口、重定向安全、会话 |
| [后台时间轴管理](pages/11-admin-timeline.md) | `/admin/timeline` | Phase 8 | 节点增删改查、媒体和排序 |
| [后台评论审核](pages/12-admin-comments.md) | `/admin/comments` | Phase 8 | 审核、拒绝、删除、追溯 |
| [后台分析页](pages/13-admin-analytics.md) | `/admin/analytics` | Phase 8 | 趋势、内容排行、异常流量 |
| [后台设置页](pages/14-admin-settings.md) | `/admin/settings` | 后续 | 站点信息、链接、主题与导出 |

## 4. 功能模块设计文档

| 文档 | 阶段 | 核心职责 |
| --- | --- | --- |
| [视觉主题系统](modules/01-visual-theme.md) | MVP | Token、主题、立体按钮、卡片与动效 |
| [站点外壳与导航](modules/02-site-shell-navigation.md) | MVP | Header、Footer、导航、快捷入口 |
| [MDX 内容管线](modules/03-content-pipeline.md) | MVP | Frontmatter、构建、渲染、目录和代码高亮 |
| [内容发现与分类](modules/04-discovery-search-taxonomy.md) | MVP / 增强 | 标签、分类、查询参数和搜索 |
| [时间轴领域模块](modules/05-timeline-domain.md) | MVP | 节点模型、分组、类型与发布流程 |
| [评论模块](modules/06-comments.md) | MVP | 匿名提交、审核、展示和防垃圾 |
| [点赞模块](modules/07-likes.md) | MVP | 统一目标、乐观更新和防重复 |
| [浏览量模块](modules/08-page-views.md) | MVP | 异步记录、时间窗去重和隐私 |
| [统计与活跃度](modules/09-stats-activity.md) | MVP / 增强 | 原始事件、每日聚合和展示指标 |
| [媒体资源模块](modules/10-media-assets.md) | MVP / 增强 | 封面、正文图片、上传和对象存储 |
| [SEO、分享与 RSS](modules/11-seo-sharing-rss.md) | MVP / 增强 | Metadata、OG、结构化数据、站点地图 |
| [认证、安全与防刷](modules/12-auth-security-abuse.md) | MVP / Phase 8 | 管理认证、RLS、限流、Turnstile |
| [数据获取、缓存与通用状态](modules/13-data-fetching-cache-states.md) | MVP | 渲染策略、缓存、失效和错误状态 |
| [后台内容创作与发布](modules/14-admin-authoring.md) | 后续 / Phase 8 | 草稿、版本、自动保存、发布事务与审计 |

## 5. 需求到文档的主要映射

- `REQ-HOME-*`：首页、站点外壳、视觉主题、统计与活跃度。
- `REQ-CONT-*`、`REQ-ART-*`：文章发现页、文章详情页、MDX 内容管线、媒体资源。
- `REQ-TL-*`：时间轴列表、时间轴详情、时间轴领域模块。
- `REQ-INT-*`：评论模块、点赞模块、文章和时间轴详情页。
- `REQ-STAT-*`：浏览量模块、统计与活跃度、公开统计页、后台分析页。
- `REQ-ADMIN-*`：全部后台页面、认证安全模块。
- `REQ-SEO-*`：文章详情、文章发现、SEO / 分享 / RSS。
- `REQ-NFR-*`、`REQ-SEC-*`：所有文档的可访问性、性能、安全和验收章节。

## 6. 文档维护规则

- 路由、数据模型或产品行为变化时，同步更新对应页面文档和模块文档。
- 页面文档只描述页面编排和页面级状态；可复用业务规则放在模块文档中。
- 模块文档不得假设特定页面布局，但必须列出所有消费页面。
- 尚未进入当前阶段的能力应标记为“后续”，不能混入 MVP 验收。
- 实现与文档冲突时，先确认产品决策，再同步修改需求、架构和本目录文档。
