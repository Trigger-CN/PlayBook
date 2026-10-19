import { z } from 'zod'

import { COMMENT_MAX_LENGTH, COMMENT_NAME_MAX_LENGTH, TARGET_TYPES } from './types'

/**
 * 互动输入校验（设计 module 06 §3）。
 * 客户端与服务端共用同一 schema，但服务端必须重新执行。
 */
export const commentInputSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().min(1).max(200),
  authorName: z
    .string()
    .trim()
    .min(1, '请填写昵称')
    .max(COMMENT_NAME_MAX_LENGTH, `昵称不能超过 ${COMMENT_NAME_MAX_LENGTH} 字`),
  authorEmail: z.string().trim().email('邮箱格式不正确').optional().or(z.literal('')),
  content: z
    .string()
    .trim()
    .min(1, '请填写评论内容')
    .max(COMMENT_MAX_LENGTH, `评论不能超过 ${COMMENT_MAX_LENGTH} 字`),
  turnstileToken: z.string().optional(),
})

export type CommentInput = z.infer<typeof commentInputSchema>

export const likeTargetSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().min(1).max(200),
})

export type LikeTargetInput = z.infer<typeof likeTargetSchema>

/** 浏览量上报（设计 module 08 §6）：path 必须是同源规范路径。 */
export const viewInputSchema = z.object({
  path: z.string().startsWith('/', 'path 必须是站内路径').max(300),
  targetType: z.enum(TARGET_TYPES).optional(),
  targetId: z.string().max(200).optional(),
})

export type ViewInput = z.infer<typeof viewInputSchema>
