# 多件折扣 · 测试环境

从主应用同步的独立 SHOPLINE 测试项目。保留本测试应用、主题扩展和 Discount Function 的现有身份，不使用正式应用 Worker / D1 资源。

- [同步结果、验证与已知限制](docs/TEST_ENV_SYNC.md)
- [测试环境本地运行及 Worker 配置](docs/cloudflare-workers-runbook.md)
- [项目要求](AGENTS.md)

`npm run dev` 为 SHOPLINE CLI / Express 路径；完整业务使用 Worker。扩展凭证、本地环境文件与数据库均不进入 Git。
