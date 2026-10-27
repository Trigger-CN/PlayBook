import 'server-only'

import { randomBytes } from 'node:crypto'

/**
 * 文章 slug 与时间轴节点 ID 的生成规则（决策 D-31）。
 *
 * ## 为什么不再让用户手填
 *
 * 用户要写的是内容，不是网址。要求人自己想一个「小写字母、数字与连字符」的串，
 * 结果只有三种：与内容无关的占位词、从别处复制来的重复词，或者第一次撞上
 * 唯一约束才知道要改。这三件事都不该由写字的人承担。
 *
 * ## 为什么是「前缀 + 随机」而不是标题转写
 *
 * 标题是中文。「把个人网站做成一台可玩的记录机」经任何 slugify 都只剩空串，
 * 或者变成一串拼音。前者不合法（数据库的 posts_slug_check 会直接拒绝），
 * 后者既难读又容易撞。
 *
 * 随机串没有这个问题，而且**创建后永不变更** —— 标题随便改，已有链接都不会失效。
 * 这是把 slug 与标题解耦带来的直接好处：改标题是编辑行为，换网址是破坏行为，
 * 两者本来就不该绑在一起。
 *
 * ## 为什么是 12 位十六进制
 *
 * 48 位随机 = 2.8×10^14 个取值。按生日界，要在一张表里堆到约 2000 万行
 * 才有 50% 的碰撞概率 —— 个人站几十年都到不了这个量级。
 * 长度上 `post-` 加 12 位共 17 字符，放进 URL 仍然读得下去。
 *
 * ## 唯一性不靠概率
 *
 * 这里只负责给出一个候选值。真正的保证是数据库的 unique / primary key 约束，
 * 配合 `on conflict do nothing` 让「撞了就换一个」在一条语句里原子完成 ——
 * 不存在「先查再插」之间被人插一脚的窗口。见 upsertPost 与 upsertTimelineItem。
 */

const RANDOM_HEX_LENGTH = 12

function randomHex(length: number): string {
  // hex 是每字节 2 个字符，多取一字节再截断，不把长度写死成偶数假设。
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length)
}

/** 文章 slug，形如 `post-3f9a2b1c5d7e`。 */
export function createPostSlug(): string {
  return `post-${randomHex(RANDOM_HEX_LENGTH)}`
}

/** 时间轴节点 ID，形如 `tl-3f9a2b1c5d7e`。 */
export function createTimelineId(): string {
  return `tl-${randomHex(RANDOM_HEX_LENGTH)}`
}
