# 测试环境 Worker / D1 运行说明

此仓库为 `Kaching-Bundles-App-Upsells-Test`，禁止将源项目正式域名、正式 D1 ID 或正式管理服务绑定复制过来。本次仅本地同步，尚未部署或修改任何远程资源。

## 当前配置

- Worker：`shopline-quantity-breaks-test`；D1 binding：`DB`；数据库名：`shopline-quantity-breaks-test`。
- `worker/wrangler.toml` 的 `database_id` 留空，必须先创建独立测试 D1 才能远程迁移/部署。没有生产 custom domain 或生产 `DEVELOPER_ADMIN` 服务绑定。
- App 名称、Key、URL、回调取自目标原 `shopline.app.toml`。当前 URL 是已有临时 Tunnel 地址，不能保证仍在线；CLI 切换 Tunnel 后须同步 Worker 的 `SHOPLINE_APP_URL`、主题 `public/app-block.js` 的 `APP_ORIGIN` 和本地环境文件，再执行 `npm run theme:sync` 更新兼容资源。
- 两份扩展 `.env.prod` 原样保留。当前 Function UUID 为开发标识；平台发布后若返回不同 ID，再同步本测试应用的 Function ID，不得沿用正式应用 ID。
- 继承源订阅清理/核对与隐私清理 cron；仅当测试 Worker 部署后生效。

## 本地依赖与验证

建议以 Node 22 安装和执行 Worker 工具。前端现有 `feedback-board.test.mjs` 使用旧 JSON import assertion，在 Node 22 有语法兼容问题；该问题属于源测试基线。

```bash
npm install
npm --prefix worker ci
npm run theme:check
node --test tests/environment-isolation.test.mjs
npm run test:theme
npm run test:prototype --workspace web
npm test --workspace app
npm run build --workspace web
npm run build --workspace app
npm --prefix worker run typecheck
npm --prefix worker run build
```

最后一条仅执行 `wrangler deploy --dry-run`，不会发布。完整 Worker 测试：在 `worker` 中运行 `npm test -- --maxWorkers=4 --minWorkers=1`。

`npm run dev` 沿用源项目 SHOPLINE CLI + Express 开发路径。订阅、反馈等完整线上业务使用 Worker，并非单独启动 Vite / Express 就具备完整后端。`app/.env` 与 `worker/.dev.vars` 只含目标测试凭证及新生成的本地内部/加密密钥，均已忽略。切勿上传这两份文件或扩展 `.env.prod`。切换 Tunnel 或扩展身份后须同步这两份本地环境文件。

## Worker 本地数据

已实测以下本地迁移命令可初始化测试库。`wrangler dev` 需要先配置有效的独立测试 D1 ID；当前留空时无法启动，不应视为已可完整运行：

```bash
cd worker
npx wrangler d1 migrations apply DB --local
npx wrangler dev --local
```

OAuth 依赖可用 HTTPS 回调。没有 SHOPLINE 授权、测试订阅与平台扩展发布时，浏览器只能做页面壳/指南 smoke check，不能据此认定商家功能已验收。

## 远程测试环境待准备

1. 创建独立测试 D1，把新 ID 写入 `worker/wrangler.toml`，核对数据库名始终带 `-test`。
2. 配置测试域名/HTTPS URL 与对应 OAuth 回调，保持 App、Worker、主题请求同一测试来源。
3. 仅为测试 Worker 配置 Secrets：`SHOPLINE_APP_SECRET`、`TOKEN_ENCRYPTION_KEY`、`ADMIN_INTERNAL_SECRET`、`SHOPLINE_PARTNER_ACCESS_TOKEN`。加密密钥为 32 随机字节的 base64url；不要把任何值写入 Git。Partner token 尚未配置，本次不复制正式环境 token。
4. 若需要开发者管理服务联调，另配测试 `DEVELOPER_ADMIN` binding 与配套内部密钥；当前未绑定，不借用正式管理服务。
5. 测试扩展发布及安装、扩展权限白名单、订阅套餐/权益功能点、GDPR webhook 等均需测试应用独立确认。本次仅合并代码所需 scopes，未在平台提交权限或完成商家重新授权。
6. 完成以上核对后，另行部署测试 Worker、应用测试库迁移并验收 OAuth、草稿保存/重读、活动发布/删除、主题加购和真实结账。

本次未执行任何远程迁移、部署、扩展发布或 Git 推送。完整同步记录见 [TEST_ENV_SYNC.md](TEST_ENV_SYNC.md)。
