import 'server-only'

import { getDataPorts, hasDatabaseUrl } from '@/lib/data'
import type { LikeState, PublicComment, TargetType } from '@/lib/interactions/types'

/**
 * 互动数据的服务端预取（设计 module 07 §4.1、06 §4）。
 *
 * 为什么单独抽出来：
 * 详情页是 Server Component，互动数据必须在服务端拿到，才能
 * 让点赞按钮与评论列表在首屏就是正确状态，而不是先渲染 0 再跳变。
 *
 * 无数据库时返回 null，页面据此把互动区渲染为「不可用但可见」，
 * 而不是抛错让整页 500（决策 D-12 决策二）。
 */

export type InteractionSnapshot = {
  likes: LikeState | null
  comments: PublicComment[]
  commentTotal: number
  enabled: boolean
}

export async function loadInteractionSnapshot(
  type: TargetType,
  id: string,
): Promise<InteractionSnapshot> {
  if (!hasDatabaseUrl()) {
    return { likes: null, comments: [], commentTotal: 0, enabled: false }
  }

  const ports = getDataPorts()

  // 并行取：三者互不依赖。访客身份在这里不读取 ——
  // 读取 cookie 会让该路由退化为 Dynamic，而 liked 状态由客户端 GET 补。
  const [likes, comments, commentTotal] = await Promise.all([
    ports.interactions.getLikeState({ type, id }, null),
    ports.interactions.listApprovedComments({ type, id }, 50),
    ports.interactions.countApprovedComments({ type, id }),
  ])

  return { likes, comments, commentTotal, enabled: true }
}
