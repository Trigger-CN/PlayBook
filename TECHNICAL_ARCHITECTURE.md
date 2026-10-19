# 个人网站技术架构方案

> 页面与功能模块的详细布局、功能和实现设计见 [设计文档索引](docs/design/README.md)。
>
> **实现以 [基线决策记录](docs/architecture/DECISIONS.md) 为准。** 本文与设计文档存在冲突时（主题 token 命名、按钮尺寸、活动事件枚举、表结构字段、互动目标键、统计字段语义），按该决策记录执行；当前已落地代码见 [底层框架说明](docs/architecture/FRAMEWORK.md)。

## 1. 项目目标

本项目目标是构建一个兼具内容创作、个人展示、互动反馈和活动记录能力的个人网站。网站需要具备精美视觉表现、丰富矢量动画、文章发布、Markdown 内容渲染、图片展示、文章点赞评论、浏览量统计、全站活跃度记录、时间轴记录、时间轴节点互动，以及首页聚合展示能力。

网站不是传统静态博客，而是一个以个人内容为核心的轻量级内容社区型产品。技术方案需要同时满足以下要求：

- 页面视觉精美，支持复杂但可控的动画效果。
- 支持 Markdown / MDX 文章写作。
- 文章支持图片、封面图、摘要、标签、分类、目录和代码高亮。
- 访客可以对文章点赞、评论。
- 文章和页面可以记录浏览量。
- 支持时间轴功能，用于记录事件、想法、里程碑。
- 时间轴节点也支持点赞和评论。
- 首页展示最近文章和最近时间轴节点。
- 首页文章卡片支持图片缩略图。
- 网站记录整体活跃程度，包括访问量、文章更新、时间轴更新、点赞、评论等。
- 后续可以扩展管理后台、图片上传、评论审核、统计面板、搜索和 RSS。

## 2. 总体技术选型

### 2.1 推荐主技术栈

| 层级 | 技术选型 | 说明 |
| --- | --- | --- |
| 前端框架 | Next.js App Router | 同时适合内容站和动态应用，支持 SSR、SSG、ISR、API Route、Server Action |
| 编程语言 | TypeScript | 提升类型安全和长期可维护性 |
| UI 样式 | Tailwind CSS | 快速构建响应式界面，适合高度定制视觉风格 |
| UI 组件 | shadcn/ui + 自定义组件 | 基础组件复用，同时保留自定义设计空间 |
| 动画 | Motion / Framer Motion | 页面切换、滚动入场、卡片交互、局部动效 |
| 矢量动画 | Rive / Lottie / SVG Animation | 用于首页 Hero、装饰插画、时间轴视觉效果 |
| 内容格式 | Markdown / MDX | 支持文章写作、图片、代码块、自定义组件 |
| Markdown 处理 | remark / rehype / next-mdx-remote | 支持 Markdown 渲染、代码高亮、目录生成、图片处理 |
| 后端服务 | Supabase | 提供 PostgreSQL、Auth、Storage、Realtime、RLS |
| 数据库 | PostgreSQL | 存储文章元数据、互动数据、时间轴、统计和活动事件 |
| 文件存储 | Supabase Storage | 存储文章图片、封面图、时间轴图片和附件 |
| 部署 | Vercel | 与 Next.js 集成成熟，支持边缘网络和自动部署 |
| 域名与 CDN | Cloudflare | DNS、缓存、安全规则、基础防护 |

### 2.2 推荐架构结论

推荐采用：

```text
Next.js + TypeScript + Tailwind CSS + shadcn/ui
MDX / Markdown
Supabase PostgreSQL + Supabase Auth + Supabase Storage
Motion / Framer Motion + Rive / Lottie / SVG
Vercel + Cloudflare
```

第一阶段建议采用混合内容模式：

```text
文章正文：Markdown / MDX 文件
动态数据：Supabase
图片资源：本地 public 或 Supabase Storage
```

后续如果需要在线写作后台，再将文章正文迁移到 Supabase 或接入 Headless CMS。

## 3. 为什么选择 Next.js

Next.js 适合本项目的主要原因是它同时具备内容站和动态应用的能力。

本项目不是纯静态博客，因为点赞、评论、浏览量、活跃统计、时间轴互动都需要服务端逻辑和数据库。Next.js App Router 可以将静态内容、服务端渲染、动态接口和交互组件放在同一个工程中，整体复杂度较低。

核心优势：

- 支持静态生成文章页面，提升访问速度和 SEO 表现。
- 支持服务端组件，减少客户端 JavaScript 体积。
- 支持动态路由，适合文章详情、标签页、时间轴详情。
- 支持 Route Handlers，可实现点赞、评论、浏览量接口。
- 支持 Server Actions，可处理简单的表单提交和数据变更。
- 内置 Image Optimization，适合文章封面图和首页缩略图。
- 与 Vercel 部署体验好，适合个人项目快速上线。

## 4. 为什么选择 Supabase

Supabase 是基于 PostgreSQL 的后端平台，适合本项目中需要持久化和权限控制的动态能力。

Supabase 负责：

- 数据库存储。
- 用户登录认证。
- 评论、点赞、浏览量记录。
- 文章元数据和时间轴数据。
- 图片和附件存储。
- Row Level Security 权限控制。
- 后续实时通知或后台统计。

