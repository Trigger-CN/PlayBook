# 时间轴领域模块设计

## 1. 模块职责

定义时间轴节点的数据模型、类型、排序、发布状态、媒体和公开查询，为首页、列表、详情和后台管理提供统一领域逻辑。

本模块不实现点赞/评论内部逻辑，只提供稳定目标 ID。

## 2. 领域模型

```ts
type TimelineType = "note" | "milestone" | "project" | "travel" | "reading" | "release";
type TimelineStatus = "draft" | "published" | "archived";

type TimelineItem = {
  id: string;
  title?: string;
  content: string;
  type: TimelineType;
  status: TimelineStatus;
  imageUrl?: string;
  externalUrl?: string;
  occurredAt: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt?: string;
};
```

`occurredAt` 表示事件发生时间，是公开排序依据；`createdAt` 是记录创建时间；`publishedAt` 用于发布审计。三者不得混用。

## 3. 类型配置

每个类型集中配置 label、icon、cap/base 色对和默认占位图。配置由公开卡片、筛选器和后台表单共用。未知类型以中性样式读取旧数据，但管理员保存时必须选择有效枚举。

## 4. 状态机

```text
draft -> published -> archived
archived -> published（允许恢复）
draft -> archived（放弃草稿）
```

- 只有 published 对匿名访客可读。
- 发布写入 `published_at` 和 activity event。
- 编辑 published 节点保留发布状态并更新 `updated_at`。
- 删除优先 archive；硬删需处理互动和媒体引用。

## 5. 查询与分组

- 公开列表：`status=published`，`occurred_at desc, id desc`。
- 首页：相同排序取 5 至 10 条，只选卡片字段。
- 详情：按 id 查询并校验公开状态。
- 分组：服务端按站点时区将 occurredAt 映射到年/月。
- 分页：游标包含 `occurred_at + id`，避免同时间节点遗漏。

## 6. 写入流程

1. 管理员提交表单。
2. Zod 校验内容、类型、日期、外链和媒体引用。
3. 校验 `updated_at` 进行乐观锁。
4. 数据库写入/更新。
5. 发布时写 activity event。
6. 失效 timeline、详情、home、stats 缓存。

数据库写入和活动事件应尽量在事务/RPC 中完成；缓存失效在成功提交后执行。

## 7. 数据库要点

现有 `timeline_items` 需补充 `status`、`external_url`、`published_at`（若确认需要）。索引建议：

```text
(status, occurred_at desc, id desc)
(type, status, occurred_at desc)
(updated_at)
```

RLS：匿名只读 published；管理员 CRUD。外链只允许 http/https，图片必须指向受控存储或允许域名。

## 8. 实现技术要点

- `lib/timeline/repository.ts` 隔离 Supabase 查询。
- 数据库 snake_case 在 repository 映射为应用 camelCase。
- 类型配置使用 `satisfies Record<TimelineType, ...>` 保证完整。
- 列表查询批量附加互动聚合，避免 N+1。
- 时间使用 UTC 存储，分组/输入按站点 IANA 时区。
- 内容 MVP 纯文本；自动链接在输出时安全处理。

## 9. 异常处理

- 非法类型/日期拒绝写入。
- 并发更新返回冲突，不覆盖新版本。
- 数据库或缓存失效失败需要记录并可重试，不把未提交内容标记成功。

## 10. 验收标准

- 草稿和归档不公开、不进 sitemap/首页。
- 相同发生时间分页稳定。
- 发布、更新、归档正确失效相关页面和记录活动。
- 非法类型、日期和外链在服务端被拒绝。
