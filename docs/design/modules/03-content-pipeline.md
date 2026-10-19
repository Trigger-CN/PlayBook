# MDX 内容管线设计

## 1. 模块职责

负责从 `content/posts/*.mdx` 读取、验证、编译、索引和渲染文章，输出页面所需元数据、正文、目录、阅读时间及 SEO 信息。MVP 以文件内容为真实来源。

消费页面：首页、文章发现、文章详情、关于页（可复用受限管线）、sitemap/RSS。

## 2. 内容模型

必填/推荐 frontmatter：

```ts
type PostFrontmatter = {
  title: string;
  slug: string;
  summary: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  category?: string;
  cover?: string;
  coverAlt?: string;
  draft: boolean;
  featured?: boolean;
};
```

规则：slug 唯一且规范化；日期为 ISO；有 cover 则 coverAlt 必填；draft 不进入公开索引；未来发布日期默认不公开。

## 3. 处理流程

```text
扫描文件 -> 解析 frontmatter -> Zod 校验 -> 编译 MDX AST
-> 标题 slug/TOC -> 代码高亮 -> 图片元数据 -> 阅读时间
-> 生成文章索引 -> 页面/SEO/RSS 消费
```

构建遇到重复 slug、无效日期、MDX 编译错误或缺失本地图片时应失败，而不是线上静默跳过。

## 4. MDX 功能边界

支持：标题、段落、链接、图片、列表、引用、表格、代码块和白名单组件。

- 标题 ID 稳定；同名标题加序号。
- TOC 收集 h2/h3。
- 代码高亮构建期完成。
- 外链安全属性由渲染组件统一注入。
- 图片通过自定义组件接入 Next Image 和 caption。
- 禁止文章任意 import 服务端密钥、执行不可信脚本或使用未批准组件。

## 5. Repository 接口

```ts
interface PostRepository {
  list(query?: PostQuery): Promise<PostIndexItem[]>;
  getBySlug(slug: string, options?: { includeDraft?: boolean }): Promise<CompiledPost | null>;
  listTags(): Promise<TaxonomyCount[]>;
  listCategories(): Promise<TaxonomyCount[]>;
}
```

页面只依赖接口，不直接 glob 文件，方便后续数据库或混合存储迁移。

写入、草稿版本、发布事务与失效的完整契约见 [后台内容创作与发布](14-admin-authoring.md)。

## 6. 实现技术要点

- 使用 `gray-matter`/等价 parser + Zod 校验；使用 unified remark/rehype 或 Next MDX 工具链。
- 构建索引时缓存文件解析结果，避免首页、列表、RSS 重复全量编译。
- 摘要来自 frontmatter，不自动截断正文代替编辑摘要。
- 阅读时间基于文本字数估算，并对中文/代码设置合理权重。
- 本地图片路径约定为 `public/images/posts/{slug}/` 或静态 import；防止目录穿越。
- 自定义 MDX 组件映射放在 server-safe 文件；需要交互的组件单独 client boundary。
- 数据库 `posts` 元数据如启用，需定义同步过程和唯一 slug，不能存在两个不一致真实来源。

## 7. 缓存与失效

- 文件型内容随构建静态生成。
- 文章列表/首页可使用 Next cache tag：`posts`、`post:{slug}`。
- 后台数据库发布后失效文章详情、列表、首页、标签/分类、sitemap、RSS。
- 预览不进入公共缓存。

## 8. 安全、可访问性与质量

- 对数据库来源 Markdown 做 HTML sanitize；文件型可信作者内容仍限制危险组件。
- 所有图片 alt 在构建检查中验证。
- 标题层级检查不允许正文直接从 h1 开始；页面 h1 来自标题。
- 链接检查可作为 CI，外部链接失败只警告，内部缺失应失败。
- 代码块提供语言、复制按钮和横向滚动容器。

## 9. 验收标准

- 有效 MDX 可生成索引、详情、TOC、阅读时间和 metadata。
- 重复 slug、坏 frontmatter、坏图片和编译错误会阻断构建。
- 草稿/未来文章不会进入公开页面、RSS 或 sitemap。
- 页面不重复扫描/编译全部文件。
- Repository 可替换数据源而不改变页面调用契约。
