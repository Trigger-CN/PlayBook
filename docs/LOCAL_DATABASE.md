# 本地数据库

本项目默认**不需要数据库**就能构建和运行：文章从 `content/posts/*.mdx` 读取，时间轴用种子数据，点赞/评论/浏览量等互动接口会显式返回「需要数据库」。

要让互动功能、统计、后台真正可用，需要一套 PostgreSQL。本文说明如何用一条命令把它搭起来。

---

## 1. 三条命令

```bash
npm run db:setup     # 首次：装二进制、建数据目录、建库（约 20–60 秒）
npm run db:start     # 每次开机后：启动（后台常驻，关掉终端也不停）
npm run db:stop      # 不用时：停止
```

`db:setup` 结束时会把需要写进 `.env.local` 的两行直接打印出来。

`db:start` 的「就绪」以**真实 SQL 查询**（`select 1`）为准，不是「端口在监听」—— 端口能连上不等于数据库能服务查询，这两件事在崩溃恢复被打断后会分家。

双击 `start-dev.bat` 也会带上数据库：它先 `db:stop` 再 `db:start`（干净重启），然后才起 dev server。若本地库从未 `db:setup` 过，这一步会被跳过并照常启动站点——文件模式下页面仍可浏览，只是点赞、评论与后台不可用。

### 环境变量

在项目根目录新建 `.env.local`（该文件已被 `.gitignore` 排除，不会进仓库）：

```bash
DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/playbook"
INTERACTION_HASH_SALT="换成一串足够长的随机字符"
ADMIN_EMAIL="你的邮箱"
```

| 变量 | 作用 | 留空的后果 |
| --- | --- | --- |
| `DATABASE_URL` | 连接串 | 整站回退到文件/种子模式，互动功能不可用 |
| `INTERACTION_HASH_SALT` | 把 IP / UA / 邮箱变成不可逆哈希；**同时就是后台登录口令** | 用进程内随机盐：不泄漏原始值，但**每次重启后哈希都不同**，限流与去重效果重置；后台也同时关闭（没有口令） |
| `ADMIN_EMAIL` | 后台登录账号，逗号分隔可写多个 | **整个后台关闭**（刻意的安全默认值） |

生成随机盐：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 建表与导入文章

```bash
npm run db:migrate     # 建表（9 个迁移；Supabase 专有的 RLS 迁移会自动跳过）
npm run db:import      # 把 content/posts/*.mdx 同步进 posts 表
npm run db:health      # 自检：连通性、版本、迁移清单、核心表与函数
```

然后 `npm run dev`。

---

## 2. 这套环境是什么

`db:setup` 用 npm 包 `embedded-postgres` 把**上游官方的 PostgreSQL 二进制**装到 `.me/pg/node_modules`，再用它自带的 `initdb` 建数据目录 `.me/pg/pgdata`。

- **它是真库，不是模拟器**：实测 PostgreSQL 18.4，SQL 行为与装了一个原生 PostgreSQL 完全一致。
- **不进项目依赖**：`package.json` 的 `dependencies` 不受影响，`npm install` 不会拉它。卸载时删掉 `.me/pg` 即可。
- **数据在 `.me/pg/pgdata`**，`.me/` 已在 `.gitignore` 里。换台机器重跑 `db:setup` + `db:migrate` + `db:import` 就能复原，不依赖任何未提交的状态。

### 安全边界（刻意的）

- 只监听 `127.0.0.1`，不对外暴露。
- 口令固定为 `postgres` —— 这是**本机开发**凭据，不是可复用的秘密。任何部署环境都必须换成真实强口令，并设置 `DATABASE_SSL="require"`（多数托管库要求 TLS）。
- `db:setup` 只做与角色无关的事；Supabase 专有的 RLS 策略在自建库上会被自动跳过。

---

## 3. 换端口

5432 被别的 PostgreSQL 占用时：

```bash
PGPORT=5433 npm run db:setup     # Windows PowerShell: $env:PGPORT=5433; npm run db:setup
```

