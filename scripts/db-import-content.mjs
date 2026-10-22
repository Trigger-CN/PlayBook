#!/usr/bin/env node
/**
 * 把 content/posts/*.mdx 的正文导入数据库（posts.body，source = 'db'）。
 *
 * 用法：
 *   node scripts/db-import-content.mjs
 *   node scripts/db-import-content.mjs --dry-run
 *
 * 为什么需要这一步：文章正文迁库后，页面从 posts.body 读取。
 * 但作者仍然用 MDX 文件写作（后台在线编辑器尚未实现），
 * 所以需要一个「文件 → 数据库」的同步动作，而不是让页面同时猜两个来源。
 *
 * 语义：
 * - 以 slug 为键 upsert，可重复执行。
 * - 已存在且内容未变时跳过（不刷新 updated_at，避免每次导入都改"最后更新"）。
 * - 正文有变化时 version + 1。
 * - frontmatter 非法时直接失败并指出文件，绝不静默跳过（module 03 §3）。
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import matter from 'gray-matter'
import pg from 'pg'
import { z } from 'zod'

const { Client } = pg

const ROOT = process.cwd()
const POSTS_DIR = path.join(ROOT, 'content', 'posts')

const dryRun = process.argv.slice(2).includes('--dry-run')

/** 与 lib/content/schema.ts 的 postFrontmatterSchema 保持一致。 */
const frontmatterSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只能是 kebab-case'),
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

function fail(message) {
  console.error(`[import] ${message}`)
  process.exit(1)
}

/** 与 lib/content/repository.ts 的 estimateReadingTime 同一口径。 */
function estimateReadingTime(body) {
  const cjk = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const words = (body.match(/[A-Za-z0-9]+/g) ?? []).length
  return Math.max(1, Math.ceil((cjk + words * 1.6) / 350))
}

async function readPosts() {
  let entries
  try {
    entries = await readdir(POSTS_DIR)
  } catch (error) {
    fail(`无法读取内容目录 ${POSTS_DIR}：${error.message}`)
  }

  const files = entries.filter((name) => name.endsWith('.mdx') || name.endsWith('.md')).sort()
  const posts = []
  const seen = new Set()

  for (const fileName of files) {
    const raw = await readFile(path.join(POSTS_DIR, fileName), 'utf8')
    const { data, content } = matter(raw)

    const parsed = frontmatterSchema.safeParse(data)
    if (!parsed.success) {
      fail(
        `${fileName} 的 frontmatter 校验失败：` +
          parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '),
      )
    }

    const frontmatter = parsed.data

    if (frontmatter.cover && !frontmatter.coverAlt) {
      fail(`${fileName} 存在 cover 但缺少 coverAlt`)
    }
    if (seen.has(frontmatter.slug)) {
      fail(`重复的 slug：${frontmatter.slug}`)
    }
    seen.add(frontmatter.slug)

    posts.push({
      slug: frontmatter.slug,
      title: frontmatter.title,
      summary: frontmatter.summary,
      cover: frontmatter.cover ?? null,
      coverAlt: frontmatter.coverAlt ?? null,
      tags: frontmatter.tags,
      category: frontmatter.category ?? null,
      featured: frontmatter.featured,
      readingTime: estimateReadingTime(content),
      body: content,
      status: frontmatter.draft ? 'draft' : 'published',
      publishedAt: frontmatter.publishedAt,
      updatedAt: frontmatter.updatedAt ?? null,
    })
  }

  return posts
}

function loadConnectionString() {
  const url = process.env.DATABASE_URL
  if (!url || url.trim().length === 0) {
    fail('缺少 DATABASE_URL。示例：postgres://user:pass@127.0.0.1:5432/playbook')
  }
  return url.trim()
}

