#!/usr/bin/env node
/**
 * 每日统计聚合与回填（设计 module 09 §5）。
 *
 * 用法：
 *   node scripts/db-aggregate.mjs              # 聚合昨天
 *   node scripts/db-aggregate.mjs --days 30    # 回填最近 30 天
 *   node scripts/db-aggregate.mjs --date 2026-07-17
 *
 * 幂等性：底层函数用绝对值 upsert，重复跑同一日期得到同一结果。
 * 因此可以安全地在 cron 里重跑，也可以用来修正迟到事件。
 */

import process from 'node:process'

import pg from 'pg'

const args = process.argv.slice(2)

function readOption(name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  return args[index + 1] ?? null
}

function fail(message) {
  console.error(`[aggregate] ${message}`)
  process.exit(1)
}

function loadConnectionString() {
  const url = process.env.DATABASE_URL
  if (!url || url.trim().length === 0) {
    fail('缺少 DATABASE_URL。示例：postgres://user:pass@127.0.0.1:5432/playbook')
  }
  return url.trim()
}

async function main() {
  const client = new pg.Client({
    connectionString: loadConnectionString(),
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
    application_name: 'playbook-aggregate',
  })
  await client.connect()

  try {
    const dateArg = readOption('--date')
    const daysArg = readOption('--days')

    if (dateArg) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) fail(`--date 格式应为 YYYY-MM-DD，收到 ${dateArg}`)
      const { rows } = await client.query('select public.aggregate_daily_stats($1::date) as d', [
        dateArg,
      ])
      console.log(`[aggregate] 已聚合 ${rows[0].d}`)
    } else {
      const days = daysArg ? Number(daysArg) : 1
      if (!Number.isFinite(days) || days < 1) fail(`--days 必须是正整数，收到 ${daysArg}`)
      const { rows } = await client.query('select public.backfill_daily_stats($1) as n', [days])
      console.log(`[aggregate] 已回填 ${rows[0].n} 天`)
    }

    // 打印最近几天的聚合结果，便于核对口径。
    const { rows: recent } = await client.query(
      `select to_char(date,'YYYY-MM-DD') as date, views_count, likes_count,
              comments_count, posts_count, timeline_count
         from public.site_daily_stats
        order by date desc
        limit 5`,
    )
    console.log('[aggregate] 最近聚合结果：')
    for (const row of recent) {
      console.log(
        `  ${row.date}  浏览 ${row.views_count}  赞 ${row.likes_count}  评论 ${row.comments_count}` +
          `  文章 ${row.posts_count}  时间轴 ${row.timeline_count}`,
      )
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => fail(error.message))
