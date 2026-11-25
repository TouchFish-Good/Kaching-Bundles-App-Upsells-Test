# 测试环境 Worker / D1 运行说明

本仓库为 `Kaching-Bundles-App-Upsells-Test`。2026-11-25 已按用户授权部署独立测试 Worker，发布版本 `8be7be72-098a-4eae-a27d-ac659047ffbb`。

## 当前资源

| 项目 | 配置 |
| --- | --- |
| HTTPS 地址 | https://app-test.vswwy.cn |
| OAuth callback | https://app-test.vswwy.cn/api/auth/callback |
| Worker | `shopline-quantity-breaks-test` |
| D1 名称 / binding | `shopline-quantity-breaks-test` / `DB` |
| D1 ID | `9fcea996-fdc3-4ade-a792-c8659e42800c` |
| 备用地址 | https://shopline-quantity-breaks-test.2458472041.workers.dev |

独立测试 D1 已应用全部 26 份迁移（编号 0001–0025，其中 0017 有两份不同文件）。正式应用 D1、域名 route、管理 Worker 均未修改。没有给测试 Worker 绑定正式 `DEVELOPER_ADMIN` 服务。

App Key、App Secret 仍使用本测试应用的原值。部署期间两份扩展 `.env.prod` 在本次操作之外更新了扩展 ID；已保留新值，并将 Worker / Express 的 Function 配置对齐为 `754292a155d740809a5437a3f8c59231`。当前主题 UUID 为 `fb0f6365-4554-4c29-aca7-d439ae191804`、扩展 ID 为 `10949`。按更新后的快照核验，两份凭证、主题元数据和原 SQLite 未被本次操作覆盖。本次没有执行扩展发布，未确认平台发布状态。

## Secrets 与待联调

测试 Worker 已配置 `SHOPLINE_APP_SECRET`、`TOKEN_ENCRYPTION_KEY`、`ADMIN_INTERNAL_SECRET`，密钥值只在本地忽略文件和 Cloudflare Secrets 中。`TOKEN_ENCRYPTION_KEY` 为独立 32 随机字节的 base64url；不复制正式环境 token / 内部密钥。

用户已在 Cloudflare 添加 `SHOPLINE_PARTNER_ACCESS_TOKEN`，已通过 Secret 名称和活动 Worker 绑定回读确认；未读取密钥值，尚未验证 Partner 接口权限或订阅联调。配置路径：Workers & Pages → `shopline-quantity-breaks-test` → Settings → Variables and Secrets → Add → Secret，名称为 `SHOPLINE_PARTNER_ACCESS_TOKEN`，保存并部署。若使用开发者管理服务 / GDPR 商家审计清理，还需独立测试 `DEVELOPER_ADMIN` binding 与配套内部密钥；不能直接接正式管理服务。

`shopline.app.toml` 已更新为新 HTTPS 地址和 callback，但本次只部署 Cloudflare，没有在 SHOPLINE Partner 后台提交应用地址/回调/权限，也没有发布主题或 Function 扩展。主题 OS3 / OS2.1 本地资源已同步测试来源；店铺中的旧扩展需要另行发布才能更新。测试订阅套餐、权益功能点与平台白名单仍需本测试应用独立确认。

直接在外部浏览器打开应用没有 SHOPLINE session，活动 API 会返回 401，页面显示无法加载并禁用创建。应从已安装该测试应用的 SHOPLINE 后台进入完成 OAuth；本次仅核验回调地址生成，未完成实店授权、订阅购买或折扣结账。

## 本地依赖与检查

Worker 工具使用 Node 22。根项目 `npm run dev` 为源项目 SHOPLINE CLI + Express 路径；完整业务使用 Worker。单独 Vite / Express 不包含完整订阅/反馈后端。

```bash
npm install
npm --prefix worker ci
npm run theme:check
node --test tests/environment-isolation.test.mjs
npm run build --workspace web
npm --prefix worker run typecheck
npm --prefix worker run build
```

最后一条只执行 `wrangler deploy --dry-run`，不会发布。`app/.env`、`worker/.dev.vars`、扩展 `.env.prod` 和 SQLite 均不进入 Git。

Worker 测试在中文目录有 `node:vm` 依赖工具链问题，本轮在临时英文目录以相同源码/测试/依赖运行，51 文件 499 项全部通过。前端/主题/旧 Express 的既有全量失败记录见 [同步报告](TEST_ENV_SYNC.md)，本轮未修改其业务规则。

## 再次部署

只有在用户授权发布测试环境后执行，先确认当前配置仍为测试 Worker、测试域名及上述独立 D1 ID：

```bash
npm run build --workspace web
cd worker
npm run typecheck
npm run build
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

域名、App URL、回调、Worker 变量、本地环境与主题 `APP_ORIGIN` 必须一致；修改主题资源后运行 `npm run theme:sync`。不要将生产域名、生产 D1 ID 或生产管理服务复制到本配置。

完整本轮部署与验证结果见 [部署记录](audits/2026-11-25-test-worker-deployment.md)。本批 Git 推送已获用户明确授权；后续每批仍需单独确认，并在推送前说明具体 Git 远程地址及分支。
