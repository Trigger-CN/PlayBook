# SEO、分享与 RSS 模块设计

## 1. 模块职责

统一生成 metadata、canonical、Open Graph、结构化数据、sitemap、robots 和 RSS，确保公开内容可发现、可分享且不泄漏草稿/后台页面。

## 2. 页面索引策略

| 页面 | 策略 |
| --- | --- |
| 首页、文章详情、文章列表、标签/分类、时间轴、关于 | index, follow |
| 组合搜索结果 | noindex, follow |
| 公开统计 | 产品决定，默认可 index |
| 草稿预览、后台、登录 | noindex, nofollow |
| 不存在/未发布内容 | 404，不输出可索引正文 |

## 3. Metadata 契约

全站提供 title template、description、metadataBase、默认 OG 图、icons。文章详情从 frontmatter 输出：title、summary、cover、publishedAt、updatedAt、tags、canonical。

```ts
type SeoDocument = {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  noindex?: boolean;
};
```

描述必须为编辑摘要，不从正文任意截断含代码/标记内容。

## 4. Open Graph 与分享

- 文章优先封面，缺失时使用动态 OG 模板。
- OG 图尺寸、文字长度和字体需稳定；标题过长有明确截断。
- 时间轴详情可使用类型、日期、摘要和首图。
- 分享按钮使用 Web Share API 时提供复制链接 fallback。
- 分享 URL 使用 canonical，不包含追踪/筛选 query。

## 5. 结构化数据

- 站点：`WebSite`/`Person`（按信息完整度）。
- 文章：`BlogPosting`/`Article`，作者、日期、图片、mainEntityOfPage。
- 面包屑：`BreadcrumbList`。
- 时间轴只有字段足够时输出合适类型，不强行伪造 schema。

JSON-LD 由受控对象序列化，避免直接拼字符串导致注入。

## 6. Sitemap 与 robots

- sitemap 包含已发布文章、公开时间轴和静态公开页。
- 排除 draft、archived、admin、preview、组合搜索。
- lastModified 来源真实更新时间。
- robots 禁止 `/admin`、预览路径和内部 API，但不能把 robots 当权限控制。

## 7. RSS

- MVP 后续支持 RSS，但接口预留。
- Feed 包含站点信息、文章标题、链接、摘要、日期、分类/标签。
- 是否输出全文需产品决定；推荐摘要降低 MDX 自定义组件问题。
- 只包含已发布、非未来文章，链接使用绝对 canonical。
- Content-Type、缓存和 XML 转义正确。

## 8. 实现技术要点

- Next App Router `generateMetadata`、`sitemap.ts`、`robots.ts`、`opengraph-image.tsx`。
- metadata 读取同一个 PostRepository，避免重复解析。
- sitemap/RSS 缓存随文章发布/归档失效。
- 动态 OG 使用内置 ImageResponse 支持的字体/布局，构建测试中文字符。
- canonical 的 origin 来自 `NEXT_PUBLIC_SITE_URL`，生产环境启动时校验。
- CI 检查重复 title、缺 description、坏 canonical 和草稿泄漏。

## 9. 验收标准

- 每篇文章 title/description/canonical/OG 独立正确。
- sitemap、RSS 不包含草稿、未来、后台和预览内容。
- 结构化数据通过验证且字段真实。
- 中文 OG 图无缺字、溢出，分享 fallback 可用。
- 搜索组合页和后台 noindex 生效。
