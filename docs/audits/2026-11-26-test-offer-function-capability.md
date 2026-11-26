# 测试赠品与捆绑发布能力配置修复

## 原因与范围

测试活动发布提示 `Verified gift/bundle Function capability is required for publication.`，来自应用内部的 `supportedOfferFunction()` 校验，不是 SHOPLINE 返回的接口错误。上次测试部署未配置 `SHOPLINE_OFFER_FUNCTION_CAPABILITIES`，所以即使 Function 已存在，启用赠品或捆绑的活动仍在调用平台写入接口前被拒绝。

仅修改测试项目配置，为 `buchaqian` 显式声明 `gift-bundles-v1`，绑定既有 Function `754292a155d740809a5437a3f8c59231`。其他店铺或不同 Function ID 继续拒绝，原有校验不删除。App Key、Function ID、主题身份、D1、密钥与正式源码不变。

## 用户提供的能力依据

资料目录：`/Users/SL/Desktop/Discount Function`，仅只读提取，没有修改或上传原文件。

- `SHOPLINE Product Discount Functions - Input & Output 接口.xlsx`，`ProductFunctionInput!H29:I29`：`sku` 明确为款式 ID；新版 `ProductFunctionInput_202609!A121:C123` 区分自定义编号 `skuCode` 与 `sku`。
- 同表 `FunctionRunResult!F6:I8` 说明目标数量上限、逐行固定减免及 `appliesToEachItem=false` 的分摊语义；`FunctionRunResult_202609!A19:C26` 说明 CartLine 级优惠结构。
- `SHOPLINE Product Discount Functions 指引文档（公测版）.docx` 第3.3节：所有目标行都有 value 时按行累加，逐行金额支持 fixedAmount／presentmentFixedAmount，同一活动的 appliesToEachItem 必须一致，不得混用金额模式。当前 v2 输出符合该约束。
- `Discount Function 支持市场币种优惠金额 DDL831.docx` 明确 false 时金额作用于目标商品行整体，店铺金额和市场金额模式互斥。资料仍将双币种输入／市场金额标为白名单能力，本次不推断目标店铺已开通全部市场能力。
- 合作伙伴后台只读确认测试应用 Function 草稿正在运行，最后更新时间09:47，Function ID 与测试 Worker 一致；开发店铺使用草稿预览。不是应用审核版本已发布的证明。

## 本地验证

- 新增部署隔离回归先红后绿：缺少能力配置时失败，补齐后5/5通过；只允许测试店铺与测试 Function。
- 用实际配置调用现有 `supportedOfferFunction()`：测试店铺通过，其他店铺和不同 Function 均拒绝。
- 发布／索引现有回归24/24通过。原中文路径的 Workers 测试运行器因 `node:vm` 解析失败未执行测试；改用仅复制源码、测试和依赖的无凭据英文临时镜像后通过，没有加载商家密钥。
- 实际执行现有编译产物的 WASM `Exec`：赠品3件最多优惠2件、捆绑2件最多优惠1件；分别返回20.00和4.00的行级固定减免，appliesToEachItem均为false；错误款式标识被拒绝；未达门槛无优惠。输入是按资料构造的测试值，不是真实购物车输入。
- WASM SHA256：`92f34f6b3e77baca63cfcd7b9d639a511ae794dfc760357d9dca8784767cc8f0`。
- 测试 Worker dry-run通过，展示新的能力变量；原环境身份不改。

## 发布状态与边界

本批配置、回归及记录仅在本地更新，尚未提交、推送或部署。线上原能力开关仍关闭，当前报错需部署本批配置后才会解除该拦截。

没有创建临时平台活动、修改商家活动、写入购物车、提交订单或绕过审核。真实平台加购／计价、原生主题元字段可见性、市场金额白名单与结账仍待部署后联调；不把契约核对和本地 WASM 执行写成实店交易验收。

拟提交：`fix(test): configure documented gift bundle Function capability`。目标仓库 `https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git`，分支 `codex/gifts-bundles-test`。
