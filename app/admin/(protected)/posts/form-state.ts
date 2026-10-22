/**
 * 编辑器表单的返回状态（设计 15 §8「保存/发布失败不丢失正文」）。
 *
 * 单独放在这里而不是 `actions.ts` 里，是因为 `'use server'` 文件**只允许
 * 导出 async 函数**——导出一个普通对象常量会在 `next build` 的
 * "Collecting page data" 阶段直接失败：
 *
 *     A "use server" file can only export async functions, found object.
 *
 * 类型与常量本身与「跑在服务端」无关，页面与客户端组件都要用它，所以放
 * 在这个中立模块里，服务端与客户端都能安全引入。
 */
export type PostFormState = {
  error: string | null
  /** 出错的字段名，用于把焦点/样式指到具体输入框。 */
  field: string | null
}

export const EMPTY_POST_FORM_STATE: PostFormState = { error: null, field: null }
