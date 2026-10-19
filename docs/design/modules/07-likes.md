# 点赞模块设计

## 1. 模块职责

为文章和时间轴提供统一匿名点赞能力，支持计数展示、访客状态、乐观更新和重复限制。

消费方：首页卡片（可只展示计数）、文章详情、时间轴详情、后台分析。

## 2. 数据模型与约束

```ts
type LikeTargetType = "post" | "timeline_item";
```

`likes` 保存 target_type、target_id、visitor_id、可选 user_id、ip_hash、created_at。唯一约束至少覆盖 `(target_type, target_id, visitor_id)`。

visitor_id 是随机不可推断标识，存 httpOnly cookie 或客户端 cookie/localStorage 的选择需权衡；服务端必须把它当不可信输入并校验格式。

## 3. 产品行为

MVP 决策需二选一并固定：

- **只可点赞**：重复点击保持已点赞，接口幂等。
- **可取消**：再次点击 DELETE 取消。

推荐可取消，UI 使用 `aria-pressed` 表示状态，但选中不永久保持物理按下位移，只改变颜色/图标/文案。

## 4. 请求流程

### 4.1 获取状态

详情页初始响应提供聚合计数；访客是否已点赞可通过 cookie 服务端查询或客户端 GET。不得为列表每张卡发请求。

### 4.2 点赞

1. 客户端立即 count +1、pressed=true。
2. POST 携带 target_type/id（visitor 从安全 cookie/服务端获取）。
3. 服务端校验公开目标、限流和唯一约束。
4. 插入成功返回权威 count/state。
5. 冲突视作幂等成功；其他失败回滚客户端。

取消流程对称，但不得让计数小于 0。

## 5. API 契约

```text
GET    /api/likes?target_type=post&target_id=...
POST   /api/likes { targetType, targetId }
DELETE /api/likes { targetType, targetId }

Response: { count: number, liked: boolean }
```

接口返回权威状态，不返回 visitor_id、IP hash 或点赞记录列表。

## 6. 一致性与聚合

- 唯一约束是防重复的最终保证，前端禁用不是安全边界。
- 计数可查询 count 或维护聚合表；若维护计数器，插入/删除和计数必须事务一致。
- 首页/列表批量读取聚合，不做 N+1。
- like_created/removed 活动事件需要去重，避免用户频繁切换污染公开活跃流。

## 7. 安全与防刷

- visitor_id + IP hash + 时间窗限流。
- 目标必须存在且公开。
- 请求体枚举/长度校验，拒绝任意表名或路径。
- 不存明文 IP；hash 加服务端 salt。
- 异常高频行为记录聚合安全事件，不公开封禁规则。

## 8. UI 与可访问性

- 使用立体 `ToyButton` 小尺寸，文本包含“点赞”和计数。
- `aria-pressed` 反映 liked；loading 使用 `aria-busy` 并保持宽度。
- 乐观失败回滚并用礼貌提示，不只改变颜色。
- 键盘 Space/Enter 触发原生 button。

## 9. 实现技术要点

- 互动按钮为 Client Component，其余页面保持 Server Component。
- 使用 mutation 状态机防止多次并发点击；可以串行化或只保留最后意图。
- Route Handler 使用 server-only Supabase client。
- 数据库索引支持 target count 和 visitor lookup。
- 更新成功后按需要失效详情/统计 tag；即时局部状态不等待全页刷新。

## 10. 验收标准

- 两类目标共享接口并严格校验。
- 重复请求幂等，唯一约束生效。
- 乐观更新成功同步权威值，失败正确回滚。
- 选中、加载、错误、键盘和移动触控状态清晰。
- 列表计数批量获取，无 N+1。
