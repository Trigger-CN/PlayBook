# 数据获取、缓存与通用状态设计

## 1. 模块职责

统一页面渲染策略、Server/Client Component 边界、缓存 tag、失效流程和 loading/empty/error/permission 状态，避免不同页面各自定义互相冲突的数据新鲜度。

## 2. 渲染策略矩阵

| 页面/数据 | 策略 | 原因 |
| --- | --- | --- |
| 文章详情 | SSG | 文件内容稳定、SEO 和性能优先 |
| 文章列表/标签分类 | SSG/ISR | 内容发布后更新，查询成本低 |
| 首页静态区 | SSG/ISR | 聚合多个稳定来源 |
| 首页统计 | 缓存 Server Component | 可局部稍旧，失败不阻断 |
| 时间轴列表/详情 | ISR | 数据库内容需更新 |
| 公开评论 | 短缓存/动态 | 审核后应较快可见 |
| 点赞访客状态 | 动态/客户端 | 与 visitor 相关，禁止公共缓存 |
| 浏览记录 | 客户端异步写 | 不阻塞页面 |
| 公开统计 | ISR/分钟级缓存 | 聚合结果，不要求实时 |
| 后台页面 | dynamic/no-store 或私有短缓存 | 权限和待办数据 |

## 3. 数据访问边界

- 页面调用 domain repository，不直接在组件散落 Supabase 查询。
- Server Component 默认读取公开共享数据。
- Client Component 只接收完成交互所需最小数据。
- visitor/user 专属数据不得进入共享 `unstable_cache`。
- service role 查询封装 server-only。
- 列表聚合使用批量查询，禁止 N+1。

## 4. 缓存 Tag 约定

```text
site-config
home
posts
post:{slug}
tag:{slug}
category:{slug}
timeline
timeline-item:{id}
comments:{targetType}:{targetId}
stats-public
stats-admin
rss
sitemap
```

缓存函数需声明数据与 tag 的对应关系。tag 命名集中导出，禁止业务字符串四处复制。

## 5. 失效矩阵

| 事件 | 失效 |
| --- | --- |
| 发布/更新文章 | post:{slug}, posts, home, tag/category, rss, sitemap |
| 归档文章 | 同上，并清理旧详情 |
| 发布/更新时间轴 | timeline-item:{id}, timeline, home, stats-public |
| 批准评论 | comments:target, home/统计（按展示） |
| 点赞 | 详情局部状态；聚合/统计后续更新 |
| 更新站点配置/链接 | site-config, home, layout 消费缓存 |
| 每日聚合完成 | home, stats-public, stats-admin |

数据库事务成功后再失效；失败不能先清缓存制造不一致。

## 6. 通用页面状态

### 6.1 Loading

- 首次可服务端完成的数据不做客户端空白加载。
- Suspense skeleton 必须与目标区域尺寸接近，防 CLS。
- 操作 loading 保持按钮宽高，使用 `aria-busy`。

### 6.2 Empty

区分“系统尚无数据”和“筛选无结果”。空状态给出与用户权限相符的下一步，不向访客展示后台入口。

### 6.3 Error

- 页面级 `error.tsx` 提供重试和安全返回路径。
- 模块级错误局部隔离，首页统计失败不阻断文章。
- 服务端日志记录 request id，客户端不显示 SQL/stack/密钥。
- mutation 失败保留输入并回滚乐观状态。

### 6.4 Not found / Forbidden

- 公开不存在、草稿、归档内容使用 404，避免泄漏。
- 后台未登录重定向登录，无权限返回 403。
- 不把所有错误都吞成空状态。

### 6.5 Stale / Offline

可展示缓存旧数据时标明更新时间；不宣称实时。离线写操作不排队自动重放，除非设计幂等和用户确认。

## 7. 并发与 mutation

- 表单/后台编辑使用 updated_at/version 乐观锁。
- 点赞通过唯一约束和幂等接口。
- 评论提交使用 request id/限流避免重复。
- 聚合任务按日期幂等 upsert。
- 客户端重复点击在 mutation 层串行化或折叠为最后意图。

## 8. 实现技术要点

- Next `fetch` cache、`unstable_cache`/等价能力集中封装，记录 revalidate 和 tags。
- `loading.tsx`、`error.tsx`、`not-found.tsx` 按路由层级配置。
- 数据函数返回领域对象，不把 Supabase response/error 直接传 UI。
- 对并行独立查询使用 `Promise.all`；需要局部容错时分 Suspense/error boundary。
- 缓存 key 包含真正影响结果的参数，query 先规范化。
- 后台和访客专属查询明确 `no-store`，防跨用户泄漏。
- 使用 OpenTelemetry/Vercel logs 记录耗时、cache hit、错误，不记录敏感内容。

## 9. 性能预算

- 首页和文章首屏不依赖互动 JS 才能显示。
- 动态图表、Rive/Lottie 延迟加载。
- 列表只传卡片字段，分页限制条数。
- 图片尺寸和代码高亮在服务端/构建期处理。
- API body、pageSize、时间范围均有限制。

## 10. 验收标准

- 发布/审核/设置变更后所有相关页面按矩阵更新。
- 用户专属点赞/后台数据不会进入公共缓存。
- loading 不导致明显布局位移，错误不泄漏内部信息。
- 乐观更新失败可回滚，后台并发编辑有冲突提示。
- 页面策略与矩阵一致，缓存 key/tag 有自动化测试或集成验证。
