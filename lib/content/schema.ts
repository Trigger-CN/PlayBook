import { z } from 'zod'

/** 文章 frontmatter 契约（设计 module 03 §2）。 */
export const postFrontmatterSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  slug: z.string().min(1, 'slug 不能为空'),
  summary: z.string().min(1, '摘要不能为空'),
  publishedAt: z.string().min(1, '发布日期不能为空'),
  updatedAt: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  category: z.string().min(1).optional(),
  cover: z.string().min(1).optional(),
  coverAlt: z.string().min(1).optional(),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
})

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>

/** 构建期索引项：列表页与首页只需要这些字段（设计 02 §5）。 */
export type PostIndexItem = {
  slug: string
  title: string
  summary: string
  publishedAt: string
  updatedAt?: string
  tags: string[]
  category?: string
  cover?: string
  coverAlt?: string
  featured: boolean
  readingTime: number
}

/** 目录项：只收集 h2/h3（设计 module 03 §4）。 */
export type TocEntry = {
  id: string
  text: string
  depth: 2 | 3
}

export type TaxonomyCount = {
  slug: string
  name: string
  count: number
}