async function main() {
  const posts = await readPosts()
  console.log(`[import] 读取到 ${posts.length} 篇文章`)

  if (dryRun) {
    for (const post of posts) {
      console.log(`[import] 将写入 ${post.slug}（${post.status}，正文 ${post.body.length} 字符）`)
    }
    return
  }

  const client = new Client({
    connectionString: loadConnectionString(),
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
    application_name: 'playbook-import',
  })
  await client.connect()

  let inserted = 0
  let updated = 0
  let skipped = 0

  try {
    await client.query('begin')
    // 显式告诉触发器：本次事务里的 updated_at 是作者的真实编辑日期，不要覆盖成 now()。
    // 否则每跑一次导入，所有文章的「更新于」都会变成导入当天（实测发现的缺陷）。
    await client.query("set local app.preserve_updated_at = 'on'")
    for (const post of posts) {
      const { rows } = await client.query(
        `select id, body, version, title, summary, tags, category, featured,
                cover_url, cover_alt, status, published_at, source,
                to_char(updated_at, 'YYYY-MM-DD') as updated_at_text
           from public.posts where slug = $1`,
        [post.slug],
      )
      const existing = rows[0]

      // 后台在线编辑过的文章（source = 'admin'）跳过：数据库是它的权威来源。
      // 不做这个判断的话，跑一次导入就会用 MDX 文件静默覆盖网页上写的正文 ——
      // 而且从输出里看不出发生过什么。要拿回文件版本，先在后台把该文删除或
      // 手工把 source 改回 'db'，让作者显式选择权威来源。
      if (existing?.source === 'admin') {
        skipped += 1
        console.log(`[import] 跳过 ${post.slug}（正文来自后台在线编辑，不用文件覆盖）`)
        continue
      }

      if (!existing) {
        await client.query(
          `insert into public.posts
             (slug, title, summary, cover_url, cover_alt, tags, category, featured,
              reading_time, body, source, status, published_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'db',$11,$12,$13)`,
          [
            post.slug,
            post.title,
            post.summary,
            post.cover,
            post.coverAlt,
            post.tags,
            post.category,
            post.featured,
            post.readingTime,
            post.body,
            post.status,
            post.publishedAt,
            post.updatedAt,
          ],
        )
        inserted += 1
        console.log(`[import] 新增 ${post.slug}`)
        continue
      }

      // 内容未变则跳过，避免每次导入都刷新 version。
      // 注意：updated_at 也纳入比较 —— 它可能被触发器或手工改错，
      // 若不计入，导入就永远无法把「更新于」修回 frontmatter 的真实编辑日期。
      // 已在 SQL 侧用 to_char 取出 YYYY-MM-DD，不做任何时区换算。
      const existingUpdatedAt = existing.updated_at_text ?? null
      const same =
        existing.body === post.body &&
        existing.title === post.title &&
        (existing.summary ?? '') === post.summary &&
        (existing.category ?? null) === post.category &&
        existing.featured === post.featured &&
        (existing.cover_url ?? null) === post.cover &&
        (existing.cover_alt ?? null) === post.coverAlt &&
        existing.status === post.status &&
        existingUpdatedAt === post.updatedAt &&
        JSON.stringify(existing.tags ?? []) === JSON.stringify(post.tags)

      if (same) {
        skipped += 1
        continue
      }

      await client.query(
        `update public.posts set
           title = $2, summary = $3, cover_url = $4, cover_alt = $5, tags = $6,
           category = $7, featured = $8, reading_time = $9, body = $10,
           source = 'db', status = $11, published_at = $12, updated_at = $13,
           version = version + 1
         where slug = $1`,
        [
          post.slug,
          post.title,
          post.summary,
          post.cover,
          post.coverAlt,
          post.tags,
          post.category,
          post.featured,
          post.readingTime,
          post.body,
          post.status,
          post.publishedAt,
          post.updatedAt,
        ],
      )
      updated += 1
      console.log(`[import] 更新 ${post.slug}`)
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    fail(`导入失败（已回滚）：${error.message}`)
  } finally {
    await client.end()
  }

  console.log(`[import] 完成：新增 ${inserted}，更新 ${updated}，跳过 ${skipped}`)
}

main().catch((error) => fail(error.message))
