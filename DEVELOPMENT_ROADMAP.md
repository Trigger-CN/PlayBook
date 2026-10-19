# 个人网站开发路径文档

> 各页面与功能模块的详细实施设计见 [设计文档索引](docs/design/README.md)。

## 1. 路线概览

开发顺序遵循“先视觉基础，再内容展示，再动态互动，最后后台和高级体验”的原则。

推荐阶段：

1. 项目初始化与基础工程。
2. 扁平卡通视觉系统与核心组件。
3. Markdown / MDX 文章系统。
4. 首页内容聚合。
5. 时间轴系统。
6. Supabase 数据层。
7. 点赞、评论和浏览量。
8. 活跃度与统计。
9. 管理后台与审核。
10. 高级视觉和体验增强。

## 2. 技术基线

项目技术栈：

- Next.js App Router。
- TypeScript。
- Tailwind CSS。
- shadcn/ui + 自定义卡通组件。
- Markdown / MDX。
- Supabase PostgreSQL。
- Supabase Storage。
- Supabase Auth。
- Motion / Framer Motion。
- Rive / Lottie / SVG Animation。
- Vercel。
- Cloudflare。

开发原则：

- MVP 阶段文章正文优先使用 MDX 文件。
- 动态数据统一进入 Supabase。
- 视觉系统先行，避免后续组件风格不一致。
- 点赞和评论使用统一 target 模型，避免文章和时间轴重复实现。
- 统计优先考虑聚合，避免首页直接扫描大量原始事件。

## 3. Phase 0：项目初始化

目标：建立可运行、可扩展的 Next.js 工程基础。

对应需求：REQ-CONT-001、REQ-NFR-001、REQ-NFR-002。

交付内容：

- 初始化 Next.js App Router 项目。
- 配置 TypeScript。
- 配置 Tailwind CSS。
- 配置基础 lint 和格式化规则。
- 建立 `app`、`components`、`content`、`lib`、`types`、`public` 目录。
- 创建基础 layout。
- 创建首页、文章、时间轴、关于页的路由骨架。
- 添加环境变量示例文件。

建议目录：

```text
app/
components/
content/posts/
lib/
public/images/
public/animations/
types/
```

完成标准：

- 本地开发服务器可以启动。
- 首页路由可以访问。
- 基础 layout 生效。
- Tailwind 样式可以使用。
- 项目没有初始 TypeScript 错误。

## 4. Phase 1：视觉系统与核心 UI

目标：先建立扁平卡通矢量风格和可复用组件，保证后续页面风格统一。

对应需求：REQ-VIS-001 到 REQ-VIS-025、REQ-NFR-006、REQ-NFR-007、REQ-NFR-009。

交付内容：

- 定义全局 CSS 变量。
- 定义日间 / 晚间两套主题颜色、圆角、底座厚度、间距、字体和动画时长。
- 实现立体卡通按压按钮组件。
- 实现卡通主题切换开关组件。
- 实现快捷跳转按钮和按钮阵列组件。
- 实现主题状态管理和本地持久化。
- 实现卡通卡片组件。
- 实现统计数字块组件。
- 实现标签 / chip 组件。
- 实现文章卡片组件。
- 实现时间轴节点卡片组件。
- 实现基础装饰元素，例如网格背景、圆点、星星、贴纸形状。
- 实现 reduced-motion 降级策略。

重点组件：

```text
components/ui/toy-button.tsx
components/ui/theme-toggle.tsx
components/site/quick-link-bar.tsx
components/ui/toy-card.tsx
components/ui/stat-block.tsx
components/ui/tag-chip.tsx
components/posts/post-card.tsx
components/timeline/timeline-card.tsx
components/site/decorative-background.tsx
```

按钮实现要求：

- 使用单一可交互根元素：外层 `button` / `a` 充当深色底座，内层 `span` 充当明亮按钮面。
- 外层水平 padding 必须为 `0`，按钮面与底座左右边缘必须完全对齐。
- 按钮面和底座颜色必须成对定义为主题 token，日间 / 晚间主题分别提供色值。
- 默认状态通过按钮面负向位移露出底座，不得用模糊阴影代替实体厚度。
- hover 只移动内层按钮面并轻微提亮，不移动外层占位。
- active 时按钮面明显下压，仅保留 1px 到 2px 底座边缘。
- disabled 保留立体结构但不可按压，并使用原生 `disabled` 或 `aria-disabled`。
- focus-visible 使用粗描边和 outline offset，不能只依赖颜色。
- 小按钮必须保留完整底座与按压反馈，不能退化成普通扁平胶囊。
- 点赞、评论、发送、筛选、CTA、快捷入口和后台操作复用 `ToyButton`，业务组件不得复制按钮状态 CSS。
- reduced-motion 下取消 transition，但默认 / 按下状态仍需可辨识。

