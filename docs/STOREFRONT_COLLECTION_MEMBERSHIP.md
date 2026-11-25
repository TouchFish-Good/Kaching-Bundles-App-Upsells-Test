# 商品分类活动：组件展示与 Function 输入

## 商品页组件

- 新版主题通过 SLine `product | get_collection_pagination(100, page=1)` 取得当前商品所属分类，显式读取后续页，避免商品页 URL 的 `page_num` 改变查询起点。文档：https://developer.shopline.com/docs/sline/filter/get-collection-pagination 。
- 每次最多读取 10 页、1000 个分类，避免主题渲染无界请求。客户端核对总数、页数、ID 格式与唯一性；缺页、超过上限或元数据缺失时标记不完整，不把部分列表或旧商品快照当作当前完整归属。
- 新主题用 `application/x-www-form-urlencoded` POST 查询公开展示接口，避免分类 ID 撑大 URL，也不增加 CORS 预检请求。请求体上限 128 KiB，最多 1000 个分类 ID。旧主题 GET 仍兼容原快照。
- 完整的空分类列表意味着商品已不属于任何分类；不会回退到旧 `resolvedProductIds`。新加入分类的商品也无需等待每日快照刷新才可匹配展示。
- 同时匹配有效指定商品 A 和指定分类 B 时，只展示 A。A 不在生效期或未发布时才考虑 B。排除商品、订阅权益、活动时间和发布状态仍必须通过。多个同优先级活动的既有 409 保护保留，不猜测平台最终选择。
- 浏览器提交的分类 ID 仅影响公开组件展示，不写入 D1、不作为发布核验或结账折扣依据；公开展示接口不提供私密令牌或平台折扣 ID。
- 可售规则（2026-11-17 用户确认）：仅以款式 `available` 为准。`true` 可选择并提交加购，`false` 显示缺货并禁用加购；不再读取 `inventory_tracker`、`inventory_policy` 或 `inventory_quantity` 推断可售性，也不在组件中按库存数量阻断。未开启库存追踪时主题库存数量可能为 0，不能据此认定缺货。相同 SKU 的数量仍合并提交，最终数量与销售资格由 SHOPLINE 加购/结账确认。全部款式不可售时保留组件、档位及禁用的售罄按钮。

## 结账 Function 与字段表

来源：`/Users/SL/Desktop/Discount Function/SHOPLINE Product Discount Functions - Input & Output 接口.xlsx`，`ProductFunctionInput_202609` 工作表第 4、105–107 行。

| 字段 | 用途 |
| --- | --- |
| `cart(inCollections: [String])` | 传入需要逐项判断的分类 ID |
| `product.inCollections[].collectionId` | 返回正在判断的分类 ID |
| `product.inCollections[].isMember` | 当前商品是否属于该分类 |
| `cart(inAnyCollectionIds)` / `product.inAnyCollection` | 只判断是否属于其中任意分类，不能独立区分多个活动 |

本地现有链路为：

1. 发布分类活动时，将本店仍需参与计算的分类 ID 并集写入 Shop JSON Metafield，并读回核对。不是把单一活动覆盖到整个店铺配置。
2. namespace 为 `$app:quantity-breaks`，key 为 `collection-membership`，value 为 `{"inCollections":["分类ID", "其他活动的分类ID"]}`；owner 为本店，元字段及元字段定义请求的 `owner_resource` 均固定为小写 `shop`。`$app` 写入后平台会展开成实际 namespace，读回使用写响应的 namespace。
3. Function TOML 的 `[input.variables]` 按桌面 Function 指引 1.2 使用与写入时相同的 `$app:quantity-breaks` / `collection-membership`。`$app` 表示当前应用的命名空间别名，不硬编码平台返回的展开格式。GraphQL 声明 `$inCollections: [String]` 并传入 `cart(inCollections: $inCollections)`。
4. Go 对每个折扣节点按自己的 `scope.collectionIds` 匹配实时返回的 `collectionId` 且要求 `isMember=true`；先排除商品，指定商品优先。分类快照不参与 Function 结账匹配。

定义权限必须显式配置为 `access.admin: MERCHANT_READ`。分类配置写入并回读一致后，以实际 namespace 查询定义；不存在则创建，已有定义权限不符则通过 `$app:quantity-breaks` 原位更新，更新后按定义 ID 回读确认。已有 `MERCHANT_READ` 定义只读取，不重复写入。权限只属于定义，不混入元字段值；不会改写原分类 ID、定义名称或数据类型。此项权限核验不等于已完成 Function 结账实测。

### 2026-11-17 实店未生效排查

- 店铺 `zheng-haonan`，Function `66a964153c3c4b42a6713162369e0df9`，活跃扩展版本 `0.0.64`。
- 实际 TraceID `87f31cb19bf50c5ce47d0f03158164d8`。商品 `16077057526399007934692470`，3 件，每件 USD 22；分类节点要求 `12277057487400872661322470`，但输入为 `inCollections: []`，输出 `discounts: []`。
- 本地回归证明：空输入不会授权分类折扣；同一商品若返回目标分类的 `isMember=true`，3 件 8 折会产生每件 USD 4.40 的优惠。新增空分类输入诊断提示，避免仅有 `computed discounts=0` 而无法定位输入链路。
- 本机 `@shoplineos/cli 1.5.9` 的 Function 配置解析仅保留 version/build/ui，上传表单未显式携带 `[input.variables]`；只读检查官方 npm `1.5.10` 包也有相同限制。这是需要核实的发布链路问题，不能仅因本地 TOML 存在就宣称线上变量配置已生效，也不能仅凭客户端源码证明服务端绝对未从上传包解析配置。
- 上述是第一轮调查记录；后续已核对线上绑定与真实店铺字段，见下节。不能猜测未公开上传参数、硬编码单店分类到全局 GraphQL、把空输入当成全部命中，或改为按不可信前端分类在结账打折。

