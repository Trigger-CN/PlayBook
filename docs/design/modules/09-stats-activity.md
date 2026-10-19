# 统计与活跃度模块设计

## 1. 模块职责

把浏览、点赞、评论和内容变更转换为可快速读取的每日统计、热门内容和最近活跃记录。服务首页摘要、公开统计、后台仪表盘和分析页。

## 2. 数据分层

```text
原始事实：page_views、likes、comments、内容表
领域事件：activity_events
每日聚合：site_daily_stats
内容排行：查询视图/物化视图/专用聚合表
```

公开页面只读取聚合和脱敏事件；后台可读取更细指标但默认不读取逐访客轨迹。

## 3. 指标定义

- views：去重后有效浏览。
- likes：当前有效点赞或事件总数，产品需固定口径；推荐当前有效数。
- comments：公开统计推荐 approved 数，后台另显示 pending。
- posts：已发布文章数。
- timeline：已发布节点数。
- recent update：公开内容最近 published/updated 时间。

每项指标必须在 UI 附近或说明页定义时间范围、更新频率和口径。

## 4. 活跃事件

事件类型至少包括：post_created/updated、timeline_created/updated、comment_created/approved、like_created、view_milestone。

- 事件写入需幂等，避免业务重试产生重复。
- 公开活动过滤 pending/rejected、管理员身份和访客标识。
- 高频浏览不逐条进入活动流，只生成里程碑。
- metadata 使用受控 schema，不存整份业务对象。

## 5. 聚合流程

1. 定时任务确定待聚合日期/游标。
2. 从原始表读取有效数据。
3. 按站点时区计算日期桶。
4. upsert `site_daily_stats`。
5. 刷新热门内容聚合。
6. 记录成功时间、处理范围和错误。
7. 失效 stats/home/analytics cache tags。

任务必须可重复运行相同日期并得到同一结果。迟到事件通过重算最近 N 天纳入。

## 6. 查询契约

```ts
interface StatsRepository {
  getHomeSummary(): Promise<HomeStats>;
  getPublicStats(range: StatsRange): Promise<PublicStats>;
  getAdminAnalytics(range: StatsRange): Promise<AdminAnalytics>;
  getRecentActivity(limit: number, visibility: "public" | "admin"): Promise<ActivityItem[]>;
}
```

页面不直接拼装多个原始表 count。

## 7. 实现技术要点

- Vercel Cron/Supabase Scheduled Function 触发 server-only 聚合函数。
- 使用数据库 SQL/RPC 聚合，不把无界事件拉到应用内存。
- 对 date 建主键 upsert；任务状态建议独立 job_runs 表。
- 首页摘要缓存 5 至 15 分钟，公开统计 15 至 60 分钟，后台可短缓存。
- 内容发布/审核可主动增量失效，但最终以周期重算校正。
- 热门得分公式版本化，避免调整后无法解释历史排行。

## 8. 隐私、错误与恢复

- 小样本来源/设备不公开。
- 聚合失败保留上一成功结果并显示更新时间。
- 任务告警不向公开访客暴露内部错误。
- 原始事件设置保留与清理任务，聚合数据长期保留。
- 重建聚合需有后台/脚本权限和范围限制。

## 9. 验收标准

- 同一日期任务重复执行不重复累计。
- 首页、公开统计和后台指标口径一致且权限分层正确。
- 迟到事件、取消点赞、评论状态变化能在重算后校正。
- 聚合失败有记录、可重试且不清空旧数据。
- 页面读取聚合，不扫描全量原始事件。
