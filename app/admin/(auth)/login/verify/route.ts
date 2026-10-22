import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { completeLogin } from '../actions'

/**
 * 一次性令牌兑换（设计 16 §3.1、§6）。
 *
 * ## 为什么这里是 Route Handler 而不是页面
 *
 * 兑换成功后要**写会话 cookie**，而 Next.js 只允许在 Server Action 或
 * Route Handler 里修改 cookie。原先这里是一个 Server Component，在渲染
 * 过程中调用 `cookies().set()`，运行时直接抛：
 *
 *     Cookies can only be modified in a Server Action or Route Handler.
 *
 * 也就是说登录流程到最后一步必然 500 —— 令牌被消耗掉了，人却拿不到会话。
 *
 * 用 Route Handler 的额外好处：整件事就是一次 GET 重定向，不需要为「正在
 * 登录」再渲染一个中间页。
 *
 * ## 用 GET 是否违反「不用可被预取的 GET」这条约定
 *
 * 那条约定针对的是**退出登录**（以及请求发送登录链接）：被预取就等于被
 * 执行。而这里恰恰相反 —— 令牌已经在链接里，点开就是它的唯一用途；
 * 且令牌一次性、15 分钟过期，重复访问只会得到「无效」而不是第二次登录。
 *
 * ## 令牌不进客户端脚本
 *
 * 兑换在服务端完成，响应只是一条 307。令牌不会出现在任何 JS 请求体里。
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const next = request.nextUrl.searchParams.get('next')

  if (!token) {
    return NextResponse.redirect(new URL('/admin/login?error=missing', request.url))
  }

  const target = await completeLogin(token, next)

  const response = NextResponse.redirect(new URL(target, request.url))
  // 与后台口径一致：所有后台响应都不鼓励抓取。
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}
