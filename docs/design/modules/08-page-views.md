# 浏览量模块设计

## 1. 模块职责

异步记录文章、时间轴和页面有效访问，为详情计数、首页摘要、统计趋势和热门排行提供基础数据，同时限制重复计数和隐私数据收集。

## 2. 计数范围

```ts
type ViewTargetType = "post" | "timeline_item" | "page";
```

- 文章详情：必须记录。
- 时间轴详情：建议记录。
- 普通页面：只在有明确统计价值时记录，避免收集所有导航轨迹。
- 预览、后台、机器人、健康检查不计入公开有效浏览。

## 3. 客户端触发流程

1. 页面主体成功渲染。
2. 客户端 ViewTracker mount 后短暂延迟或满足可见条件。
3. 使用 `sendBeacon` 或 fetch POST 提交 path、target_type/id。
4. 服务端校验 path 与目标对应、访客和时间窗。
5. 有效事件写 `page_views`，重复事件返回幂等结果。
6. 聚合任务更新 `site_daily_stats` 和内容排行。

记录失败不重试风暴，不影响页面阅读。

## 4. 去重与访客

建议同一 visitor_id 对同一文章 30 分钟内计一次。去重维度：visitor_id、target_type、target_id/path、时间窗；IP hash/UA hash仅作为辅助防刷。

实现方案：

- 小规模：写入前查询最近事件。
- 更稳健：数据库 RPC + advisory/唯一时间桶约束。
- 高流量后：边缘 KV/Redis 去重，再异步入库。

MVP 需避免两个并发请求同时通过“先查后写”。优先使用数据库函数或可接受小误差并在聚合清洗。

## 5. 数据模型

沿用 `page_views`：path、target_type、target_id、visitor_id、ip_hash、user_agent_hash、referrer、created_at。建议 referrer 只保留规范化 origin/domain 或受控分类，避免保存含敏感 query 的完整 URL。

索引建议：

```text
(target_type, target_id, created_at)
(visitor_id, target_type, target_id, created_at)
(created_at)
```

原始事件设置保留期；长期仅保存聚合。

## 6. API 契约

```text
POST /api/views
Body: { path, targetType?, targetId? }
Response: { counted: boolean, count?: number }
```

服务端从请求头提取必要信息；客户端不能提交 ip_hash。path 必须是同源规范路径并去除不必要 query。

## 7. 聚合与展示

- 详情计数可以短缓存或从内容聚合表读取。
- 每日任务把有效事件聚合进 `site_daily_stats`。
- 热门排行按时间范围聚合 target。
- 公开页不展示实时访客、精确位置或单用户访问记录。

## 8. 实现技术要点

- ViewTracker 是极小 Client Component，不引入完整 analytics SDK。
- Route Handler 限制 body、方法和频率，使用 server-only salt 计算 hash。
- `sendBeacon` 失败无需同步阻塞；fetch 使用 `keepalive`。
- 过滤已知 bot 可作为辅助，但不保证准确；指标口径需说明。
- Cron 聚合使用幂等 date upsert，并保存 last successful run。

## 9. 隐私与安全

- 不存明文 IP。
- hash 使用轮换/受控 salt；哈希仍视为敏感标识。
- 提供隐私说明和原始数据保留期。
- 尊重必要的隐私选择/Do Not Track 策略需产品确认。
- referrer、UA 只保留业务需要的最小粒度。

## 10. 验收标准

- 页面刷新不会无限增加有效浏览。
- 并发/重复请求在定义误差内去重。
- 记录失败不影响正文和导航性能。
- 聚合与详情计数口径一致且可解释。
- 原始数据不公开，不含明文 IP 或敏感完整 referrer。