主题切换实现要求：

- 支持日间主题和晚间主题。
- 初次访问可读取系统 `prefers-color-scheme`。
- 用户手动切换后写入 localStorage 或 cookie。
- 刷新页面后保持用户上次选择。
- 开关本身必须是卡通矢量风格，不能使用浏览器默认 checkbox 外观。
- 切换时应更新按钮、卡片、背景、文章正文、统计块和时间轴颜色。

快捷跳转栏实现要求：

- 由立体卡通按钮组成按钮阵列。
- 支持站内链接和站外链接。
- 链接数据来自配置文件，MVP 阶段不需要后台编辑。
- 每个链接支持 title、href、icon、description、order、external、enabled 字段。
- 移动端自动换行或横向滚动，不产生页面横向溢出。

完成标准：

- 所有核心 UI 组件有桌面和移动端表现。
- 按钮面与底座宽度、圆角完全对齐。
- 按钮具备默认、hover、active、disabled、focus-visible 状态。
- 小按钮在 390px 宽度下可换行，文字和图标不溢出。
- 点赞、评论、发送、CTA 和快捷入口均复用同一立体按钮组件。
- 主题开关可以在日间和晚间主题之间即时切换。
- 主题选择刷新后仍然保留。
- 快捷跳转栏组件可以根据配置渲染按钮阵列。
- 卡片和统计块与按钮视觉语言一致。
- reduced-motion 下取消非必要过渡，按钮状态仍清晰。

## 5. Phase 2：文章系统

目标：实现基于 Markdown / MDX 的文章发布和阅读能力。

对应需求：REQ-CONT-001 到 REQ-CONT-007、REQ-ART-001 到 REQ-ART-008、REQ-SEO-001、REQ-SEO-002。

交付内容：

- 建立 `content/posts/*.mdx` 内容结构。
- 定义文章 frontmatter 类型。
- 实现 frontmatter 解析。
- 实现文章列表页。
- 实现文章详情页。
- 实现 Markdown / MDX 渲染。
- 实现代码高亮。
- 实现自动目录。
- 实现文章封面图。
- 实现文章缩略图规则。
- 实现标签和分类展示。
- 实现基础 SEO metadata。

文章 frontmatter 建议：

```yaml
---
title: "文章标题"
slug: "post-slug"
summary: "文章摘要"
cover: "/images/posts/post-slug/cover.png"
coverAlt: "封面描述"
publishedAt: "2026-07-17"
updatedAt: "2026-07-17"
tags:
  - Web
category: "Build"
draft: false
featured: true
---
```

完成标准：

- 至少一篇示例文章可以渲染。
- 文章列表展示标题、摘要、日期、标签和缩略图。
- 文章详情页展示正文、目录、代码高亮和图片。
- 无封面图时有符合风格的占位缩略图。
- 文章页 metadata 正确生成。

## 6. Phase 3：首页聚合

目标：完成具有视觉记忆点的首页，并聚合最近文章、最近时间轴和统计摘要。

对应需求：REQ-HOME-001 到 REQ-HOME-021、REQ-CONT-005、REQ-TL-009、REQ-VIS-018 到 REQ-VIS-025。

交付内容：

- Hero 区域。
- 个人介绍。
- 社交链接。
- 主 CTA。
- 日间 / 晚间主题切换开关。
- 快捷跳转栏。
- 快捷链接配置文件。
- 主视觉插画或动画占位。
- 最近文章模块。
- 最近时间轴模块占位或初版。
- 统计摘要模块。
- 最近活跃模块占位。
- 移动端首页布局。

完成标准：

- 首页展示 3 到 6 篇最近文章。
- 文章卡片展示缩略图。
- 首页视觉符合扁平卡通矢量风格。
- 主按钮使用立体卡通按压按钮。
- 首页主题开关可见、可用，并且不会干扰主要内容阅读。
- 首页展示快捷跳转按钮阵列。
- 新增一条快捷链接配置后，首页可以展示对应按钮。
- 移动端布局可读、可点击、无横向溢出。

## 7. Phase 4：时间轴系统

目标：实现可记录事件、想法和里程碑的时间轴页面。

对应需求：REQ-TL-001 到 REQ-TL-010。

交付内容：

- 时间轴数据类型。
- 时间轴列表页。
- 时间轴节点卡片。
- 年月分组。
- 节点类型展示。
- 节点图片展示。
- 节点详情页或展开态。
- 首页最近时间轴节点。

实现顺序：