端口写在 `postgresql.conf` 末尾，`db:start` 会从那里读回来，因此两条命令不需要传同一个 `PGPORT`。记得把 `DATABASE_URL` 里的端口也改掉。

---

## 4. 常见问题

**`spawn EINVAL`** —— Node 20 起不允许直接 spawn `.cmd`。已在 `db-setup.mjs` 里用 `shell: true` 处理；若你改了脚本，注意这一点。

**`db:start` 看起来卡住不还提示符** —— 已修复。原因是在 Windows 上 `pg_ctl` 启动的 postgres 会继承父进程的输出管道，`execFile` 的 Promise 永不 resolve，而数据库其实已经起来了。现在改用 `spawn` + `stdio: 'ignore'`，并用真实 SQL 查询判断就绪。

**`db:start` 报「启动超时」** —— 看 `.me/pg/server.log` 末尾。常见原因：5432 被占用（换端口）、数据目录损坏（删 `.me/pg` 重跑 `db:setup`）。

**连接超时：`Connection terminated due to connection timeout`（端口开着却连不上）** —— 实例的崩溃恢复中途被打断时，postmaster 会死掉，但它 fork 出的后台 worker 会活下来并**继承监听 socket**：端口依然 TCP 可连（连接被内核 accept 队列接住），却没有任何进程去 accept，于是每个查询都挂到超时。这种状态 `pg_ctl status`（只看 pid 文件）和端口探测都看不出来。

现在 `db:start` 会自动识别并清理它（结束孤儿进程 + 删除陈旧 `postmaster.pid`）后重新启动，所以通常再跑一次 `npm run db:start` 就恢复了。如果它报「端口 5432 上仍有未能清理的进程」，说明占端口的是非 postgres 程序或另一个实例 —— 脚本不会替你杀掉别人的进程，需要手工处理：`Get-NetTCPConnection -LocalPort 5432 -State Listen` 查 PID。

**想彻底重来** —— `npm run db:stop`，删除 `.me/pg`，重新 `npm run db:setup && npm run db:start && npm run db:migrate && npm run db:import`。

**改了 MDX 但页面没变** —— 有数据库时文章正文读的是 `posts.body`，不是文件。跑 `npm run db:import`。这是刻意的设计：让页面同时猜两个来源会制造「改了文件但页面没变」的静默不一致。

**评论提交后看不到** —— 新评论默认 `pending`，需要在 `/admin/comments` 审核通过。后台需要 `ADMIN_EMAIL` 与 `INTERACTION_HASH_SALT` 才能登录，会话记在 `admin_sessions`。

---

## 5. 与 Supabase 的关系

Supabase 底层就是 PostgreSQL。把 `DATABASE_URL` 指向 Supabase 的**直连**连接串（session / direct，不是 pooler 事务模式），本项目的迁移与查询层同样可用。

`supabase/migrations/` 是唯一来源，自建库与 Supabase 共用同一套 SQL；`db-migrate.mjs` 靠能力探测决定是否应用 Supabase 专有部分（`_rls_policies.sql`）。因此将来切到 Supabase 不需要重写迁移。

注意：`20261021000002_rls_policies.sql` **从未在真实 Supabase 上执行过**（当前无项目凭据），只做过静态审查。

---

## 6. 相关脚本

| 命令 | 作用 |
| --- | --- |
| `npm run db:setup` | 装二进制 + 建数据目录 + 建库 |
| `npm run db:start` | 启动（后台常驻） |
| `npm run db:stop` | 停止 |
| `npm run db:migrate` | 应用迁移（幂等） |
| `npm run db:migrate:dry` | 只列出会应用哪些迁移 |
| `npm run db:seed` | 迁移后写入 `supabase/seed.sql` |
| `npm run db:import` | MDX → `posts.body`（幂等，内容未变则跳过） |
| `npm run db:import:dry` | 只报告会新增/更新/跳过哪些文章 |
| `npm run db:aggregate` | 每日统计聚合（`--date` 单日 / `--days N` 回填） |
| `npm run db:health` | 连通性 + 版本 + 迁移清单 + schema 自检 |
