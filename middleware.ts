import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware：后台路径的快速会话检查 + 统一的 noindex 响应头（设计 08 §3.2、D-09）。
 *
 * ## 这个 middleware 不是安全边界
 *
 * 它**只**做两件事：
 * 1. 对 `/admin/*`（登录页除外）检查会话 cookie 是否**存在**。没有就直接跳到
 *    登录页，省掉一次服务端渲染。
 * 2. 给后台响应补 `X-Robots-Tag`，作为页面 metadata 的第二道保险。
 *
 * 真正的授权判定在 `app/admin/layout.tsx` 的 `requireAdmin()` 与每个 Server
 * Action 里各做一次。原因是 middleware 无法查库（Edge 运行时，且我们不想在
 * 每个请求上多一次数据库往返），因此它**只能**验证 cookie 存在，不能验证
 * cookie 有效。把安全边界放在这里会得到一个「看起来有守卫、实际可以被伪造
 * cookie 绕过」的假保护。
 *
 * ## 为什么不能在这里 import 任何 server-only 模块
 *
 * middleware 跑在 Edge 运行时。`lib/auth/admin.ts` 带 `import 'server-only'`
 * 且依赖 `pg` 与 `node:crypto`，在这里引用会直接构建失败。因此 cookie 名
 * 在这里**重复写一次**，并用一条注释指向唯一来源，而不是引入整个模块。
 */

/** 与 lib/auth/admin.ts 的 ADMIN_SESSION_COOKIE 保持一致（该模块无法在此引入）。 */
const ADMIN_SESSION_COOKIE = 'playbook-admin'

/** 登录相关路径必须放行，否则登录页自己会被重定向成死循环。 */
const ADMIN_PUBLIC_PATHS = ['/admin/login']

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // 只处理后台路径。公开页面的 noindex 由各自 metadata 决定，
  // 不在这里统一加头，避免误伤需要索引的内容。
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  const isPublicAdminPath = ADMIN_PUBLIC_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (!isPublicAdminPath && !request.cookies.has(ADMIN_SESSION_COOKIE)) {
    const loginUrl = new URL('/admin/login', request.url)
    // 只带 pathname + search，不带完整 URL：避免把外部来源拼进 next 参数，
    // 也避免产生开放重定向的入口。safeAdminRedirect 会再校验一次。
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next()
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export const config = {
  /**
   * 只匹配后台路径。
   *
   * 刻意不用宽泛的 `/((?!_next).*)`：那会让每个公开请求都过一次 middleware，
   * 而公开页面是静态生成的，多这一跳只增加延迟、不增加任何能力。
   */
  matcher: ['/admin/:path*'],
}