1. 先使用本地 seed 数据实现页面。
2. 确认视觉和交互后接入 Supabase。
3. 后续通过后台管理时间轴。

完成标准：

- 时间轴页面按年月展示节点。
- 节点可以展示文字、类型、时间和图片。
- 首页展示最近 5 到 10 个时间轴节点。
- 带图片节点展示缩略图。
- 节点卡片使用卡通贴纸式视觉。

## 8. Phase 5：Supabase 数据层

目标：建立动态数据基础，为点赞、评论、浏览、统计和后台提供存储能力。

对应需求：REQ-INT-001 到 REQ-INT-004、REQ-STAT-001 到 REQ-STAT-011、REQ-SEC-001 到 REQ-SEC-006。

交付内容：

- 创建 Supabase 项目。
- 配置环境变量。
- 实现服务端 Supabase client。
- 实现浏览器端 Supabase client。
- 建立数据库迁移。
- 建立 posts 元数据表。
- 建立 timeline_items 表。
- 建立 comments 表。
- 建立 likes 表。
- 建立 page_views 表。
- 建立 activity_events 表。
- 建立 site_daily_stats 表。
- 编写基础 RLS 策略。
- 编写 seed 数据。

完成标准：

- 数据库迁移可以重复执行。
- 应用可以读取公开数据。
- 服务端密钥不进入客户端。
- 点赞、评论和浏览表具备目标类型字段。
- 基础 RLS 策略已启用或有明确待启用清单。

## 9. Phase 6：点赞、评论和浏览量

目标：完成文章和时间轴的核心互动能力。

对应需求：REQ-ART-009 到 REQ-ART-011、REQ-TL-007、REQ-TL-008、REQ-INT-001 到 REQ-INT-010、REQ-STAT-001 到 REQ-STAT-004。

交付内容：

- 统一点赞接口。
- 统一评论接口。
- 浏览量记录接口。
- visitor_id 生成和存储。
- 点赞去重。
- 评论表单。
- 评论内容校验。
- 评论 pending 状态。
- 文章互动组件。
- 时间轴互动组件。
- 浏览量展示组件。
- 乐观更新或提交反馈。

推荐接口：

```text
POST /api/likes
DELETE /api/likes
GET /api/likes
POST /api/comments
GET /api/comments
POST /api/views
```

完成标准：

- 访客可以给文章点赞。
- 访客可以给时间轴节点点赞。
- 同一访客不能无限重复点赞同一目标。
- 访客可以提交文章评论。
- 访客可以提交时间轴评论。
- 评论默认 pending。
- 浏览量有基础去重。
- 互动按钮使用立体卡通按压样式。

## 10. Phase 7：站点活跃度与统计

目标：让网站能展示整体活跃程度和最近动态。

对应需求：REQ-STAT-003 到 REQ-STAT-011、REQ-HOME-008、REQ-HOME-009。

交付内容：

- 活跃事件写入逻辑。
- 每日统计聚合逻辑。
- 首页统计摘要组件接入真实数据。
- 最近活跃列表接入真实数据。
- 热门文章查询。
- 热门时间轴节点查询。
- 基础缓存策略。

活跃事件包括：

- article_created。
- article_updated。
- timeline_created。
- timeline_updated。
- comment_created。
- like_created。
- view_recorded。
- view_milestone_reached。

完成标准：

- 首页能展示总浏览量、总点赞数、总评论数、文章数和时间轴数。
- 最近活跃记录来自真实事件。
- 统计读取不依赖每次扫描全部原始浏览记录。
- 热门内容可以按浏览或点赞排序。

## 11. Phase 8：管理后台与审核

目标：提供基础管理能力，尤其是评论审核和时间轴管理。

对应需求：REQ-ADMIN-001 到 REQ-ADMIN-008、REQ-SEC-005、REQ-SEC-006。

交付内容：

- Supabase Auth 管理员登录。
- 受保护的 `/admin` 路由。
- 评论审核页面。
- 评论批准 / 拒绝操作。
- 时间轴管理页面。
- 基础统计页面。
- 活动日志页面。

完成标准：

- 匿名用户不能访问后台。
- 管理员可以查看 pending 评论。
- 管理员可以批准或拒绝评论。
- 管理员可以创建和编辑时间轴节点。
- 管理员可以查看基础统计。

## 12. Phase 9：高级体验增强

目标：在 MVP 稳定后增强视觉表现、内容能力和传播能力。

对应需求：REQ-CONT-008、REQ-ADMIN-006、REQ-ADMIN-007、REQ-SEO-006、REQ-SEO-007。

可选交付内容：