### 2026-11-17 动态变量绑定核对与 `$app` 配置纠正（根因待核实）

- 合作伙伴后台实际版本响应确认，活跃版本已为 `0.0.65`（version ID `20458`），保存了 `inputVariables={"namespace":"103645:quantity-breaks","key":"collection-membership"}`；线上 GraphQL 同时声明并传入 `$inCollections`，也查询了 `collectionId` / `isMember`。因此，CLI 解析源码的限制不能证明变量绑定没有发布。
- 通过临时受保护的只读诊断读取 `zheng-haonan` 店铺（store ID `1778224817744`）的 Shop Metafield：HTTP 200，SHOPLINE TraceID `9e46cae5c0aebe8fb7493bf36ef7e4cb`。实际字段 namespace 为 `app--103645--quantity-breaks`，key 为 `collection-membership`，type 为 `json`，owner_resource 为 `shop`，owner_id 与店铺相同，value 为 `{"inCollections":["12277057487400872661322470"]}`。目标分类已写入，不能把问题归结为未保存分类配置。
- 桌面《SHOPLINE Product Discount Functions 指引文档（公测版）》1.2.1 明确 `$app` 对应当前安装应用，写入示例为 `$app:store-namespace`；1.2.2 的 `[input.variables]` 也使用同一 `$app:store-namespace`，并要求与写入时的 namespace/key 一致。应保留该公开给开发者的配置形式。SHOPLINE AI Suite 的公开文档检索与 REST 字段说明未提供 Function 中 `103645:…` 与 REST 中 `app--103645--…` 的内部映射规范，因此不能仅凭两种返回格式不同，认定绑定错误。
- 曾在本地尝试将 TOML 改为 `app--103645--quantity-breaks`，但该推断缺少平台运行时依据，已在提交、推送和发布前撤销。当前 Function TOML 与 Worker 写入均保持 `$app:quantity-breaks`，key 均为 `collection-membership`；Worker 仍按写响应的实际 namespace 读回。这次没有生产配置修改，也没有迁移商家字段、重写分类列表或修改 Go 计算规则。
- 使用真实请求输入做本地计算对照：原始 `inCollections: []` 返回 0 条折扣；仅在本地补入目标分类 `isMember=true` 后，4 件、每件 USD 77 命中 3 件 8 折档，返回每件减 USD 15.40，共减 USD 61.60。这证明该输入下的计算路径可工作，不能代替平台实际分类归属返回。

后续按以下顺序继续排查：

1. 核对活跃 Function 的应用归属、目标店铺和运行时间，并使用平台支持的方式确认 `$app:quantity-breaks` / `collection-membership` 在运行时读取到哪条 Shop Metafield。后台返回的 `103645:quantity-breaks` 已有证据，但是否为正常内部展开仍需平台依据；不为排查而重新发布硬编码 namespace 的版本。
2. 同时核对商品实时分类归属与当前 Shop JSON 的分类 ID；重新触发真实购物车/结账计算，检查是否返回 `{"collectionId":"12277057487400872661322470","isMember":true}`。若仍为空，向平台提供活跃版本、输入查询、Shop Metafield 的 namespace/key/owner/value 和 SHOPLINE TraceID，核实动态参数注入；不把模拟输入的通过结果当作线上修复。
3. 验证原场景 4 件每件 USD 77 的优惠金额；再检查移出分类不打折，以及同时命中指定商品和分类时只使用指定商品规则。

当前完成了只读证据核对，并撤销了缺少依据的本地 namespace 修改；未形成新的生产代码变更。线上空分类输入根因和真实结账优惠仍未验收。临时只读诊断进程及其访问密钥已清理；本轮未发布 Function、未部署 Worker、未写入店铺数据。

## 验收与发布边界

- 本地：分类新增/移出、空集合、101 个分类、缺页/超限、排除商品、指定商品优先、订阅拦截、available 可售判断与售罄展示均有测试；桌面与 390px 手机使用受控数据检查。
- 真实 SLine 分页输出、SHOPLINE CDN 新资源，以及真实购物车/结账分类匹配需发布后实店验证；本地受控数据和 Go 测试不能替代。
- 需分别审查 Git 变更、部署 Worker、发布 Theme App Extension。Function 诊断或输入配置变更还需发布对应 Function。每次推送/发布均以用户针对本批次的授权为准。

## 分类与价格修改的 Git 记录

分类实时匹配、价格单位及 Function 空分类输入诊断已随 `398e018` 推送；这不代表线上 Function 空输入问题已解决。后续 available 可售规则修改的验证与发布状态见 `APP_PROGRESS.md` 对应记录。
