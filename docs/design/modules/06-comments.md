# 评论模块设计

## 1. 模块职责

为文章和时间轴提供统一评论提交、审核和公开展示能力。MVP 支持匿名纯文本评论，默认待审核。

消费方：文章详情、时间轴详情、后台评论审核、后台仪表盘。

## 2. 数据模型

```ts
type CommentTargetType = "post" | "timeline_item";
type CommentStatus = "pending" | "approved" | "rejected" | "deleted";
```

核心字段沿用 `comments`：target_type、target_id、parent_id、author_name、author_email_hash、author_avatar_url、content、status、ip_hash、user_agent_hash、created_at、updated_at。建议增加 moderated_at/by/reason。

MVP 可不开放回复，但保留 `parent_id`；启用前需定义层级上限和删除策略。

## 3. 提交流程

1. 客户端填写昵称、可选邮箱、正文和 Turnstile token。
2. 客户端做即时校验，服务端使用同源 Zod schema 再校验。
3. 服务端验证目标存在且公开、评论功能开放、验证码和限流。
4. 标准化内容，计算邮箱/IP/UA hash，不存明文 IP。
5. 插入 `pending` 评论并写活动/审计事件。
6. 返回通用成功消息：“评论将在审核后显示”。

不得向提交者透露反垃圾内部评分或目标的非公开状态。

## 4. 展示流程

- 公开查询只返回 approved 和公开字段。
- 按 created_at 正序或产品确定顺序，分页避免一次加载无界评论。
- 作者头像可基于安全服务/默认生成；不得公开邮箱 hash。
- 评论纯文本转义后保留换行，链接可后续受控识别。
- 管理员批准后失效 `comments:{targetType}:{targetId}`。

## 5. 审核状态机

```text
pending -> approved | rejected | deleted
approved -> deleted | rejected
rejected -> approved | deleted（按运营策略）
```

每次变更记录管理员、时间和原因。并发审核用当前 status 或 updated_at 条件更新。

## 6. API 契约

```text
GET  /api/comments?target_type=post&target_id=...
POST /api/comments
```

管理更新优先 Server Action 或受保护 admin handler。POST 响应不返回邮箱/IP/内部状态详情。限制正文、昵称长度和请求体大小。

## 7. 防垃圾与安全

- IP/visitor/target 多维限流；Turnstile 或等价验证码。
- 输出转义，MVP 不解析 Markdown/HTML。
- 邮箱仅用于头像/通知时在服务端处理并哈希/加密，不公开。
- `target_type` 枚举、target id、parent 归属严格校验。
- 统一成功响应可降低目标枚举和审核策略泄漏。
- 垃圾内容删除与保留策略需符合隐私要求。

## 8. UI 状态与乐观策略

评论不做“公开列表乐观插入”，因为默认待审核。提交按钮立体按压，提交中保持宽度并禁用重复请求。失败聚焦错误摘要；成功清空正文前确保服务端已确认。

## 9. 实现技术要点

- 公共评论列表可 Server Component 读取；表单是 Client Component。
- React Hook Form + Zod；Route Handler 获取可信服务端请求信息。
- RLS 可允许受限 insert，但更推荐服务端 handler 写入以集中防刷。
- approved 查询建立 `(target_type, target_id, status, created_at)` 索引。
- 邮件通知和垃圾分类放异步任务，不阻塞提交响应。

## 10. 验收标准

- 文章和时间轴共享同一接口/表并正确区分目标。
- 匿名提交默认 pending，未审核不公开。
- 审核后缓存正确失效，并发审核不覆盖。
- 限流、长度、验证码、XSS 和隐私处理生效。
- 空、加载、提交、成功、失败状态可访问且不丢输入。
