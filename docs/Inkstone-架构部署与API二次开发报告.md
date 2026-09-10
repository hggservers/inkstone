# Inkstone 笔记站架构、部署实施与 API 二次开发报告

## 1. 项目概况

Inkstone 是一个可自行托管的 Markdown 笔记系统。当前实例部署在 Cloudflare，正式访问地址为：

- 自定义域名：`https://note.zhouhua.net`
- Workers 默认域名：`https://inkstone.cntjpu.workers.dev`
- 源代码仓库：`https://github.com/hggservers/inkstone`

系统采用前后端一体化部署。浏览器中的 React 应用负责编辑、预览和本地离线缓存；Cloudflare Worker 同时提供 API、身份认证和静态页面；D1 保存结构化数据；KV 或 R2 保存附件；Durable Objects 负责实时同步通知和备份密钥保护。

## 2. 总体架构

```text
用户浏览器
  ├─ React 19 界面
  ├─ CodeMirror 6 Markdown 编辑器
  ├─ IndexedDB 本地缓存与离线写入队列
  └─ 同域请求 /api/*
          │
          ▼
Cloudflare Worker（Hono）
  ├─ 登录、会话与权限校验
  ├─ 笔记、目录、标签、搜索和版本 API
  ├─ 附件、分享、导入导出和备份 API
  ├─ 静态前端资源
  └─ 每小时定时任务
          │
          ├─ D1：用户、笔记、版本、标签、分享、备份记录等
          ├─ Workers KV：当前线上附件和头像对象
          ├─ SyncHub Durable Object：多设备实时变更通知
          ├─ CredentialVault Durable Object：备份凭据加密密钥
          └─ Cloudflare R2：通过 S3 兼容接口保存异地备份
```

### 2.1 前端层

- 技术栈：React、TypeScript、Vite、Tailwind CSS。
- 编辑器：CodeMirror 6，原始内容始终保存为 Markdown。
- 预览：Markdown-It，并支持表格、任务清单、脚注、数学公式、Mermaid、代码高亮等。
- 状态管理：Zustand。
- 离线能力：IndexedDB 保存缓存和待提交修改；恢复网络后再同步。
- 当前已经增加单篇笔记导出 Markdown、HTML、PDF 的功能。

### 2.2 Worker 服务层

- Web 框架：Hono。
- 入口：`src/worker/index.ts`。
- 路由汇总：`src/worker/app.ts`。
- 所有 `/api/*` 请求都会先初始化并检查 D1 数据结构。
- API 默认不缓存，并设置了内容类型、页面嵌入、来源策略等安全响应头。
- 未命中的页面请求交给 Worker 静态资源服务，以支持单页应用路由。

### 2.3 数据层

Cloudflare D1 中的主要数据包括：

| 数据表 | 用途 |
| --- | --- |
| `users`、`sessions` | 账号、设置和登录会话 |
| `notes`、`note_versions` | 笔记正文及历史版本 |
| `folders`、`tags`、`note_tags` | 目录和标签体系 |
| `links` | 双向链接与关系图 |
| `attachments` | 附件元数据，文件实体位于 KV 或 R2 |
| `shares` | 公开分享链接、密码和有效期 |
| `changes` | 多设备增量同步游标 |
| `backup_targets`、`backup_runs` | 备份目标和执行记录 |

全文搜索优先使用 D1 FTS5；若运行环境不支持，则自动退回普通模糊查询。

### 2.4 当前线上存储状态

项目保留了两套部署配置：

- `wrangler.toml`：附件直接保存到绑定的 R2 Bucket `inkstone-files`。
- `wrangler.kv.toml`：附件保存到绑定的 Workers KV。

当前最后一次正式发布使用的是 KV 部署模式，因此线上附件和头像走 Workers KV。已经开通的 Cloudflare R2 则通过应用内的 S3 兼容备份功能作为异地备份目的地。以后若希望附件本体也迁移到 R2，需要先迁移已有附件对象，再改用标准 R2 配置发布；不能只切换配置，否则旧附件可能暂时无法读取。

## 3. 安装实施过程

### 3.1 准备工作

1. 将 `hggservers/inkstone` 克隆到本地。
2. 安装 Node.js 24 和项目依赖。
3. 登录 Cloudflare 账号，并让部署工具获得当前账号授权。

### 3.2 创建 Cloudflare 资源

