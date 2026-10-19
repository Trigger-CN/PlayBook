# 后台管理框架设计

## 1. 页面目标

为所有 `/admin/*` 页面提供管理员认证守卫、统一外壳、导航和一致的操作环境。后台面向重复工作，强调安静、紧凑、可扫描，不沿用公开首页的大型 Hero 构图。登录页细节见 [登录页设计](16-admin-login.md)。

- 路由：`/admin/*`（登录页 `/admin/login` 见 16 号文档）
- 阶段：Phase 8
- 对应需求：`REQ-ADMIN-001`、`REQ-ADMIN-008`、`REQ-SEC-005/006`

## 2. 布局设计

### 2.1 桌面框架

- 左侧固定导航：概览、文章、时间轴、评论、分析、设置；当前项使用 `aria-current="page"`。
- 顶部栏：当前页面标题、面包屑（可选）、全局搜索（后续）、查看站点、账户菜单。
- 主内容区使用稳定宽度和紧凑间距，表格与列表优先。
- 高风险操作不放在全局顶部栏，只出现在对应页面内。

### 2.2 移动端框架

- 左栏变为可关闭抽屉，顶部保留页面标题和菜单按钮。
- 抽屉打开后焦点限制在内部、背景不可交互、锁定滚动，关闭后焦点回到触发按钮。
- 表格页面按各自文档转为列表或可控横向容器。

### 2.3 登录页

登录页拥有独立布局，仅呈现认证所需信息，详细设计见 [登录页设计](16-admin-login.md)。

## 3. 功能设计

### 3.1 认证

- 使用 Supabase Auth 管理会话。
- MVP 可限制到 `ADMIN_EMAIL` 或管理员角色表。
- 支持魔法链接或受控 OAuth；不自建密码存储。
- 登录成功只允许跳回同源、白名单后台路径，防止开放重定向。

### 3.2 权限守卫

- Middleware 仅做快速会话检查；每个 Server Action/Route Handler 再做服务端授权。
- 未登录跳转 `/admin/login?next=...`。
- 已登录但无管理员角色返回 403，不显示后台框架。
- 服务端密钥只在 server-only 模块使用。

### 3.3 会话与账户

- 顶部账户菜单展示当前管理员、查看站点和退出。
- 会话过期时保留未提交表单的本地草稿（可行时），提示重新登录。
- 退出通过 POST/Server Action，不使用可被预取的 GET 链接。

### 3.4 导航

- 根据当前 pathname 标记 active。
- 可展示待审核评论 badge，但需要限制频繁请求。
- 键盘可遍历，移动抽屉支持 Escape 关闭。

### 3.5 统一页面外壳能力

后台各功能页共享同一外壳契约，避免每页重复实现：

- 页面标题区：标题、可选副标题/更新时间、页面级操作区。
- 加载态：`loading.tsx` 提供与内容同尺寸的骨架，避免 CLS。
- 错误态：`error.tsx` 提供重试与安全返回路径，不显示 SQL/堆栈/密钥。
- 权限错误使用专门边界，不渲染后台框架。
- 每个后台路由 `noindex,nofollow`，robots 禁止抓取 `/admin`。

## 4. 状态设计

- **Checking session**：避免先渲染后台再闪回登录。
- **Login sending**：锁定提交，保持按钮宽度。
- **Invalid/expired link**：清楚说明并允许重新发送。
- **Forbidden**：显示无权限，不泄漏资源内容。
- **Session expired**：模态或页面提示重新认证，不静默丢失操作。
- **Navigation pending**：页面标题区提供轻量进度，不遮挡全页。

## 5. 数据与安全边界

- Supabase `auth.users` 保存身份；管理员授权来源可为环境变量或 `profiles.role`。
- 客户端只使用 anon key；service role 永不下发。
- 所有后台表开启 RLS，管理员策略不能仅靠隐藏 UI。
- 记录重要后台操作审计事件：审核、删除、发布、设置变更。

## 6. 实现技术要点

- 使用 `app/admin/layout.tsx` 作为受保护 Server Component 外壳。
- `middleware.ts` 刷新 Supabase session cookie，但最终权限在服务端函数校验。
- 创建 `requireAdmin()` server-only helper，供页面、Action 和 Handler 统一调用。
- 后台导航可为 Server Component；抽屉、账户菜单为小型 Client Component。
- 每个后台路由提供 `loading.tsx`、`error.tsx`；权限错误使用专门边界。
- 使用 `noindex,nofollow`，并在 robots 中禁止抓取 `/admin`。

## 7. 可访问性

- 登录表单拥有完整 label、autocomplete 和错误关联。
- 后台导航使用 `<nav aria-label="后台导航">`。
- 当前项使用 `aria-current="page"`。
- 抽屉处理焦点锁定、Escape、背景不可交互和滚动锁定。
- 图标按钮有 tooltip 和可访问名称。

## 8. 验收标准

- 未登录和非管理员无法访问任一后台页面或接口。
- 会话刷新、退出和过期处理正确。
- 桌面/移动导航可操作，当前路由标记正确。
- 后台不暴露 service role、敏感统计或未授权内容。
- 所有后台页面可继承统一 loading、error 和 noindex 策略。