- Rive 首页主视觉动画。
- Lottie 装饰动画。
- 更多 SVG 贴纸和插画资产。
- RSS。
- Open Graph 图片生成。
- 全文搜索。
- 评论回复。
- 邮件通知。
- 在线文章编辑器。
- 图片上传。
- 高级统计面板。
- 多主题或节日主题。

完成标准：

- 新增动画不显著拖慢首屏。
- 新功能不破坏 MVP 核心体验。
- 新视觉资产保持扁平卡通矢量风格。
- 在线编辑和图片上传具备权限和安全限制。

## 13. 测试与验证计划

### 13.1 工程验证

- TypeScript 检查通过。
- lint 通过。
- production build 通过。
- 环境变量缺失时有明确错误提示。

### 13.2 视觉验证

- 桌面端截图检查。
- 移动端截图检查。
- 按钮按压效果检查。
- 卡片 hover 和 active 状态检查。
- reduced-motion 检查。

### 13.3 内容验证

- MDX 文章渲染。
- 图片渲染。
- 代码高亮。
- 目录生成。
- 标签和分类展示。
- SEO metadata。

### 13.4 互动验证

- 文章点赞。
- 时间轴点赞。
- 文章评论提交。
- 时间轴评论提交。
- 评论 pending 状态。
- 浏览量去重。
- 统计数字更新。

### 13.5 安全验证

- 匿名用户不能访问后台。
- 服务端密钥不出现在客户端 bundle。
- 评论输入有长度限制。
- 点赞接口有重复限制。
- 浏览记录不保存明文 IP。

## 14. 风险与缓解

### 14.1 动画性能风险

风险：Rive / Lottie 或复杂动画导致首屏慢、移动端卡顿。

缓解：大型动画懒加载，移动端降级，优先使用 transform 和 opacity，支持 reduced-motion。

### 14.2 视觉不一致风险

风险：不同页面组件风格不统一。

缓解：Phase 1 先实现设计 token 和基础组件，后续页面必须复用 ToyButton、ToyCard 和 StatBlock。

### 14.3 评论垃圾内容风险

风险：匿名评论被机器人刷屏。

缓解：评论默认 pending，加入长度限制、频率限制，后续接入 Cloudflare Turnstile。

### 14.4 浏览量失真风险

风险：用户刷新或机器人访问导致浏览量膨胀。

缓解：visitor_id + IP hash + 时间窗口去重，必要时对异常来源限流。

### 14.5 CMS 过早复杂化风险

风险：一开始做完整后台导致 MVP 周期过长。

缓解：MVP 使用 MDX 文件写文章，后台先只做评论审核和时间轴管理。

### 14.6 统计查询变慢风险

风险：原始事件变多后首页统计慢。

缓解：使用 site_daily_stats 聚合表和缓存策略。

## 15. 里程碑清单

- [ ] 项目初始化完成。
- [ ] Tailwind 和 TypeScript 配置完成。
- [ ] 视觉 token 定义完成。
- [ ] 日间 / 晚间主题 token 完成。
- [ ] 立体卡通按钮完成。
- [ ] 主题切换开关完成。
- [ ] 快捷跳转栏完成。
- [ ] 快捷链接配置完成。
- [ ] 卡通卡片组件完成。
- [ ] 统计块组件完成。
- [ ] MDX 文章解析完成。
- [ ] 文章列表页完成。
- [ ] 文章详情页完成。
- [ ] 文章缩略图完成。
- [ ] 首页 Hero 完成。
- [ ] 首页最近文章完成。
- [ ] 时间轴列表完成。
- [ ] 首页最近时间轴完成。
- [ ] Supabase 迁移完成。
- [ ] 点赞功能完成。
- [ ] 评论功能完成。
- [ ] 浏览量功能完成。
- [ ] 首页统计摘要完成。
- [ ] 最近活跃记录完成。
- [ ] 评论审核后台完成。
- [ ] 移动端适配完成。
- [ ] SEO 基础能力完成。
- [ ] Vercel 部署完成。

## 16. 推荐 MVP 实施顺序

最小可上线顺序：

1. 初始化项目。
2. 实现视觉 token 和 ToyButton。
3. 实现日间 / 晚间主题 token 和主题开关。
4. 实现快捷跳转栏和快捷链接配置。
5. 实现首页静态视觉。
6. 实现 MDX 文章列表和详情。
7. 实现文章缩略图。
8. 实现时间轴静态列表。
9. 接入 Supabase。
10. 实现点赞。
11. 实现评论提交。
12. 实现浏览量。
13. 实现首页统计摘要。
14. 完成移动端和 SEO。
15. 部署上线。

这个顺序可以尽早验证视觉方向和内容阅读体验，再逐步增加动态能力，避免在后台和统计上过早投入导致第一版迟迟不能上线。
