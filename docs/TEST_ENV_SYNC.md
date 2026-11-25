# 2026-11-25 测试环境功能同步记录

## 同步结果

已将源目录当前代码、测试、主题兼容资源、D1 迁移和文档同步到 `duojianzhekou-test`。源提交为 `bb5a575980dd25940c2b897fdfe3f6f62c4244d6`，并包含源当前未提交的需求/设计/进度文档与赠品 Bundle 设计参考；这些设计资料不代表新增功能已经实现。源目录未修改。

源：`/Users/SL/Desktop/Kaching Bundles App & Upsells New/bundles-app-upsells-new`。

目标：`/Users/SL/Desktop/多件折扣-测试环境/duojianzhekou-test`。

目标 Git origin 已在本地设为 `https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git`，当前 `main` 尚无本地提交；本次没有暂存、提交或推送。完整候选文件清单见 [TEST_ENV_SYNC_FILES.json](TEST_ENV_SYNC_FILES.json)。

## 身份保留与资源隔离

- App 名称、App Key、App URL、回调及代理字段保留目标原值；仅合并源功能必需的 scopes。未在 SHOPLINE 平台提交权限或重新授权。
- `theme-app-extension/.env.prod`、`product-discount-customizations/.env.prod`、主题 `.shopline-cli.yml`、原 `app/database.sqlite` 与备份 SHA-256 完全一致。
- 根 package 名保留 `duojianzhekou-test`。Function `.toml` 同步分类元字段变量声明，保留目标扩展身份文件。
- Express / Worker 缺省 Function ID 使用目标原有 `dev-c02e7fd2-10f6-4063-9dab-8a1cd5ba8b8f`。两份扩展 UUID 仍为原开发标识，未宣称已发布或平台可用。
- 主题 OS3/OS2.1 的 `APP_ORIGIN`、Worker webhook 缺省地址和对应测试夹具使用目标 App URL。原 URL 为临时 Tunnel，是否仍在线尚未验证。
- Worker/D1 名为 `shopline-quantity-breaks-test`；保留 `DB` binding、迁移、静态资源和 cron。远程 database ID 留空，不复制正式域名 route 或正式管理服务 binding。
- `app/.env`、`worker/.dev.vars` 仅取目标已有凭证；内部签名密钥与 32 字节 base64url token 加密密钥为新生成本地值，不复制源密钥。两文件及扩展 `.env.prod`、SQLite、Worker 本地状态均已被 Git 忽略。
- 候选 Git 文件逐文件审查并扫描源/目标实际 secret 值，未发现泄漏；没有复制源依赖缓存、会话数据、正式 D1 ID 或源备用应用配置。

备份位于仓库外：`/Users/SL/Desktop/多件折扣-测试环境/.duojianzhekou-test-backup-20261125-114258`。含目标原有 71 份非依赖文件、初始 Git 状态及 SHA-256 清单；凭证未写入版本库。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| 环境隔离回归 | 4/4 通过，初始模板阶段先观察失败 |
| 主题 OS2.1 兼容资源 | 39 份资源 / 36 语言一致 |
| Worker 全量 | 临时英文路径镜像 51 文件、499/499 通过 |
| Worker Node 单元 / 模块边界 | 26/26 + 2/2 通过 |
| Worker 类型检查 | 通过 |
| Worker deploy dry-run | 通过；未部署 |
| 前端生产构建 / Express TypeScript 构建 | 均通过；保留源大包警告 |
| 测试 D1 本地迁移 | 0001–0025 成功；未执行远程迁移 |
| Function 单文件构建入口 | 1/1 通过 |
| 主题全量 | 109 项，108 通过、1 个源既有失败 |
| Express 全量 | 152 项，146 通过、6 个源既有失败 |
| 前端全量（Node 22） | 362 项，354 通过、8 个源既有/运行时兼容失败 |
| Go 全量 | 有 1 个源既有重叠折扣规则失败；其他包编译完成 |

Worker 在目标中文路径直接运行测试时，`@cloudflare/vitest-pool-workers` 报 `No such module node:vm`。依赖版本与源一致；将同一份目标代码和依赖镜像到临时英文目录后全部通过。镜像位置：`/var/folders/5p/nhm814x53q99sm08yw42v2940000gn/T/duojianzhekou-qa-6j_xp_6_`。这不是目标原目录测试已经通过；当前路径下仍有工具链限制。

`wrangler dev --local` 在未设置远程 D1 ID 时不能启动；本次没有为通过启动而借用任何正式资源。完整运行待独立测试资源配置完成。

全量测试失败已逐项对照源目录复现：

- 主题默认间距断言仍期待 8px，而当前代码为 10px。
- Express 6 项为原样式默认值、移动样式、字体校验与历史配置断言。
- 前端 7 项为旧外观默认值、编辑页结构、重复 radio ID、样式控件、窄屏角标、款式价格和 Recommended 列宽；另 1 项 `feedback-board.test.mjs` 使用 Node 22 已移除的 `assert { type: 'json' }` 导入语法。
- Go `TestOverlappingDiscountNodesExcludeOnlyConflictedProduct` 在源、目标均失败。

本任务仅同步功能和隔离身份，未擅自修复这些业务/历史测试问题，也未将全量检查标记为全绿。同步发现的 OAuth URL 编码夹具已随测试域名调整，Worker 最终全量通过。测试日志位于 `/tmp/duojianzhekou-*.log`。

## 浏览器 smoke check 与范围

已实际在本地浏览器打开源/目标活动页，验证页面壳及“设置指南”打开交互，并保存已查看截图：

- [源活动页](reference/screenshots/test-environment-sync/source-smoke.png) / [目标活动页](reference/screenshots/test-environment-sync/target-smoke.png)
- [源设置指南](reference/screenshots/test-environment-sync/source-guide.png) / [目标设置指南](reference/screenshots/test-environment-sync/target-guide.png)

该检查为未授权会话下的页面壳、加载失败状态和指南 smoke check；截图分别包含桌面和窄屏，未做同视口像素差异验收。未连接 SHOPLINE 会话的活动页显示加载失败，创建按钮禁用，不能标记活动读写、订阅或主题购物车为已验证。UI 源码和 CSS 原样同步，未重新设计、未额外修改焦点规则。

## 独立审查及待联调

独立只读审查确认源候选文件除备用生产应用配置外均存在，身份文件字节保留、运行时无正式环境默认值、Git 候选无实际密钥。发现源生产部署手册可能误导测试仓库操作正式资源，已完整替换为本测试环境专用运行说明。

待准备：独立测试 D1 ID、稳定测试 HTTPS 地址、Partner Access Token、测试订阅套餐与权益、必要的测试管理服务 binding、扩展发布/安装及白名单。详情见 [测试运行手册](cloudflare-workers-runbook.md)。未执行远程资源创建、平台权限更新、Git 推送、Worker 部署、扩展发布或生产数据变更。

## 本批拟提交

`feat: sync quantity breaks features into isolated test environment`

提交范围为目标仓库全部已审查非忽略文件；其中根配置、App/扩展身份适配、前后端代码、主题资源、Function、迁移、测试、运行说明与截图均在清单中。没有删除目标原文件。源目录不在提交范围；密钥、`.env`、`.dev.vars`、数据库、依赖及构建缓存排除。按 AGENTS.md 等待用户对本批明确授权后才能提交和推送。
