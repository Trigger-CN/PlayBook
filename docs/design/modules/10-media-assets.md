# 媒体资源模块设计

## 1. 模块职责

管理文章封面、正文图片、时间轴图片、头像和视觉资产的路径、上传、元数据、优化、引用与删除策略。

MVP 本地文章图片可随仓库发布；后台上传启用后使用 Supabase Storage。

## 2. 资源类型

- 文章封面：列表、首页、OG 候选。
- 文章正文图：原始内容，可带 caption。
- 时间轴图：MVP 单图，后续画廊。
- 头像/品牌图：站点配置。
- 装饰资产：SVG/Rive/Lottie，构建期静态资源。

每个内容媒体至少记录 URL/path、alt、宽高、mime、大小；可选 caption、blur data、owner、created_at。

## 3. 存储策略

### 3.1 MVP 本地资源

```text
public/images/posts/{slug}/...
public/images/timeline/...
public/assets/...
```

构建时验证文件存在、大小和 alt。不要把敏感 EXIF/定位信息原样发布。

### 3.2 对象存储

Bucket 分公开内容与私有草稿（如需要）。路径使用生成 ID，不信任原始文件名：

```text
posts/{postId}/{assetId}.{ext}
timeline/{itemId}/{assetId}.{ext}
site/{assetId}.{ext}
```

上传先进入临时/草稿路径，业务记录保存成功后再确认引用。

## 4. 上传流程

1. 客户端选择文件并做基础预检。
2. 服务端创建受限上传或接收 multipart。
3. 校验实际 mime、扩展名、大小、像素和权限。
4. 清理 EXIF，必要时转码生成 WebP/AVIF 和缩略图。
5. 写媒体元数据。
6. 业务内容引用 asset id/url。
7. 未引用临时资源由清理任务回收。

不要让客户端用 service role 任意写 bucket。

## 5. 图片展示

- 使用 Next Image，提供 width/height 或稳定 aspect-ratio。
- `sizes` 根据卡片/正文布局定义，不默认 100vw。
- 封面裁剪策略固定；正文图优先显示完整内容。
- 首屏 LCP 图可 priority，其余懒加载。
- 图片查看器为后续能力，需键盘、焦点和关闭支持。

## 6. 引用与删除

- 删除业务内容前检查媒体是否共享引用。
- 默认先删除/归档业务引用，异步清理无引用对象。
- 不直接根据 URL 前缀推断所有权，使用媒体表或明确 owner。
- 替换图片后旧资源进入延迟清理，支持发布失败回滚。

## 7. 实现技术要点

- `lib/media/repository.ts` 统一本地/Storage URL 和 metadata。
- Next `remotePatterns` 只允许 Supabase 项目和确认域名。
- 上传 schema 限制格式（jpeg/png/webp/gif 按需求）、大小和像素。
- SVG 上传默认禁止或服务端严格 sanitize；装饰 SVG 由仓库维护。
- 动画资源懒加载，并提供 poster/fallback。
- OG 图生成使用受控模板，不直接使用任意外部图片。

## 8. 可访问性、安全与性能

- 内容图片 alt 必填规则与语义一致，装饰图空 alt。
- 上传错误说明格式、大小和修复方式。
- 去除 EXIF，防止定位和设备信息泄漏。
- 防止路径穿越、伪造 mime、压缩炸弹和超大像素攻击。
- CDN 缓存文件名使用不可变 hash；替换资源生成新 URL。

## 9. 验收标准

- 本地/上传图片都能生成稳定尺寸和优化响应。
- 无 alt、坏路径、非法类型在发布前被阻止。
- 客户端无任意 bucket 权限，service role 不暴露。
- 替换/删除不会误删共享图片，临时孤儿可清理。
- 移动和桌面加载合适尺寸，无明显 CLS。