选择 Supabase 的原因：

- PostgreSQL 数据模型清晰，适合统计和关系查询。
- 免费额度适合个人网站起步。
- Auth、Storage、Database 集成度高。
- 可以使用 SQL、函数、触发器实现统计聚合。
- 未来可迁移性比闭源 BaaS 更好。

## 5. 系统模块设计

### 5.1 首页模块

首页是个人网站的核心入口，需要兼顾视觉表现和内容聚合。

主要功能：

- Hero 区域展示个人介绍、签名、社交链接和主视觉动画。
- 展示最近文章列表。
- 展示最近时间轴节点。
- 展示文章封面缩略图。
- 展示全站统计摘要。
- 展示最近活跃记录。
- 提供日间 / 晚间主题切换开关。
- 提供快捷跳转栏，以立体按钮阵列展示常用入口。
- 支持响应式布局。

推荐展示内容：

- 最近 3 到 6 篇文章。
- 最近 5 到 10 个时间轴节点。
- 总文章数、总浏览量、总评论数、总点赞数。
- 最近一次更新日期。
- 当前主题切换入口，桌面端建议位于顶部导航或 Hero 区域附近，移动端建议位于顶部操作区。
- 快捷跳转按钮阵列，例如文章、时间轴、关于我、项目、GitHub、RSS 等入口。

快捷跳转栏建议：

- 每个快捷入口都是一个立体卡通按钮，复用 `ToyButton` 的上盖、底座和按压效果。
- 按钮阵列可以横向排列、自动换行或在移动端横向滚动。
- MVP 阶段快捷链接通过配置文件维护，后续可迁移到管理后台。
- 支持站内链接和站外链接，站外链接应明确新窗口打开策略。

快捷链接配置示例：

```ts
export const quickLinks = [
  {
    title: "文章",
    href: "/posts",
    icon: "book",
    description: "阅读最近文章",
    order: 10,
    external: false,
    enabled: true,
  },
  {
    title: "GitHub",
    href: "https://github.com/username",
    icon: "github",
    description: "查看代码和项目",
    order: 40,
    external: true,
    enabled: true,
  },
];
```

### 5.2 文章模块

文章模块负责内容创作和阅读体验。

主要功能：

- Markdown / MDX 渲染。
- 文章列表页。
- 文章详情页。
- 标签和分类。
- 文章封面图。
- 首页缩略图。
- 摘要和阅读时间。
- 代码高亮。
- 自动目录。
- 图片展示。
- 文章浏览量。
- 文章点赞。
- 文章评论。
- SEO metadata。
- Open Graph 分享图。

文章数据建议拆分为两部分：

```text
文章正文：content/posts/*.mdx
文章互动数据：Supabase
```

文章 Frontmatter 示例：

```yaml
---
title: "我的第一篇文章"
slug: "my-first-post"
summary: "这是一篇关于个人网站建设的记录。"
cover: "/images/posts/my-first-post/cover.png"
coverAlt: "文章封面"
publishedAt: "2026-07-17"
updatedAt: "2026-07-17"
tags:
  - Web
  - Life
category: "Build"
draft: false
featured: true
---
```

### 5.3 时间轴模块

时间轴用于记录个人事件、想法、里程碑和碎片化动态。

主要功能：

- 时间轴列表。
- 按年份和月份分组。
- 时间轴节点详情。
- 节点支持文字、图片、链接。
- 节点支持点赞。
- 节点支持评论。
- 首页展示最近节点。
- 支持不同节点类型，例如想法、里程碑、项目、旅行、读书、发布。

时间轴节点示例：

```text
2026-07-17
完成个人网站技术方案设计。
类型：Milestone
图片：可选
互动：点赞、评论
```

### 5.4 互动模块

互动模块包括点赞和评论。

主要功能：

- 文章点赞。
- 时间轴节点点赞。
- 文章评论。
- 时间轴节点评论。
- 评论审核。
- 评论删除。
- 评论回复。
- 匿名评论或登录评论。
- 防刷限制。

点赞目标采用统一模型：

```text
target_type: post | timeline_item
target_id: uuid 或 slug 映射 ID
```

评论目标同样采用统一模型：

```text
target_type: post | timeline_item
target_id: uuid 或 slug 映射 ID
```

这样可以避免为文章和时间轴分别实现两套点赞评论系统。

### 5.5 浏览量模块

浏览量模块用于记录文章、时间轴和页面访问情况。

主要功能：

- 文章浏览量。
- 时间轴节点浏览量。
- 页面浏览量。
- 全站总浏览量。
- 每日访问量统计。
- 访问趋势统计。

浏览量设计需要考虑防刷和隐私。

建议策略：

- 记录 IP hash，不存明文 IP。
- 记录 User-Agent hash 或简化后的设备信息。
- 同一访客对同一目标在短时间内只计一次有效浏览。
- 原始浏览事件保留一段时间，聚合数据长期保存。

### 5.6 活跃度模块

活跃度模块用于记录网站整体变化和用户互动。

主要功能：

- 记录文章发布。
- 记录文章修改。
- 记录时间轴发布。
- 记录评论产生。
- 记录点赞产生。
- 记录浏览量变化。
- 首页或后台展示最近活跃。
- 后台展示活跃趋势图。

