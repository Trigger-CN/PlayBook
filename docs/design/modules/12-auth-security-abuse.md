# 认证、安全与防刷模块设计

## 1. 模块职责

提供管理员认证与授权、Supabase RLS、服务端密钥隔离、公开互动限流、验证码、隐私标识和审计。安全规则必须在服务端和数据库生效，不能依赖隐藏按钮。

## 2. 信任边界

- 浏览器输入、cookie、visitor_id、URL、文件和验证码 token 均不可信。
- Next Server Component/Action/Route Handler 是应用服务边界。
- Supabase RLS 是数据库最终边界。
- service role 只在 server-only 模块，永不发往客户端或日志。
- Cloudflare/Vercel 限流是辅助，不能替代业务唯一约束。

## 3. 认证与授权

- 管理员使用 Supabase Auth。
- `requireAdmin()` 验证当前用户和角色，所有后台页面、Action、Handler 调用。
- Middleware 只做会话刷新/粗守卫，不能成为唯一授权。
- 管理员角色来源明确：环境 allowlist 或 profiles/admin_users 表。
- 高风险操作可要求近期重新认证。

## 4. RLS 策略

- posts/timeline：匿名只读 published；管理员 CRUD。
- comments：匿名公开只读 approved；提交优先经服务端，管理员审核。
- likes：匿名不直接任意查询/写全表，服务端接口控制。
- page_views：只允许服务端写，不公开原始记录。
- stats：公开只读安全聚合；后台细分仅管理员。
- Storage：公开读取发布资源，上传/删除受管理员或签名限制。

策略需要自动化测试匿名、普通登录和管理员三种角色。

## 5. 公开接口防刷

| 接口 | 控制 |
| --- | --- |
| 评论 | 长度/频率、Turnstile、目标校验、纯文本转义 |
| 点赞 | visitor 唯一约束、IP 辅助限流、幂等 |
| 浏览量 | 时间窗去重、同源 path、机器人/频率过滤 |
| 上传 | 管理认证、mime/大小/像素、签名路径 |
| 搜索 | query/pageSize 上限、缓存、请求频率 |

限流 key 可组合 IP hash、visitor、用户、目标和 endpoint；错误响应避免泄漏内部阈值。

## 6. 隐私数据

- 不存明文 IP；使用带服务端 salt 的 hash。
- User-Agent 和 referrer 只保留最小业务粒度。
- 邮箱按用途哈希/加密，绝不公开。
- 定义原始浏览/安全事件保留期和清理任务。
- 日志中去除 token、cookie、Authorization、验证码、预览 URL。

## 7. 输入与输出安全

- 所有输入共享 Zod schema，但服务端必须执行。
- 评论纯文本输出转义；数据库 Markdown 需 sanitize。
- URL 协议白名单 http/https/mailto（按字段），拒绝 javascript/data。
- 文件名不可用于直接路径，防目录穿越。
- JSON-LD/脚本数据使用安全序列化。
- 错误对用户简洁，对服务端使用 request id 记录详情。

## 8. 审计与告警

记录管理员登录、审核、发布、删除、设置、导出和权限变化。审计日志包括 actor、action、target、时间、结果和受控 metadata，不写敏感正文/密钥。

告警：频繁登录失败、异常接口速率、聚合/备份失败、service role 配置错误。告警不能自动公开封禁用户。

## 9. 实现技术要点

- server-only 模块封装 Supabase admin client、hash salt 和 `requireAdmin()`。
- 使用 CSP、frame-ancestors、nosniff、referrer-policy 等安全头。
- Mutation 使用 POST/DELETE/Server Action，防 CSRF；检查同源和框架默认保护。
- Turnstile 在服务端向官方接口验证 hostname/action。
- 数据库唯一约束、check constraint 和 RLS 作为应用校验后的第二层。
- 依赖定期更新，CI 运行 secret scan 和安全测试。

## 10. 验收标准

- 匿名/非管理员无法访问后台数据与写接口。
- service role、salt、token 不进入客户端 bundle/日志。
- 评论、点赞、浏览、上传限流和数据库约束有效。
- 公开响应不含 IP/邮箱/visitor 等敏感字段。
- 关键后台操作有审计，RLS 角色测试通过。
