# 2026-11-25 测试 Worker 部署记录

## 结果

已按用户“把测试环境部署到我 Cloudflare 的 Worker，域名 app-test.vswwy.cn”的指令完成部署。

- Worker：`shopline-quantity-breaks-test`
- HTTPS：https://app-test.vswwy.cn
- 当前活动版本：`8be7be72-098a-4eae-a27d-ac659047ffbb`（100%，包含用户随后添加的 Partner Secret）
- CLI 代码发布版本：`cb6654c0-0acd-4874-9ba2-b09b4ddd2067`；最终回读确认活动版本保留正确 Function ID、D1 和应用域名。
- 独立 D1：`shopline-quantity-breaks-test` / `9fcea996-fdc3-4ade-a792-c8659e42800c`
- 定时任务：`*/5 * * * *`、`0 3 * * *`
- 全部 26 份迁移已应用；远程 `d1_migrations` 计数为 26。编号范围 0001–0025，0017 包含两份文件。

创建测试 Worker 后，只将目标原 App Secret、新生成的独立 token 加密密钥和内部签名密钥写入测试 Secrets。未读取/复制正式 Worker 的 secret 值。App Key / App Secret 保持测试原值。部署期间两份扩展 `.env.prod` 在本次操作之外从 dev ID 更新：Function 为 `754292a155d740809a5437a3f8c59231`，主题 UUID 为 `fb0f6365-4554-4c29-aca7-d439ae191804`、扩展 ID 为 `10949`。本次保留新身份值并对齐 Worker / Express Function 配置；按更新后的身份快照核验两份凭证、主题元数据和原 SQLite，未由本次操作覆盖。没有将这些忽略文件纳入 Git。

## 验证证据

- 前端生产构建、Worker TypeScript 与 dry-run 通过。
- 环境隔离4项通过；部署配置更新前先观察到缺少域名/D1的失败，配置后通过。
- 主题挂载/活动来源相关9项通过，OS2.1兼容39份资源/36语言一致。
- 英文临时路径镜像运行完整 Worker：51文件499项通过。目标中文目录的既有node:vm测试工具链限制仍存在。
- Function ID 更新后，Worker 相关6文件72项、Express活动接口19项通过，类型检查和dry-run再次通过。
- Cloudflare发布命令退出0，返回代码发布版本、自定义域名和两个cron；随后回读当前活动版本与资源绑定。
- Cloudflare域名API回读：app-test.vswwy.cn绑定shopline-quantity-breaks-test。
- 正式shopline-quantity-breaks及kaching-developer-admin的modified_on与部署前完全相同，正式域名绑定保持原服务。

线上HTTPS检查（未关闭TLS验证）：

| 请求 | 实际结果 |
| --- | --- |
| `/health` | 200，`ok: true`，含Trace ID |
| `/` | 200，HTML |
| 首页两个JS入口 | 均200，JavaScript内容类型 |
| 未授权 `/api/quantity-breaks/campaigns` | 401，Unauthorized |
| 不存在的 `/assets/deployment-check-missing.js` | 404，纯文本，不回退SPA |
| `/api/auth?handle=test-shop` | 302，测试App Key与app-test callback地址正确；未跟随到真实店铺 |
| 无签名 `/api/auth/callback` | 400，Invalid OAuth callback |

已实际通过浏览器加载app-test域名，脚本进入/quantity-breaks并渲染页面壳和语言控件；没有SHOPLINE会话，因此显示无法加载和禁用创建，符合线上401边界。未将该现象标记为已授权商家完整验收。

## 尚未配置/验证

1. 用户已添加测试 `SHOPLINE_PARTNER_ACCESS_TOKEN`，活动 Worker 绑定及 Secret 列表已确认名称存在；Token 是否有正确 Partner 权限、真实订阅联调仍未验证。
2. 未在SHOPLINE Partner后台提交新应用URL/回调/权限；本地shopline.app.toml已改为新域名。
3. 本次未发布主题/Function扩展；保留测试目录当前新ID，外部平台发布状态及真实折扣发布/加购/结账未验证。
4. 未绑定独立测试DEVELOPER_ADMIN服务；开发者审计清理联调待补齐。
5. 用户随后明确批准本批推送；提交与推送结果以 Git 回执为准。

本轮没有修改CSS、业务规则、源目录、正式Worker或正式D1。

## 本批 Git 审查

18 份修改、1 份新增部署记录，无文件删除。范围为测试域名/D1配置、当前测试Function ID对齐、对应回归测试、主题API来源和运行记录。所有候选文件已检查；身份文件/数据库未被本次操作覆盖，候选内容未发现本地实际密钥或私钥。

拟提交：`chore: deploy test worker at app-test.vswwy.cn`。用户已明确批准本批 Git 推送，目标 `https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git`，分支 `main`。Cloudflare部署已按授权完成；后续每次推送前均向用户说明具体 Git 地址。

- `app/src/controller/campaigns.ts`
- `app/test/campaign-api.test.cjs`
- `docs/APP_PROGRESS.md`
- `docs/TEST_ENV_SYNC.md`
- `docs/cloudflare-workers-runbook.md`
- `shopline.app.toml`
- `tests/environment-isolation.test.mjs`
- `tests/theme-app-extension/widget-mount.test.mjs`
- `theme-app-extension/compatibility/assets/app-block.js`
- `theme-app-extension/public/app-block.js`
- `worker/src/deployment-config.ts`
- `worker/src/services/discounts.ts`
- `worker/src/services/webhooks.ts`
- `worker/test/deployment-config.test.ts`
- `worker/test/discount-node-resolution.unit.test.ts`
- `worker/test/discount-publication.test.ts`
- `worker/test/internal-campaign-admin.test.ts`
- `worker/wrangler.toml`
- `docs/audits/2026-11-25-test-worker-deployment.md`（新增）
