import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'

import matter from 'gray-matter'

import {
  postFrontmatterSchema,
  type PostFrontmatter,
  type PostIndexItem,
  type TaxonomyCount,
} from './schema'

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts')

export type CompiledSource = {
  frontmatter: PostFrontmatter
  /** MDX 原文，交由渲染层编译；此处不做客户端可见的转换。 */
  body: string
  readingTime: number
}

export type PostQuery = {
  q?: string
  tag?: string
  category?: string
  sort?: 'published' | 'updated' | 'featured'
  page?: number
  pageSize?: number
}

export type PostQueryResult = {
  items: PostIndexItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50

/**
 * 阅读时间：以中文每字、西文每词为单位的简化估算（设计 module 03 §6）。
 * 结果至少为 1 分钟。
 */
export function estimateReadingTime(body: string): number {
  const cjk = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const words = (body.match(/[A-Za-z0-9]+/g) ?? []).length
  const minutes = Math.ceil((cjk + words * 1.6) / 350)
  return Math.max(1, minutes)
}

function isPublished(frontmatter: PostFrontmatter, now: Date): boolean {
  if (frontmatter.draft) return false
  const published = new Date(frontmatter.publishedAt)
  if (Number.isNaN(published.getTime())) return false
  return published.getTime() <= now.getTime()
}

/**
 * 读取并校验单个文件；frontmatter 非法时抛出，让构建失败而不是静默跳过
 * （设计 module 03 §3：构建遇到坏 frontmatter 应失败）。
 */
async function readPostFile(
  fileName: string,
  now: Date,
): Promise<{ index: PostIndexItem; body: string } | null> {
  const fullPath = path.join(POSTS_DIR, fileName)
  const raw = await fs.readFile(fullPath, 'utf8')
  const { data, content } = matter(raw)

  const parsed = postFrontmatterSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(
      `[content] ${fileName} 的 frontmatter 校验失败：${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    )
  }

  const frontmatter = parsed.data

  if (frontmatter.cover && !frontmatter.coverAlt) {
    throw new Error(`[content] ${fileName} 存在 cover 但缺少 coverAlt`)
  }

  if (!isPublished(frontmatter, now)) return null

  const index: PostIndexItem = {
    slug: frontmatter.slug,
    title: frontmatter.title,
    summary: frontmatter.summary,
    publishedAt: frontmatter.publishedAt,
    updatedAt: frontmatter.updatedAt,
    tags: frontmatter.tags,
    category: frontmatter.category,
    cover: frontmatter.cover,
    coverAlt: frontmatter.coverAlt,
    featured: frontmatter.featured,
    readingTime: estimateReadingTime(content),
  }

  return { index, body: content }
}

/** 构建期读取全部已发布文章的索引，按发布时间倒序。 */
async function loadPublished(): Promise<Array<{ index: PostIndexItem; body: string }>> {
  const now = new Date()
  let entries: string[]
  try {
    entries = await fs.readdir(POSTS_DIR)
  } catch {
    // 内容目录尚未创建时返回空集合，页面渲染空状态而不是崩溃。
    return []
  }

  const files = entries.filter((name) => name.endsWith('.mdx') || name.endsWith('.md'))
  const results = await Promise.all(files.map((file) => readPostFile(file, now)))

  const seen = new Set<string>()
  const posts = results.filter((item): item is { index: PostIndexItem; body: string } => {
    if (!item) return false
    if (seen.has(item.index.slug)) {
      throw new Error(`[content] 重复的 slug：${item.index.slug}`)
    }
    seen.add(item.index.slug)
    return true
  })

  return posts.sort((a, b) => {
    const diff = new Date(b.index.publishedAt).getTime() - new Date(a.index.publishedAt).getTime()
    // 稳定次键，避免同日文章在分页时跳动
    return diff !== 0 ? diff : a.index.slug.localeCompare(b.index.slug)
  })
}

function normalizeQuery(query: PostQuery = {}): Required<Pick<PostQuery, 'page' | 'pageSize' | 'sort'>> &
  Omit<PostQuery, 'page' | 'pageSize' | 'sort'> {
  const page = Number.isFinite(query.page) && (query.page ?? 0) > 0 ? Math.floor(query.page as number) : 1
  const rawSize = Number.isFinite(query.pageSize) && (query.pageSize ?? 0) > 0
    ? Math.floor(query.pageSize as number)
    : DEFAULT_PAGE_SIZE
  const pageSize = Math.min(rawSize, MAX_PAGE_SIZE)
  const sort = query.sort === 'updated' || query.sort === 'featured' ? query.sort : 'published'

  return { ...query, page, pageSize, sort }
}

/**
 * 文章查询（设计 02 §3 / module 04 §3）。
 * 只返回已发布内容；未知参数忽略，非法排序回退默认值。
 */
export async function listPosts(query: PostQuery = {}): Promise<PostQueryResult> {
  const normalized = normalizeQuery(query)
  const all = await loadPublished()

  const keyword = normalized.q?.trim().toLowerCase()
  const filtered = all
    .map((item) => item.index)
    .filter((post) => {
      if (normalized.tag && !post.tags.includes(normalized.tag)) return false
      if (normalized.category && post.category !== normalized.category) return false
      if (!keyword) return true
      const haystack = [post.title, post.summary, post.category ?? '', ...post.tags]
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })

  const sorted = [...filtered].sort((a, b) => {
    if (normalized.sort === 'featured') {
      if (a.featured !== b.featured) return a.featured ? -1 : 1
    }
    const left = normalized.sort === 'updated' ? (a.updatedAt ?? a.publishedAt) : a.publishedAt
    const right = normalized.sort === 'updated' ? (b.updatedAt ?? b.publishedAt) : b.publishedAt
    const diff = new Date(right).getTime() - new Date(left).getTime()
    return diff !== 0 ? diff : a.slug.localeCompare(b.slug)
  })

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / normalized.pageSize))
  const page = Math.min(normalized.page, totalPages)
  const start = (page - 1) * normalized.pageSize

  return {
    items: sorted.slice(start, start + normalized.pageSize),
    total,
    page,
    pageSize: normalized.pageSize,
    totalPages,
  }
}

/** 读取单篇文章正文；未发布或不存在时返回 null（设计 03 §4 Not found）。 */
export async function getPostBySlug(slug: string): Promise<CompiledSource | null> {
  const all = await loadPublished()
  const found = all.find((item) => item.index.slug === slug)
  if (!found) return null

  const raw = await fs.readFile(
    path.join(POSTS_DIR, await findFileNameBySlug(slug)),
    'utf8',
  )
  const { data, content } = matter(raw)
  const parsed = postFrontmatterSchema.parse(data)

  return {
    frontmatter: parsed,
    body: content,
    readingTime: estimateReadingTime(content),
  }
}

async function findFileNameBySlug(slug: string): Promise<string> {
  const entries = await fs.readdir(POSTS_DIR)
  for (const name of entries) {
    if (!name.endsWith('.mdx') && !name.endsWith('.md')) continue
    const raw = await fs.readFile(path.join(POSTS_DIR, name), 'utf8')
    const { data } = matter(raw)
    if (data.slug === slug) return name
  }
  throw new Error(`[content] 找不到 slug 为 ${slug} 的文件`)
}

/** 标签计数，供发现页与统计页使用。 */
export async function listTags(): Promise<TaxonomyCount[]> {
  const all = await loadPublished()
  const counter = new Map<string, number>()
  for (const { index } of all) {
    for (const tag of index.tags) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1)
    }
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ slug: name, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** 分类计数。 */
export async function listCategories(): Promise<TaxonomyCount[]> {
  const all = await loadPublished()
  const counter = new Map<string, number>()
  for (const { index } of all) {
    if (!index.category) continue
    counter.set(index.category, (counter.get(index.category) ?? 0) + 1)
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ slug: name, name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export type PostRepository = {
  list(query?: PostQuery): Promise<PostQueryResult>
  getBySlug(slug: string): Promise<CompiledSource | null>
  listTags(): Promise<TaxonomyCount[]>
  listCategories(): Promise<TaxonomyCount[]>
}

/**
 * 文件型仓库实现。后续切换数据库正文源时，只需提供同一接口的另一实现，
 * 页面调用契约保持不变（设计 module 03 §5）。
 */
export const filePostRepository: PostRepository = {
  list: listPosts,
  getBySlug: getPostBySlug,
  listTags,
  listCategories,
}