1. 创建 D1 数据库 `inkstone-db`，用于保存全部结构化数据。
2. 创建 Workers KV 命名空间，作为当前线上附件对象存储。
3. 配置 `SyncHub` 和 `CredentialVault` 两个 Durable Object。
4. 设置每小时执行一次的 Cron Trigger：`0 * * * *`。
5. Worker 首次收到 API 请求时会自动创建并核验所需的数据表和索引。

### 3.3 域名绑定

1. `zhouhua.net` 已托管在同一个 Cloudflare 账号中。
2. Worker 配置增加自定义域名 `note.zhouhua.net`。
3. Cloudflare 自动创建路由并配置 HTTPS 证书。
4. 正式站点可通过 `https://note.zhouhua.net` 访问。

### 3.4 首次初始化

1. 第一个注册的账号自动成为站点所有者。
2. 系统自动生成中英文示例笔记。
3. 所有者可以关闭后续注册，避免未经授权的用户创建账号。

### 3.5 备份实施

1. 在 Cloudflare R2 创建备份 Bucket。
2. 创建只允许访问该 Bucket 的 R2 API Token。
3. 在 Inkstone 的“设置 > 备份”中新增 S3 类型目标。
4. 填写 R2 的 S3 Endpoint、区域、Bucket、Access Key ID 和 Secret Access Key。
5. 测试连接后执行一次手动备份，再开启定时备份。

备份支持两种模式：

- 归档模式：每次生成一个完整 ZIP，适合长期留档和灾难恢复。
- 镜像模式：输出可直接阅读的 Markdown、附件和数据清单，适合人工查看或由其他系统继续处理。

当前定时器每小时检查一次用户设置，实际备份间隔可选择关闭、每小时、每 6 小时或每天。备份包不包含登录密码、活动会话、分享密码和备份服务密钥。

## 4. 当前 API 能力

Inkstone 的网页本身就是通过 JSON API 工作，因此服务端已有较完整的接口。

| 模块 | 已有能力 |
| --- | --- |
| 认证 | 注册、登录、退出、会话查询、资料和密码修改 |
| 笔记 | 列表、详情、新建、修改、回收站、恢复、彻底删除、复制 |
| 版本 | 版本列表、版本详情、恢复历史版本 |
| 组织 | 目录增删改查、标签修改和删除 |
| 检索 | 全文搜索、索引重建、关系图、反向链接 |
| 同步 | 增量同步、WebSocket 实时通知 |
| 文件 | 附件上传、下载、删除、无效附件清理 |
| 分享 | 创建、查询、取消公开分享，支持密码和有效期 |
| 迁移 | JSON/ZIP 导出，Markdown/JSON/ZIP 导入 |
| 备份 | 目标管理、连接测试、手动执行、执行记录 |

例如，站内前端目前使用以下接口完成笔记操作：

```text
GET    /api/notes                 笔记列表
GET    /api/notes/:id             笔记详情
POST   /api/notes                 新建笔记
PATCH  /api/notes/:id             修改笔记
DELETE /api/notes/:id             移入回收站
GET    /api/search?q=关键词       搜索
POST   /api/files                 上传附件
GET    /api/export?format=zip     导出完整备份
```

修改笔记时必须携带当前 `rev` 版本号。若其他设备已经修改过同一笔记，服务端返回 `409 conflict` 和最新内容，避免后写入的数据静默覆盖先写入的数据。

## 5. 能否二次开发

可以。项目使用 TypeScript，模块边界清楚，前端、共享类型和 Worker 服务端均在同一仓库中，适合继续增加业务功能。许可证是 `LGPL-3.0-only`，允许修改和部署，也允许在符合许可证义务的前提下用于商业项目；对外分发修改版本时应保留许可证和版权声明，并按 LGPL 要求提供相关修改源码。

适合继续开发的方向包括：

- 面向其他程序的笔记读写 API。
- 微信、浏览器插件、快捷指令或自动化工具快速写入笔记。
- Webhook，在笔记创建或更新后通知其他系统。
- AI 检索、摘要、分类和知识问答。
- 团队空间、细粒度权限和审计记录。
- 全库 Markdown/HTML/PDF 批量导出。
- 将附件主存储从 KV 平滑迁移到 R2。

## 6. 对外 API 的现状与限制

现有接口属于“站内 API”，能够被程序调用，但还不建议直接当作正式开放 API，主要原因如下：