活跃事件示例：

```text
post_created
post_updated
timeline_created
comment_created
like_created
view_recorded
```

### 5.7 管理后台模块

管理后台不是第一阶段必须，但应在架构中预留。

主要功能：

- 管理员登录。
- 创建和编辑文章。
- 上传图片。
- 管理时间轴节点。
- 管理评论。
- 查看全站统计。
- 查看活动日志。
- 设置站点基本信息。

后台路由建议：

```text
/admin
/admin/posts
/admin/posts/new
/admin/posts/[id]
/admin/timeline
/admin/comments
/admin/analytics
/admin/settings
```

第一阶段可以不实现完整后台，只保留目录和权限设计。

## 6. 页面路由设计

推荐路由结构如下：

```text
/
/posts
/posts/[slug]
/tags
/tags/[tag]
/categories
/categories/[category]
/timeline
/timeline/[id]
/about
/stats
/admin
/admin/posts
/admin/timeline
/admin/comments
/admin/analytics
```

API 路由建议：

```text
/api/views
/api/likes
/api/comments
/api/timeline
/api/upload
/api/activity
```

如果使用 Server Actions，部分 API 可以改为服务端 action，但对于点赞、评论、浏览量这类可复用接口，保留 Route Handler 更清晰。

## 7. 推荐项目目录结构

```text
myweb/
  app/
    (site)/
      page.tsx
      posts/
        page.tsx
        [slug]/
          page.tsx
      timeline/
        page.tsx
        [id]/
          page.tsx
      about/
        page.tsx
      stats/
        page.tsx
    admin/
      page.tsx
      posts/
        page.tsx
      timeline/
        page.tsx
      comments/
        page.tsx
      analytics/
        page.tsx
    api/
      views/
        route.ts
      likes/
        route.ts
      comments/
        route.ts
      activity/
        route.ts
    layout.tsx
    globals.css
  components/
    site/
      quick-link-bar.tsx
    posts/
    timeline/
    comments/
    analytics/
    motion/
    ui/
  content/
    posts/
  config/
    quick-links.ts
  lib/
    db/
    supabase/
    markdown/
    analytics/
    validators/
    utils.ts
  public/
    images/
    animations/
  styles/
  types/
  supabase/
    migrations/
    seed.sql
  tests/
```

## 8. 数据库设计

### 8.1 posts

用于存储文章元数据。如果第一阶段文章正文放在 MDX 文件中，数据库只存储可统计和可查询的文章元信息。

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  cover_url text,
  status text not null default 'published',
  published_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 8.2 timeline_items

```sql
create table timeline_items (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text not null,
  type text not null default 'note',
  image_url text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

### 8.3 comments

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  parent_id uuid references comments(id) on delete cascade,
  author_name text not null,
  author_email_hash text,
  author_avatar_url text,
  content text not null,
  status text not null default 'pending',
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

### 8.4 likes

```sql
create table likes (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  visitor_id text,
  user_id uuid,
  ip_hash text,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, visitor_id)
);
```

### 8.5 page_views

```sql
create table page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  target_type text,
  target_id text,
  visitor_id text,
  ip_hash text,
  user_agent_hash text,
  referrer text,
  created_at timestamptz not null default now()
);
```

### 8.6 activity_events

```sql
create table activity_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  target_type text,
  target_id text,
  title text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

### 8.7 site_daily_stats

用于存储聚合后的每日统计，避免每次页面加载都扫描原始事件表。

