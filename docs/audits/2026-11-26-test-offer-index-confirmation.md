# 测试环境活动索引确认修复

## 问题与证据

活动更新提示 `Offer index write was not confirmed.`。只读查询测试店铺的
`qb_test_offers.catalog_v1`，确认元字段已存在、资源类型为 `shop`、数据类型为
`json`，且实际返回的 JSON 对象字段顺序不同于应用构造顺序：根对象返回
`entries, version`，应用发送 `version, entries`，嵌套对象也有重排。
原实现通过 `JSON.stringify` 比较，因此相同内容也会被判为失败。

通过 SHOPLINE Admin REST 技能检索并核对 v20260901 的店铺元字段 POST／PUT
接口定义；没有修改请求路径、值格式或身份要求，也没有绕过平台确认。
认证读取沿用规定的 Bearer、Accept、Content-Type 和 User-Agent。
诊断凭据仅在内存解密使用，临时会话导出已删除，没有写入活动或平台元字段。

## 改动

- `worker/src/services/offer-index.ts`：对已解码 JSON 递归比较内容，忽略对象键顺序，
  保留数组顺序、字段集合、类型和值的严格比较。用于幂等判断、写响应确认和写后回读。
- `worker/test/offer-index.test.ts`：覆盖对象／JSON 字符串返回重排后的创建、
  幂等重试与更新；验证写响应及回读中的内容改变、数组重排和身份改变仍被拒绝。
- 保留 namespace／key／owner_resource／type／精确 ID、大小限制和租约检查。

## 验证与范围

- 先运行新增回归：对象和字符串两例均在原实现报同一写入确认错误，17 项通过、2 项失败。
- 修复后索引 19 项、发布 9 项共 28 项通过。在既有无凭据英文临时镜像执行，
  避开已记录的中文路径 Worker 测试运行器问题；改动源码和测试已同步至镜像。
- 对真实只读响应作本地回放：旧字符串比较为 false，JSON 内容相同；修复后的
  writer 以一次读取确认已有相同索引，不产生写请求。此回放不是实际平台更新验收。
- 实际测试目录 Worker TypeScript 检查、Wrangler dry-run、环境隔离 5 项及 diff 检查通过。
- 正式目录 725 个受保护文件哈希及 Git 状态不变；测试其余 8 项身份／凭据哈希不变，
  `worker/wrangler.toml` 与当前 HEAD 一致，保留此前已批准的 Function 能力配置。

本批无主题、Function、前端、迁移或密钥改动。用户批准后已推送／部署，
仍需实际活动更新确认线上结果，未将真实活动更新、购物车或结账标为验证成功。

目标 Git：`https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git`
分支：`codex/gifts-bundles-test`。
修复提交：`3e8ccc84db40fcf9660b665a879588d4dfaf4309`
（`fix(test): compare offer index JSON without object key ordering`）。

## 部署回执

- 测试Worker：`shopline-quantity-breaks-test`；版本
  `4dfda018-465b-4db4-82c4-85e54a30c391`，回读确认承接100%流量。
- 测试域名：`https://app-test.vswwy.cn`；部署后健康检查200，首页及两份入口JS
  与本地构建匹配；未授权活动接口401，缺失资源404。
- 新旧版本全部绑定相同，4项Secret名称保留，测试App Key、Function ID、D1与能力配置未变。
- 部署后再次确认正式725文件／原Git状态和测试其余8项身份／凭据未变。
- 本批仅上传Worker后端修复，静态资源无新增上传；没有重新上传主题或Function，
  也没有代替商家执行实际活动更新。