1. 身份认证依赖 `HttpOnly` 登录 Cookie，没有个人 API Token。
2. 所有写请求必须带 `X-Inkstone-Client: 1` 请求头。
3. 默认按同域网页设计，没有可配置的跨域访问白名单。
4. 尚未提供 OpenAPI 文档、Token 权限范围、撤销机制和 API 审计记录。
5. 登录 Cookie 有效期较长，脚本保存 Cookie 的安全性和可维护性不如专用 Token。

技术上可以让脚本先调用登录接口并保存 Cookie，再调用笔记接口，但这更适合临时自动化，不适合作为长期集成方案。

## 7. 推荐的开放 API 方案

建议保留现有 `/api/*` 供网页使用，新增版本化的 `/api/v1/*` 作为外部接口。

### 7.1 认证设计

- 增加“个人访问令牌”页面，令牌只在创建时显示一次。
- 数据库只保存令牌哈希，不保存明文。
- 使用 `Authorization: Bearer <token>` 认证。
- 支持权限范围，例如 `notes:read`、`notes:write`、`files:write`、`export:read`。
- 支持名称、到期时间、最后使用时间、立即撤销和密钥轮换。
- 对令牌调用增加速率限制和安全审计记录。

### 7.2 建议首批接口

```text
GET    /api/v1/notes
POST   /api/v1/notes
GET    /api/v1/notes/:id
PATCH  /api/v1/notes/:id
DELETE /api/v1/notes/:id
GET    /api/v1/folders
GET    /api/v1/tags
GET    /api/v1/search?q=...
POST   /api/v1/files
GET    /api/v1/export
```

首批接口可复用现有数据读写函数和校验规则，不需要重写业务逻辑。外部 API 层主要新增认证、权限、限流、统一分页和文档。

### 7.3 接口质量要求

- 使用稳定的 JSON 字段和统一错误结构。
- 列表接口使用游标分页，避免笔记数量增加后性能下降。
- 写入继续使用 `rev` 乐观锁，明确返回冲突信息。
- 新建接口支持幂等键，防止网络重试产生重复笔记。
- 附件继续限制类型和大小，避免大文件拖垮 Worker。
- 提供 OpenAPI 3.1 文档和可直接运行的调用示例。
- 跨域访问采用明确的域名白名单，不开放任意来源。

## 8. 建议实施阶段

| 阶段 | 内容 | 结果 |
| --- | --- | --- |
| 第一阶段 | API Token、权限范围、令牌管理页面、基础审计 | 外部程序可以安全登录 |
| 第二阶段 | 笔记、目录、标签、搜索和附件的 `/api/v1` | 完成常用读写集成 |
| 第三阶段 | OpenAPI 文档、限流、幂等、集成测试 | 接口可稳定交付使用 |
| 第四阶段 | Webhook、批量接口和第三方连接器 | 支持更复杂自动化 |

第一阶段和第二阶段完成后，就可以支持常见场景，例如通过 iPhone 快捷指令新建笔记、从其他应用同步文章、通过脚本定期导出，或接入 AI 工具读取指定笔记。

## 9. 运维与安全建议

- 保持注册关闭，仅在确实需要新增用户时临时开启。
- R2 备份令牌只授予指定 Bucket 的对象读写权限，不使用全账号管理权限。
- 定期从 R2 下载备份并做恢复演练，确认备份不是“只生成但不能恢复”。
- D1 与附件存储需要成套恢复，单独恢复其中一项可能造成附件元数据和对象不一致。
- 发布前执行类型检查、完整单元测试和生产构建；涉及 API、同步、导入导出或备份时，再执行端到端测试。
- 正式增加开放 API 后，应为令牌操作增加日志，但日志中绝不能记录令牌明文和笔记正文。

## 10. 结论

当前 Inkstone 已经是一套完整的 Cloudflare 原生笔记应用：Worker 承载网页和 API，D1 保存核心数据，KV 保存线上附件，Durable Objects 支持实时同步和备份密钥保护，R2 保存异地备份。

项目具备良好的二次开发基础，也已经有足够完整的内部 API。若只是个人临时脚本，可以沿用登录 Cookie 调用；若要提供给手机快捷指令、插件、AI 服务或其他长期运行的程序，建议新增带权限范围的个人访问令牌和 `/api/v1`，不要直接把浏览器会话接口作为正式开放接口。