```sql
create table site_daily_stats (
  date date primary key,
  views_count integer not null default 0,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  posts_count integer not null default 0,
  timeline_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

## 9. 权限与安全设计

### 9.1 角色设计

建议角色：

- 匿名访客：浏览、点赞、提交评论。
- 登录访客：浏览、点赞、评论，可选。
- 管理员：发布文章、更新时间轴、审核评论、查看统计。

### 9.2 Supabase RLS 策略

建议启用 Row Level Security。

基础策略：

- 公开内容允许所有人读取。
- 评论默认允许插入，但状态为 `pending`。
- 只有管理员可以审核、删除评论。
- 只有管理员可以创建、更新、删除文章和时间轴节点。
- 点赞允许匿名插入，但需要唯一约束和频率限制。
- 浏览量通过服务端接口写入，不直接暴露数据库写权限。

### 9.3 防刷策略

需要防护的接口：

- 点赞接口。
- 评论接口。
- 浏览量接口。
- 图片上传接口。

建议策略：

- 使用 Cloudflare 基础防护和 Turnstile。
- 评论接口加入 Turnstile 或简单验证码。
- 同一 visitor_id 对同一目标只能点赞一次。
- 浏览量按 visitor_id、target_id、时间窗口去重。
- 后台操作必须验证管理员权限。
- 评论内容做长度限制和敏感字符处理。

## 10. 内容管理方案

### 10.1 第一阶段：文件型文章

文章放在：

```text
content/posts/*.mdx
```

优点：

- 易于开始。
- 内容可版本管理。
- 适合本地写作。
- 部署简单。
- SEO 和构建速度好。

缺点：

- 手机端或浏览器中随手写文章不方便。
- 每次发布文章需要重新部署。

### 10.2 第二阶段：数据库文章

文章正文存储在 Supabase。

优点：

- 可以在线编辑。
- 可以直接上传图片。
- 可以做草稿、预览、发布流。
- 可以随手记录，不依赖 Git。

缺点：

- 需要后台编辑器。
- Markdown 渲染和安全处理更复杂。
- 需要考虑备份和迁移。

### 10.3 推荐路线

建议采用渐进路线：

```text
阶段 1：文章 MDX 文件 + 时间轴数据库 + 互动数据库
阶段 2：增加后台管理时间轴、评论和统计
阶段 3：增加文章在线编辑，迁移文章到数据库或保持混合模式
```

## 11. 图片与资源处理

### 11.1 文章图片

文章图片可以有两种存储方式：

```text
public/images/posts/[slug]/...
Supabase Storage: posts/[slug]/...
```

第一阶段建议使用 `public/images/posts`，便于跟随文章一起版本管理。

后续如果做后台上传，则使用 Supabase Storage。

### 11.2 首页缩略图

首页缩略图来源：

- 优先使用文章 Frontmatter 中的 `cover`。
- 如果没有封面图，可解析文章第一张图片作为缩略图。
- 如果仍然没有图片，则使用默认渐变封面或动态图形占位。

### 11.3 图片优化

使用 Next.js `Image` 组件处理：

- 响应式尺寸。
- 懒加载。
- 格式优化。
- blur placeholder。
- 首页卡片缩略图裁剪。

## 12. 动画与视觉方案

### 12.1 动画分层

动画不建议全部依赖一种技术，应按场景分层。

| 场景 | 技术 |
| --- | --- |
| 页面进入和切换 | Motion / Framer Motion |
| 卡片 hover 和列表动效 | Motion / CSS Transition |
| 首页主视觉矢量动画 | Rive / Lottie |
| 小型装饰元素 | SVG + CSS Animation |
| 时间轴滚动出现 | Motion Intersection Observer |
| 数据图表 | Recharts / Tremor / 自定义 SVG |

### 12.2 视觉方向建议

网站整体视觉方向明确采用“扁平卡通矢量风”。整体观感应该像一个可交互的数字玩具盒，而不是传统技术博客、极简作品集或 SaaS 模板。

核心关键词：

- 扁平卡通。
- 矢量绘制。
- 明亮高饱和配色。
- 大圆角几何块面。
- 厚重底座阴影。
- 明确的按压反馈。
- 轻松、有趣、亲和。

设计特征：

- 使用大面积柔和背景色，搭配浅色网格、圆点、波浪、贴纸、星星、气泡等矢量装饰。
- 卡片、按钮、标签、统计块都采用几何化块面，不使用拟真材质和玻璃拟态。
- 视觉深度主要通过“实体底座 + 位移 + 明暗色块”体现，而不是模糊阴影。
- 图标优先使用线性或填充式卡通图标，避免细碎写实图标。
- 页面元素可以有轻微错位、叠放和漂浮感，营造手工拼贴式的活泼氛围。
- 文章阅读区域保持排版舒适，但标题、引用、提示块、代码块仍应延续卡通卡片风格。

推荐色彩方向：

```text
主色：珊瑚红 / 西瓜红
辅助色：泡泡粉 / 奶油黄 / 天空蓝 / 薄荷绿
深色底座：酒红 / 深莓紫 / 深棕紫
文字色：接近黑色的暖黑
背景色：米白 / 奶油白 / 极浅粉
```

建议使用 CSS 变量固化视觉语言：

```css
:root {
  --color-bg: #fff8ef;
  --color-grid: rgba(80, 48, 32, 0.08);
  --color-text: #15100d;
  --color-primary: #ff6268;
  --color-primary-top: #ff6268;
  --color-primary-base: #760030;
  --color-secondary: #f58ac0;
  --color-secondary-base: #a0009b;
  --color-cream: #ffe7c7;
  --color-mint: #8de6c2;
  --color-sky: #8fd3ff;
  --radius-card: 28px;
  --radius-button: 18px;
  --button-depth: 18px;
}

[data-theme="night"] {
  --color-bg: #21162f;
  --color-grid: rgba(255, 231, 199, 0.12);
  --color-text: #fff8ef;
  --color-primary: #ff6b7a;
  --color-primary-top: #ff6b7a;
  --color-primary-base: #4b0829;
  --color-secondary: #9b7bff;
  --color-secondary-base: #2f1a6b;
  --color-cream: #ffe0a8;
  --color-mint: #78e0c1;
  --color-sky: #79c9ff;
}
```

日间主题和晚间主题必须共享同一套扁平卡通矢量语言。晚间主题不是普通暗黑模式，而是“夜晚玩具盒”风格：背景更深，贴纸和按钮色块仍保持高饱和、圆润和立体按压感。

主题切换建议：

- 首页提供日间 / 晚间主题开关。
- 开关组件使用卡通滑块或太阳/月亮矢量图形，不使用浏览器默认 checkbox 外观。
- 首次访问可跟随系统 `prefers-color-scheme`。
- 用户手动切换后通过 localStorage 或 cookie 持久化。
- 主题切换应即时生效，不需要刷新页面。
- 主题切换必须覆盖背景、按钮、卡片、统计块、时间轴节点、文章正文和评论区。

### 12.3 立体按钮与可交互组件

立体按钮是本项目的核心基础组件。首页 CTA、快捷入口、点赞、评论、发送、筛选和后台关键操作必须复用同一套结构与状态，不应分别用阴影模拟。当前推荐实现已经在 `theme-system-demo.html` 中完成桌面端、移动端和日间 / 晚间主题验证。

#### 12.3.1 视觉原理

按钮只使用两个清晰层级：

```text
外层交互元素（button / a）：深色实体底座，同时负责语义、点击区域和焦点环
内层按钮面（span）：明亮色块，承载图标与文本，并通过垂直位移表现抬起和按下
```

外层不需要额外的绝对定位底座元素。直接让 `button` 或 `a` 的背景色充当底座，可以减少层叠、点击穿透和尺寸同步问题。内层按钮面必须与底座同宽；外层的水平 padding 必须为 `0`，水平留白只放在内层按钮面上。

推荐 DOM：

```html
<button class="toy-button" type="button">
  <span class="toy-button__top">
    <span aria-hidden="true">♥</span>
    <span>点赞 128</span>
  </span>
</button>
```

链接型 CTA 使用相同内层结构，只将外层换成语义正确的 `<a>`：

```html
<a class="toy-button" href="/posts">
  <span class="toy-button__top">开始阅读 <span aria-hidden="true">→</span></span>
</a>
```

不得为了统一样式把链接写成无导航语义的 `div`，也不得在 `<button>` 内嵌套 `<a>`。

#### 12.3.2 Token 与颜色配对

每种按钮颜色必须同时定义按钮面和底座，不能通过运行时自动变暗主色生成底座。人工指定的色对能在日间和晚间主题中保持对比度与品牌感。

```css
:root {
  --button-cap: var(--color-coral);
  --button-base: var(--color-coral-base);
  --button-height: 52px;
  --button-depth: 8px;
  --button-pressed-reveal: 2px;
  --button-hover-lift: 3px;
  --button-radius: 16px;
  --button-duration: 110ms;
}
```

推荐色对：

| 角色 | 按钮面 | 底座 | 典型用途 |
| --- | --- | --- | --- |
| Coral | 珊瑚红 | 深酒红 | 主 CTA、点赞、危险操作确认 |
| Pink | 泡泡粉 | 深莓紫 | 评论、发送、互动操作 |
| Mint | 薄荷绿 | 深森林绿 | 保存、成功、次要操作 |
| Sky | 天空蓝 | 深蓝 | 评论入口、信息操作、焦点辅助 |
| Cream | 奶油色 | 金棕色 | 中性、禁用示例、低优先级操作 |
| Lilac | 淡紫色 | 深紫 | 趣味入口、特殊功能 |

日间 / 晚间主题只替换色值，不改变 DOM、按钮厚度和状态位移。底座在两套主题下都必须能与按钮面及页面背景区分。

#### 12.3.3 推荐 CSS 实现

```css
.toy-button {
  --cap: var(--button-cap);
  --base: var(--button-base);
  --height: 52px;
  --depth: 8px;
  --radius: 16px;

  box-sizing: border-box;
  display: inline-grid;
  min-height: var(--height);
  padding: 0 0 var(--depth);
  border: 0;
  border-radius: var(--radius);
  color: inherit;
  background: var(--base);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  text-decoration: none;
}

.toy-button__top {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: var(--height);
  padding: 0 20px;
  border-radius: inherit;
  color: inherit;
  background: var(--cap);
  transform: translateY(calc(-1 * var(--depth)));
  transition: transform var(--button-duration), filter 150ms;
}

.toy-button:hover .toy-button__top {
  transform: translateY(calc(-1 * (var(--depth) + var(--button-hover-lift))));
  filter: brightness(1.035) saturate(1.05);
}

.toy-button:active .toy-button__top {
  transform: translateY(calc(-1 * var(--button-pressed-reveal)));
}

.toy-button:focus-visible {
  outline: 4px solid var(--color-focus);
  outline-offset: 4px;
}

.toy-button:disabled,
.toy-button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.48;
}

.toy-button:disabled .toy-button__top,
.toy-button[aria-disabled="true"] .toy-button__top {
  transform: translateY(-4px);
  filter: none;
}
```

实现时必须遵守以下几条不变量：

- 外层水平 padding 为 `0`，否则深色底座会比按钮面更宽。
- 外层和内层使用相同圆角，按钮面按下后边缘才能保持对齐。
- 底座厚度来自外层底部 padding 与按钮面负向位移，不使用模糊阴影代替。
- hover 只把按钮面向上移动并轻微提亮；不能移动整个按钮，否则周围布局会抖动。
- active 将按钮面移到底座附近，但保留 1px 到 2px 深色边缘，确保按下状态仍有边界。
- transition 只作用于 `transform` 和轻量 `filter`，不要动画 width、height、padding 或 box-shadow。

#### 12.3.4 尺寸变体

| 类型 | 按钮面高度 | 默认底座厚度 | 圆角 | 水平内边距 | 用途 |
| --- | --- | --- | --- | --- | --- |
| 小按钮 | 42px - 48px | 7px - 8px | 12px - 14px | 14px - 16px | 点赞、评论、发送、筛选 |
| 默认按钮 | 52px - 60px | 8px - 10px | 16px - 18px | 20px - 24px | 常规 CTA |
| 大按钮 | 64px - 80px | 10px - 14px | 20px - 26px | 24px - 32px | 首页主入口、重要操作 |

小按钮也必须保留完整立体结构，不能因为尺寸较小而退化成普通扁平胶囊。移动端可让按钮组自动换行，但不得压缩到文字溢出。独立图标按钮的可点击区域至少为 `44px × 44px`；文字按钮也应满足等效触控高度。

尺寸变体只覆盖 token，不复制状态规则：

```css
.toy-button--small {
  --height: 42px;
  --depth: 7px;
  --radius: 13px;
  font-size: 13px;
}

.toy-button--small .toy-button__top {
  padding-inline: 14px;
}
```

#### 12.3.5 状态与交互要求

- **默认**：按钮面上抬完整 `--depth`，底座在下方清晰露出。
- **悬停**：按钮面额外上抬 2px 到 3px，并轻微提亮；不得出现大幅缩放。
- **按下**：按钮面快速下移，只露出 1px 到 2px 底座，形成明确物理反馈。
- **切换选中**：筛选、喜欢等可保持状态使用 `aria-pressed="true"`，只切换色对、图标或文案，不永久停留在物理按下位置。
- **禁用**：保留底座结构、降低整体不透明度、禁止 hover / active 位移。原生按钮使用 `disabled`；链接使用 `aria-disabled="true"` 时还必须移除导航能力或在事件层阻止激活，并正确处理 tab 顺序。
- **加载**：按钮宽度应保持稳定；替换内容时保留原文宽度或设置最小宽度，同时使用 `aria-busy="true"`。
- **键盘焦点**：使用 `:focus-visible` 粗描边与 offset，不能只依赖颜色变化。
- **减动效**：在 `prefers-reduced-motion: reduce` 下取消 transition；状态仍通过静态位移和颜色表达。

```css
@media (prefers-reduced-motion: reduce) {
  .toy-button__top {
    transition: none;
  }
}
```

#### 12.3.6 React 组件边界

建议将立体结构封装在 `components/ui/toy-button.tsx` 中，通过属性控制语义、尺寸和色对，业务组件不得重复手写底座与状态 CSS。推荐 API：

```ts
type ToyButtonProps = {
  variant?: "coral" | "pink" | "mint" | "sky" | "cream" | "lilac";
  size?: "small" | "default" | "large";
  pressed?: boolean;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
};
```

按钮和链接可以共享视觉 class，但必须保留各自语义。若组件支持 `asChild` 或链接适配，应保证最终 DOM 只有一个可交互根元素。

#### 12.3.7 适用范围与验收

该结构必须统一用于：

- 首页“开始阅读”等主 CTA。
- 点赞、评论入口和发送评论按钮。
- 标签与内容筛选按钮。
- 快捷跳转按钮阵列。
- 保存、发布、删除确认等后台关键操作。
- 需要按压反馈的文本卡片；卡片可复用相同的底座与位移原则，但应使用链接或按钮语义。

验收时至少检查：

- 按钮面与底座左右边缘完全对齐。
- 默认、hover、active、disabled、focus-visible 状态都可辨识。
- 鼠标按下和键盘激活都能触发功能。
- 日间和晚间主题中每个按钮面 / 底座色对都有足够区分。
- 390px 宽度下小按钮可换行且文字不溢出。
- reduced-motion 下无过渡动画，但状态仍清晰。

### 12.4 卡片、统计块与时间轴视觉

卡片和统计模块应与按钮属于同一套矢量语言。

卡片规则：

- 使用大圆角。
- 使用纯色或轻微渐变色块。
- 底部可以有 8px 到 18px 的深色实体阴影。
- 外侧可以叠加浅色承托底板。
- 卡片 hover 时轻微上浮，底座变厚。
- 卡片 active 或点击时向下压。

统计块规则：

- 数字可以放在奶油黄或浅粉色凹槽中。
- 外层使用粉色或珊瑚色大容器。
- 数字字体要大、圆润、醒目。
- 浏览量、点赞数、评论数可以用小型贴纸图标辅助表达。

时间轴规则：

- 时间轴主线不要使用普通细线，建议使用粗圆角线条或串珠式节点。
- 节点像贴纸卡片一样贴在时间线上。
- 里程碑节点可以使用更大的矢量徽章。
- 节点互动按钮沿用小号立体按钮。

文章页规则：

- 正文区域不要过度动画，优先保证可读性。
- 引用块、提示块和代码块采用卡通容器表达。
- 图片可以使用圆角卡片和底座阴影，像贴在页面上的插画。
- 目录导航可以设计为侧边贴纸索引。

### 12.5 性能原则

动画需要避免影响阅读体验。

原则：

- 首屏动画资源控制大小。
- 大型 Lottie 或 Rive 延迟加载。
- 列表动画使用轻量 transform 和 opacity。
- 避免大量 box-shadow 和 filter 动画。
- 尊重 `prefers-reduced-motion`。
- 移动端降低动画复杂度。

## 13. SEO 与分享

需要支持：

- 每篇文章独立 title 和 description。
- Open Graph 图片。
- Twitter Card。
- sitemap.xml。
- robots.txt。
- RSS feed。
- 结构化数据。
- canonical URL。
- 标签页和分类页可索引。

文章页 metadata 来源：

```text
title: Frontmatter title
description: Frontmatter summary
image: cover image
publishedTime: publishedAt
modifiedTime: updatedAt
tags: tags
```

## 14. 性能设计

### 14.1 渲染策略

建议：

- 首页：静态生成 + 动态统计组件局部加载。
- 文章列表：静态生成或 ISR。
- 文章详情：静态生成。
- 时间轴：SSR 或 ISR。
- 评论区：客户端加载或 Server Component 获取。
- 浏览量：客户端触发服务端接口记录。
- 后台：动态渲染。

### 14.2 缓存策略

```text
文章内容：构建期静态生成
文章列表：ISR
首页最近内容：ISR 或短缓存
评论：短缓存或实时获取
点赞数：短缓存 + 乐观更新
浏览量：异步写入，展示聚合值
统计面板：按分钟或小时缓存
```

### 14.3 前端性能

- 使用 Server Components 降低客户端 JS。
- 互动组件单独 client component。
- 动画组件懒加载。
- 图片使用合理尺寸和格式。
- Markdown 代码高亮尽量在构建期完成。
- 首页避免加载完整文章正文。

## 15. 统计与活跃度设计

### 15.1 统计指标

需要统计：

- 全站总浏览量。
- 今日浏览量。
- 文章总数。
- 时间轴节点总数。
- 评论总数。
- 点赞总数。
- 最近更新时间。
- 最近活跃事件。
- 热门文章。
- 热门时间轴节点。

### 15.2 活跃事件来源

活跃事件由以下行为产生：

- 发布文章。
- 修改文章。
- 发布时间轴节点。
- 修改时间轴节点。
- 新评论。
- 新点赞。
- 浏览量达到里程碑。

### 15.3 聚合策略

原始事件表用于追踪详细行为，聚合表用于页面展示。

推荐方式：

- `page_views` 记录原始浏览事件。
- `activity_events` 记录内容和互动事件。
- `site_daily_stats` 记录每日聚合。
- 首页读取聚合表，避免扫描原始表。

## 16. 评论系统设计

### 16.1 评论模式

初期建议支持匿名评论。

字段：

- 昵称。
- 邮箱，可选。
- 内容。
- 目标类型。
- 目标 ID。
- 状态。

评论默认进入待审核状态，管理员审核后展示。

### 16.2 后续扩展

后续可以支持：

- GitHub 登录。
- Google 登录。
- 评论回复。
- 评论邮件通知。
- 管理员回复标识。
- Markdown 评论。
- 表情反应。

第一阶段不建议评论支持复杂 Markdown，最多支持纯文本换行，降低 XSS 风险。

## 17. 点赞系统设计

点赞系统需要支持匿名访客，同时避免重复点赞。

推荐方式：

- 前端生成 visitor_id，存入 cookie 或 localStorage。
- 服务端结合 visitor_id 和 IP hash 做校验。
- 数据库设置唯一约束。
- 用户再次点击可取消点赞，视产品体验决定。

点赞接口：

```text
POST /api/likes
DELETE /api/likes
GET /api/likes?target_type=post&target_id=xxx
```

## 18. 浏览量系统设计

浏览量记录建议异步完成。

流程：

```text
用户打开文章页
页面渲染文章内容
客户端组件 mount 后调用 /api/views
服务端根据 visitor_id + target_id + 时间窗口判断是否计数
写入 page_views
更新聚合统计
前端展示最新浏览量或下次加载展示
```

去重窗口建议：

```text
同一 visitor_id 对同一文章 30 分钟内只计一次
```

## 19. 管理后台设计

### 19.1 权限

后台只允许管理员访问。

管理员身份可以通过 Supabase Auth 实现。

### 19.2 功能优先级

第一优先级：

- 登录。
- 查看评论。
- 审核评论。
- 查看统计。
- 管理时间轴。

第二优先级：

- 文章在线编辑。
- 图片上传。
- 草稿预览。
- 发布流程。

第三优先级：

- 站点设置。
- 主题配置。
- 数据导出。
- 备份恢复。

## 20. 开发阶段规划

### 20.1 阶段一：基础站点和内容展示

目标：完成可访问、可阅读、视觉完整的个人网站。

范围：

- 初始化 Next.js 项目。
- 配置 TypeScript、Tailwind CSS。
- 搭建基础布局。
- 实现首页。
- 实现文章列表和详情页。
- 实现 MDX 渲染。
- 实现文章封面和缩略图。
- 实现时间轴列表。
- 加入基础动画。
- 配置 SEO 基础能力。

### 20.2 阶段二：互动与统计

目标：让网站具备动态互动能力。

范围：

- 接入 Supabase。
- 建立数据库表。
- 实现文章浏览量。
- 实现文章点赞。
- 实现文章评论。
- 实现时间轴点赞。
- 实现时间轴评论。
- 实现首页统计摘要。
- 实现最近活跃记录。

### 20.3 阶段三：管理后台

目标：提升内容管理效率。

范围：

- 管理员登录。
- 评论审核。
- 时间轴管理。
- 统计面板。
- 图片上传。
- 活动日志查看。

### 20.4 阶段四：高级体验

目标：优化视觉、性能和扩展能力。

范围：

- 高级矢量动画。
- Rive / Lottie 主视觉。
- 搜索功能。
- RSS。
- Open Graph 图片生成。
- 访问趋势图。
- 邮件通知。
- 评论回复。
- 全文搜索。

## 21. MVP 范围建议

为了避免第一版过大，建议 MVP 只做以下内容：

- 精美首页。
- 文章列表。
- 文章详情。
- Markdown / MDX 支持。
- 图片和文章缩略图。
- 时间轴列表。
- 基础动画。
- 文章点赞。
- 文章浏览量。
- 文章评论。
- 时间轴点赞和评论。
- 首页最近文章和最近时间轴。
- 首页总浏览量、点赞数、评论数。

暂缓：

- 完整后台文章编辑器。
- 用户系统。
- 高级搜索。
- 邮件通知。
- 复杂权限体系。
- 复杂数据看板。

## 22. 风险与应对

### 22.1 动画过重影响性能

风险：页面首屏加载慢，移动端卡顿。

应对：动画懒加载，移动端降级，优先使用 transform 和 opacity。

### 22.2 评论垃圾内容

风险：被机器人刷评论。

应对：Turnstile、审核机制、频率限制、内容长度限制。

### 22.3 浏览量被刷

风险：统计数据失真。

应对：visitor_id、IP hash、时间窗口去重、Cloudflare 规则。

### 22.4 内容管理过早复杂化

风险：第一版开发周期过长。

应对：先用 MDX 文件写文章，后台编辑器后置。

### 22.5 数据查询性能下降

风险：访问量增加后首页统计慢。

应对：使用聚合表、缓存和定时任务。

## 23. 推荐依赖清单

### 23.1 核心依赖

```text
next
react
react-dom
typescript
tailwindcss
@supabase/supabase-js
@supabase/ssr
zod
```

### 23.2 Markdown 相关

```text
next-mdx-remote
gray-matter
remark
remark-gfm
rehype-slug
rehype-autolink-headings
rehype-pretty-code
shiki
```

### 23.3 UI 与动画

```text
framer-motion
@rive-app/react-canvas
lottie-react
lucide-react
class-variance-authority
clsx
tailwind-merge
```

说明：

- `framer-motion` 用于页面进入、卡片浮起、按钮按压等交互动画。
- `@rive-app/react-canvas` 用于首页主视觉、角色动画、互动插画等高质量矢量动画。
- `lottie-react` 用于轻量装饰动画和运营类插画动画。
- `lucide-react` 仅用于基础图标，关键图标应优先定制为卡通矢量图标。
- 立体卡通按钮建议先作为自定义基础组件实现，不依赖现成 UI 库默认按钮样式。

### 23.4 表单与数据校验

```text
react-hook-form
zod
@hookform/resolvers
```

### 23.5 图表与统计

```text
recharts
```

## 24. 环境变量设计

```text
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

注意：

- `SUPABASE_SERVICE_ROLE_KEY` 只能在服务端使用。
- 不允许暴露到客户端。
- 所有管理接口必须进行权限校验。

## 25. 部署方案

### 25.1 Vercel

负责：

- Next.js 应用部署。
- 自动构建。
- 环境变量管理。
- Preview Deployments。
- Serverless API。

### 25.2 Supabase

负责：

- PostgreSQL。
- Auth。
- Storage。
- Database Functions。
- Row Level Security。

### 25.3 Cloudflare

负责：

- DNS。
- CDN。
- 基础 WAF。
- Turnstile。
- 缓存规则。

## 26. 后续可扩展方向

- 全文搜索：Meilisearch、Typesense、Postgres full-text search。
- RSS 订阅。
- 邮件订阅。
- 评论邮件通知。
- 自动生成 Open Graph 图片。
- GitHub Activity 集成。
- 豆瓣、Goodreads、GitHub、Steam 等个人数据聚合。
- 站点年度报告。
- 多主题切换。
- 英文版本。
- PWA。
- 私密文章。
- 访问密码保护。

## 27. 最终建议

本项目建议按照“先内容展示，再互动统计，最后后台管理”的顺序推进。

最终技术路线：

```text
Next.js App Router
TypeScript
Tailwind CSS
shadcn/ui
MDX / Markdown
Supabase PostgreSQL
Supabase Storage
Supabase Auth
Motion / Framer Motion
Rive / Lottie / SVG Animation
Vercel
Cloudflare
```

最终视觉路线：

```text
扁平卡通矢量风
高饱和珊瑚红、泡泡粉、奶油黄、天空蓝、薄荷绿
大圆角卡片
深色实体底座
明显按压反馈按钮
贴纸式图标和装饰
轻量但有记忆点的矢量动画
```

第一版不要一开始就实现完整 CMS。推荐先完成一个高质量、可上线的内容和互动 MVP，再逐步增加后台、统计和高级动画。这样可以降低初期复杂度，同时保留长期扩展空间。
