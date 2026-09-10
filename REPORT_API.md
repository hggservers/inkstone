# 日报自动写入 API

在“设置 → API 接入”创建令牌，选择允许访问的文件夹。令牌只能读写该目录内按日期标识的日报，不具备普通笔记删除、分享、附件或账号管理权限。明文只在创建时返回，数据库保存 SHA-256 摘要，可立即撤销，最长有效期365天。不要把令牌放进URL或Git。

## 日报接口

请求均使用 `Authorization: Bearer <token>`；写入还使用 `Content-Type: application/json`。这些服务端接口无需浏览器Cookie和跨域设置，不接受Cookie代替令牌。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/reports/YYYY-MM-DD` | 读取当天日报、当前版本和私有直达URL |
| PUT | `/api/v1/reports/YYYY-MM-DD` | 创建或更新当天日报 |

PUT正文：

```json
{"content":"# 搞钱情报日报｜2026-09-11\n\n日报正文", "rev":0}
```

不存在时必须使用 `rev:0`，创建返回201。存在时应先GET，审核当前内容并提交当前rev，更新返回200并保存旧正文版本。日期必须是真实日历日期。

返回：`{note, url, created}`。note沿用站内Note结构，包括 `id, title, content, folderId, rev, createdAt, updatedAt` 等。url为 `https://note.zhouhua.net/?note=笔记ID`，访问仍需登录，不是公开分享链接。

同一用户/目录/日期产生稳定笔记ID。旧日报若标题恰为 `搞钱情报日报｜YYYY-MM-DD`，会复用现有笔记；发现多个同名日报则返回409，要求人工整理。相同正文和标题的重试为无副作用成功，不增加版本。不同正文携带过期rev返回409。已移走、归档或删除的固定ID日报不会被自动复活。

只有版本号无法判断此前是否被人修改；客户端应保存上次成功上传的内容摘要及rev，下一次更新前比较服务端内容。随意GET新rev再覆盖会丢掉人工编辑意图，应避免这样实现客户端。

## 错误与限流

- 400：无效日期、字段或版本格式。
- 401：无令牌、令牌失效或撤销。
- 403：只读令牌尝试写入或目标目录不可用。
- 404：日报不存在或接口不存在。
- 409：版本冲突、重名或日报被移动/归档/删除。
- 413：正文超出原有笔记限制。
- 429：每令牌每分钟超过60次认证请求，稍后重试。

错误结构沿用 `{error:{code,message,details?}}`。不要盲目重试401/403/409；网络超时后先GET核对是否已经提交成功。

## 令牌管理

以下管理接口仅接受站内登录会话；写入同时需要 `X-Inkstone-Client: 1`。

- GET `/api/integrations/tokens`：当前用户令牌元数据列表，不返回明文或摘要。
- POST `/api/integrations/tokens`：`{name,folderId,expiresInDays?,canWrite?}`，默认90天、可写；返回一次性明文。
- DELETE `/api/integrations/tokens/:id`：撤销当前用户拥有的令牌。
- GET `/api/integrations/audit`：最近50次管理/调用记录。日志不记录正文、密码或令牌，调用时清理30天以前的记录。

## 数据与发布

增量创建 `api_tokens` 和 `api_audit` 两张表，不清空原有数据库。复用原有笔记写入、版本、搜索索引、双链和同步通知逻辑。

生产附件继续使用 `wrangler.kv.toml`；构建 `npm run build:kv`，部署 `npx wrangler deploy --config dist/inkstone/wrangler.json`。不要直接改用R2配置。

验证：类型检查、翻译与注释检查、376项既有单元测试、174项既有端到端检查、25项日报API专项检查通过。专项脚本 `node scripts/integrations-e2e.mjs` 只允许本地地址，需先执行原有e2e生成测试用户；不可对生产环境运行。

2026-09-10 已在正式域名验证健康、目录限定令牌、现有日报幂等上传与正文回读、私有直达链接及令牌管理界面。
