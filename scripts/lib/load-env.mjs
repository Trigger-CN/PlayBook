/**
 * 让 scripts/ 下的工具也能读到 .env.local。
 *
 * ## 为什么需要这个文件
 *
 * Next.js 会自动加载 .env.local，但那是 Next 的运行时行为，不是 Node 的。
 * `node scripts/db-migrate.mjs` 走纯 Node，看不到那个文件。
 *
 * 于是有一个很具体的陷阱：按文档配好 .env.local、`npm run dev` 一切正常，
 * 换台机器跑 `npm run db:migrate` 却得到「缺少 DATABASE_URL」。两条命令读的
 * 不是同一个东西，而错误信息指向「配置缺失」，把人引向已经配好的文件。
 *
 * 真正的后果不是这句报错，而是迁移没跑成却以为跑过了：dev server 连上一个
 * 空库，每个读库的页面都 500（relation "public.posts" does not exist）。
 *
 * ## 三条边界
 *
 * 1. 不覆盖已有的环境变量。CI 里显式传入的值必须胜过文件内容。
 * 2. 不打印任何值。连键名都不打印，避免日志里出现配置指纹。
 * 3. 文件不存在是正常的，静默跳过。
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

/** 与 Next.js 一致的优先级（高到低）；test 环境下 Next 会跳过 .env.local，这里同样。 */
function candidates() {
  const nodeEnv = process.env.NODE_ENV ?? 'development'
  const files = []
  if (nodeEnv !== 'test') files.push(`.env.${nodeEnv}.local`, '.env.local')
  files.push(`.env.${nodeEnv}`, '.env')
  return files
}

/**
 * 解析一行 KEY=VALUE。
 *
 * 成对引号包裹的值去掉引号，且不处理行内注释 —— 口令与连接串里可能有 #。
 * 未加引号的值才把「空格 + #」之后当注释，与 dotenv 的习惯一致。
 */
function parseLine(raw) {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.startsWith('#')) return null

  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null

  const key = trimmed.slice(0, eq).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null

  let value = trimmed.slice(eq + 1).trim()
  const quote = value[0]

  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    value = value.slice(1, -1)
  } else {
    const comment = value.indexOf(' #')
    if (comment >= 0) value = value.slice(0, comment).trim()
  }

  return { key, value }
}

for (const file of candidates()) {
  let text
  try {
    text = readFileSync(path.join(ROOT, file), 'utf8')
  } catch {
    continue
  }

  for (const line of text.split(/\r?\n/)) {
    const entry = parseLine(line)
    if (!entry) continue
    if (process.env[entry.key] !== undefined) continue
    process.env[entry.key] = entry.value
  }
}
