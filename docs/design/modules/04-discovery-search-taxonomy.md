# 内容发现、搜索与分类模块设计

## 1. 模块职责

为文章列表、标签页、分类页和后续全站搜索提供统一的查询参数、分类规范、排序、分页和结果契约。

消费页面：文章发现页、首页精选区、后台文章列表（使用不同权限查询）。

## 2. 领域规则

- 分类 `category`：单值、数量少、长期稳定。
- 标签 `tags`：多值、描述具体主题。
- 展示名与 slug 分离；slug 小写、URL 安全、唯一。
- 同义词/重命名需保留 redirect 映射，防止旧 URL 失效。
- 搜索 MVP 覆盖标题、摘要、标签、分类；全文搜索为后续。

## 3. 查询契约

```ts
type PostQuery = {
  q?: string;
  tag?: string;
  category?: string;
  sort?: "published" | "updated" | "featured" | "popular";
  page?: number;
  pageSize?: number;
};
```

公开 query 只能返回 published，后台 query 可额外带 status。未知参数忽略，非法枚举回退默认；页数、长度和 pageSize 有上限。

## 4. 用户流程

1. 页面从 path/query 解析当前条件。
2. 服务端校验并规范化。
3. Repository 返回结果与总数/next cursor。
4. 页面渲染当前条件、结果摘要和清除入口。
5. 条件变化重置分页并更新可分享 URL。

搜索输入可以防抖展示建议，但正式结果以提交/URL 为准。浏览器前进后退必须恢复条件。

## 5. 排序与分页

- 默认 `publishedAt desc, slug desc`，所有排序加稳定次键。
- `popular` 依赖聚合指标，未启用时不展示。
- 静态小站可构建期内存分页；数据增长后切到服务端 cursor。
- 标签/分类页面可以静态生成；组合搜索通常动态且 noindex。

## 6. 实现技术要点

- Zod/显式 parser 负责 query 白名单和上限。
- 对 MDX 索引建立预计算 lowercase/searchText，避免每次重复标准化。
- 中文 MVP 可用简单包含匹配；后续引入 PostgreSQL FTS/pg_trgm 时保持 Repository 契约。
- 标签和分类计数在构建/聚合阶段产生，不逐请求扫描正文。
- 搜索结果只返回卡片字段，正文全文匹配也不下发完整内容。
- 对高频未知查询设置合理缓存和限流，防止昂贵搜索滥用。

## 7. SEO 与 URL

- `/tags/[tag]`、`/categories/[category]` 可索引并有 canonical。
- `/posts?q=...` 和多条件组合默认 `noindex,follow`。
- page > 1 canonical 策略必须一致；避免所有分页 canonical 到第 1 页造成内容冲突。
- 重命名 taxonomy 时提供永久重定向。

## 8. 可访问性与状态

- 搜索有 label、提交和清除按钮。
- 当前筛选使用文字与 `aria-pressed`/`aria-current`。
- 结果数用礼貌 aria-live 更新，不每次按键都打扰。
- 无结果区分“没有内容”和“筛选无匹配”。
- 筛选导航 pending 保持布局，不清空旧结果造成闪烁。

## 9. 验收标准

- path/query 可准确恢复搜索、标签、分类、排序和分页。
- 草稿永不出现在公开发现结果。
- 排序稳定，无跨页重复/遗漏。
- taxonomy 计数、slug 和重定向正确。
- SEO 索引策略与专用页/组合查询相匹配。
