# 指定商品与指定分类 Function 折扣发布设计

日期：2026-10-21

## 目标与边界

商家选择真实商品 ID 或分类 ID 后，应用创建可在 SHOPLINE 折扣后台核对、可在结账命中的 Function 自动折扣。分类范围直接使用分类 ID：新增或移出分类的商品由 Function 在结账时依据 SHOPLINE 当前成员关系判断，不把发布时的商品列表当作结账规则。发布前读取全部分类成员，只为本应用活动范围冲突检查。`all` 范围、未来开始的定时发布和第三方活动冲突检测不在本次范围内；现有明确禁用状态保持。

这改变现有 2026-10-20 指定商品设计中“分类展开 Product ID 并同步规则”的后续设想。参考积分应用的目录与 REST 创建形式，但其分类 Product ID 快照不是本方案的结账实现。

## 文档依据与现状

桌面《SHOPLINE Product Discount Functions 指引文档（公测版）》1.2 规定：向 Shop 所有者的 JSON Metafield 写 `inCollections` 分类 ID 列表；Function TOML `[input.variables]` 指向同一 namespace/key；GraphQL 声明 `$inCollections: [String]` 并传给 `cart(inCollections: $inCollections)`；商品返回 `inCollections { collectionId isMember }`。项目生成模型已有该字段，当前 `input.graphql`、TOML 和 Go 规则却没有接入。指定商品发布已经使用 `POST /sales/discount_automatic_app.json` 与节点 `sale/quantity_breaks` 规则；分类发布被控制器、仓储阻断，校验仍要求 `resolvedProductIds`。真实店的 REST 创建合同、扩展部署和结账命中仍未验收。

## 数据与 Function 输入

- 每条折扣节点的 `sale/quantity_breaks` 继续保存活动私有规则：`scope.kind`、`productIds` 或 `collectionIds`、排除商品 ID、档位、币种与市场设置。分类规则要求非空、唯一的 `collectionIds`，不要求 `resolvedProductIds` 才能运行；旧草稿中的该字段仅作冲突检查快照，不能作为结账命中依据。
- 一家店的专用 Shop Metafield 使用应用私有 namespace/key，JSON 值为 `{ "inCollections": [分类 ID 并集] }`。该并集覆盖所有已发布、正在发布、暂停结果不确定的本应用分类折扣；不能用单个活动的列表覆盖其它活动。Function 从节点规则取本活动的 ID，再与 `product.inCollections` 中 `collectionId` 和 `isMember` 同时匹配。先执行 `excludedProductIds`，再判断指定商品或分类。空值、缺失成员信息或 ID 不在本活动列表时不折扣，不能扩大范围。
- `input.graphql` 与 TOML 使用完全相同的变量名、namespace/key。Go 模型如需重生成，使用项目既有 Function 工具链；测试直接构造分类成员为真/假、多个活动不同分类、排除商品、多 Variant 数量和现有币种规则的输入。

## 发布编排与一致性

服务端从受鉴权会话取得店铺 handle，用安装时记录或经 Admin 查询得到的可信数字 `store_id` 写 Shop Metafield 的 `owner_id`、`owner_resource=Shop`。不能用 handle 冒充数字 ID。先核对所需写入权限和目标店 Metafield 接口合同；权限不足、店铺 ID 不可信或写入结果未确认时阻止创建折扣。`read_store_information` 在可信身份仍依赖它时保留。

发布分类活动时，服务端逐个核对分类存在，分页读取全部当前商品 ID，按排除规则计算范围并与同店已发布及正在发布活动重叠检查。指定商品照现有服务端核验流程执行。冲突检查和发布状态转换须按店铺串行化，进入发布状态后再次使用当前成员快照检查；并发请求不得各自越过冲突检查。成员在核对之后变化无法由静态检查保证无冲突，见下节。

分类并集的写入顺序为：取得店铺级互斥、计算包含当前活动及所有必须保留活动的并集、写入并读回确认 Metafield、然后创建折扣；只有明确收到 `app_discount_id`，才将本地活动标记 `active`。明确拒绝且确定未创建时可按受保护的当前状态收缩并集；网络超时、5xx、缺少确认 ID 或本地提交失败时保持 `needs_reconciliation`，保留该活动分类 ID，禁止盲目重试。暂停时先确认平台折扣删除，再在互斥下从并集移除不再被其它活动使用的 ID；删除不确定时保留并集和待核对状态。数据库状态、远端 Metafield 和折扣无法做跨系统事务，因此重启后也须保留待核对记录和足够的操作阶段，按只读平台结果核对后人工或受控恢复；不能仅凭草稿状态清锁。

重建并集不能只看 `active` 活动，必须纳入 `publishing`、`unpublishing` 和 `needs_reconciliation` 中可能仍存在的折扣。发布/暂停与恢复操作共用同一店铺级串行化机制；多进程部署时应使用持久化锁或等效原子协调，进程内 mutex 不足。并集写入失败时停止后续平台操作；清理失败时保留多余 ID 并记录需恢复状态，不能删掉仍在使用的 ID。

## 运行中成员变化

Function 对当前分类成员实时判定，因此新加入的商品无需同步 Product ID 快照也可命中，移出的商品停止命中。应用内“活动不可覆盖同一商品”的业务规则仍要求持续检查：分类成员变化可能使两个原本不重叠的活动冲突。本次实现定期完整复查同店已发布活动的分类成员，发现冲突时标记相关活动需处理、阻止新的冲突发布，并在管理页展示冲突；复查失败也不能宣称范围无冲突。Function 另作结账兜底：同一商品同时命中多个本应用折扣节点时，该商品不返回本应用折扣，其它无冲突商品仍正常计算。若平台的 Function 调用不会同时提供这些节点，真实店验收必须识别该限制并阻止分类功能上线，不能靠本地测试声称保证不叠加。

## 真实店门槛与验收

先确认目标店 Product Discount Function 已构建、上传、经应用版本发布并且配置的 Function ID 属于该店；本地 WASM 文件不足为证。以目标店文档/响应核对 Shop Metafield 写入、REST 创建/删除合同和权限，不把参考代码或模拟测试当作平台保证。一次受控指定商品发布和一次指定分类发布应分别确认返回折扣 ID、SHOPLINE 后台记录、分类内与分类外购物车/结账结果；再验证分类新增/移出成员、排除商品、多 Variant、暂停及失败恢复。未经实际执行的验收项保持未验证，发布开关继续默认关闭。保留参考与本地桌面/移动截图，更新 `docs/APP_PROGRESS.md`，不得把令牌或完整敏感 cURL 写入测试、文档或 Git。

自动化测试覆盖 Function 分类匹配、Shop Metafield 并集与失败顺序、店铺并发、目录完整分页、范围冲突、REST 拒绝/不确定结果、重启恢复以及指定商品回归。后端与 Function 构建、测试和前端类型检查通过后，才进入真实店验收；本地通过不能标记 SHOPLINE 集成为已完成。
