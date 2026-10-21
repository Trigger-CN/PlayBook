import 'server-only'

import { filePorts } from './adapters/file'
import { postgresPorts } from './adapters/postgres'
import type { DataPorts } from './ports'

export type { DataPorts } from './ports'
export type {
  ContentTotals,
  DailyStatPoint,
  InteractionPort,
  InteractionTargetRef,
  PopularItem,
  PostDetail,
  PostPort,
  PostQuery,
  PostQueryResult,
  PublicStats,
  SiteTotals,
  StatsPort,
  TimelinePort,
  ViewRecordInput,
} from './ports'

/**
 * 选择数据实现。
 *
 * 优先级：DATABASE_URL 存在 → PostgreSQL；否则 → 文件/种子。
 * 这样在没有数据库的环境里（CI、首次克隆）整站仍可构建与运行。
 *
 * 注意：这里不做连接探测。DATABASE_URL 配错时，错误会在第一次查询时以
 * 明确的信息抛出，而不是在模块加载阶段让整个构建失败。
 */
export function getDataPorts(): DataPorts {
  return hasDatabaseUrl() ? postgresPorts : filePorts
}

export function hasDatabaseUrl(): boolean {
  const url = process.env.DATABASE_URL
  return typeof url === 'string' && url.trim().length > 0
}

/** 当前驱动名，供页面在需要时展示数据来源说明。 */
export function currentDriver(): DataPorts['driver'] {
  return getDataPorts().driver
}
