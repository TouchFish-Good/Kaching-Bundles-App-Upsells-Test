# SHOPLINE 原生订阅与权益同步设计

## 状态

设计已在对话中确认，等待书面规格审阅。本文覆盖并取代此前订阅设计中有关应用内套餐页、自建试用入口、`create_pay` 新订单和以 D1 权益阻断首次应用进入的规则。保留已验证的店铺隔离、权益复查、主题 fail-closed、失效暂停、续费后不自动重新发布和定时对账规则。

## 目标

“多件优惠 / Multi-item discount”只销售一个由 SHOPLINE 配置和展示的应用套餐：`Ultra`，每 30 天 USD 9.99，订阅组配置 7 天试用。SHOPLINE 原生套餐页是唯一的试用、购买、续费和未来套餐选择入口；应用不展示或创建第二个付款流程。

应用仍须以 Partner Subscription API 的订阅和权益数据维护一份 D1 镜像。该镜像用于主题公开接口、折扣发布保护、失效暂停任务、审计和故障恢复。试用入口仍由 SHOPLINE 原生套餐页提供；无有效权益或其他套餐时，应用自己的订阅页提供付费 Ultra 的付款链接。

## 已确认业务规则

| 范围 | 规则 |
| --- | --- |
| 首次授权 | 商家授权后进入应用时同样必须执行 Partner `list + detail`；没有确认有效权益就显示应用付费套餐页。 |
| 后续进入 | `trial`、正在订阅的 Ultra（`active` + `paid`）和 `grace` 直接进入应用；无有效权益或其他套餐时进入应用自己的订阅页。应用订阅页不显示试用按钮。 |
| 试用 | 7 天试用只能由 SHOPLINE 原生套餐页开始。应用不提供“开始试用”按钮、`intent=trial` 或本地试用资格判定。 |
| 有效权益 | `list.json` 返回本店当前 `Ultra` 的 `active` 订阅，且 `detail.json` 的 `feature_key_list` 含精确值 `quantity_breaks_access`。`trial` 是有效权益，`paid` 是有效订阅类型，`preorder` 不能单独授权。 |
| 首次未订阅 | 允许草稿和应用内预览；不可发布、启用或让主题组件在店铺前台生效。 |
| 到期和续费 | 宽恕期为 1 天。失效后主题先 fail-closed；连续两次权威确认无权益后暂停活动。之后重新付款可恢复权益，但不自动重新发布曾因订阅失效暂停的活动。 |
| 套餐扩展 | 以后在 Partner 后台新增或调整套餐时，应用订阅页根据当前套餐状态显示付费 Ultra；同一订阅组中的其他套餐使用当前 `subId` 进行升级。 |

这些平台规则来自用户提供的《应用订阅配置说明.docx》及用户对原生入口行为的确认。在线官方文档检索在设计阶段因环境网络策略不可用；实现前不得根据猜测新增原生套餐页唤起、试用或付款字段。

## 责任边界

| 层级 | 唯一职责 |
| --- | --- |
| SHOPLINE 原生应用入口和套餐页 | 判断是否允许后续进入应用；展示 Ultra、试用和付款；处理自动续费和套餐选择。 |
| Partner Subscription API | 向 Worker 提供店铺实际订阅记录及订阅权益。 |
| Cloudflare Worker | 以 `list.json + detail.json` 复查权益，维护 D1 镜像，保护公开主题和生产生效动作，消费 Webhook 和失效任务。 |
| React 管理后台 | 提供活动编辑与预览；不显示支付卡、试用 CTA、价格卡或自建续费入口。 |
| 主题扩展 | 只在 Worker 明确返回有效活动时渲染；所有未知或无权益响应均清空并隐藏组件。 |

## 订阅判定

应用判定的是“当前可用权益”，不是单独判定“付款完成”。试用由 SHOPLINE 原生套餐页开始；付费 Ultra 和续费由应用订阅页在商家点击按钮后调用 `create_pay`，之后仍必须通过 `list + detail` 确认权益。

```text
list.json(app_key, handle, service_type=1)
  -> 仅保留 handle 匹配、spu_key=ultra、sub_status=active 的记录
  -> 按 end_at 从晚到早检查
  -> 对每个候选调用 detail.json(app_key, handle, sub_id)
  -> feature_key_list 含 quantity_breaks_access？
       是：sub_type=trial 或 is_trial=true -> D1 state=trial
           否则 -> D1 state=active
       否：继续检查下一个候选
  -> 没有候选：按现有权益和时间进入 unknown、grace、review_pending 或 inactive
```

`trial` 不是付款，却是 SHOPLINE 已生效的权益，因此与 `active` 一样允许发布和主题渲染。`preorder` 只代表下一期，不能覆盖当前订阅。Partner 网络错误不等于未付款：保留最近确认状态并安排重试，绝不直接把店铺设为失效。

Partner Subscription API 基础版本统一为用户确认可继续使用的 `v20260901`。实现必须通过开发店检查 `productList`、`list`、`detail`、`charges/status` 和 Webhook 的实际契约；不能把旧 `v20220901` 字段假定为完全一致。

## 商家流程

### 首次授权与创建

```text
OAuth 成功
  -> /quantity-breaks
  -> 读取缓存并在后台发起 list + detail 同步
  -> list + detail 未确认有效权益
  -> /quantity-breaks/plan
  -> 只有付款并确认权益后进入管理后台
  -> 主题公开接口无活动
```

首次进入也不绕过订阅复查。没有确认有效权益时显示应用付费套餐页；试用仍只能从 SHOPLINE 原生套餐页开始。

### 后续进入、原生试用或付款

```text
商家从 SHOPLINE 打开应用
  -> 应用启动同步 list + detail
  -> trial / active paid Ultra / grace：直接 /quantity-breaks
  -> 无有效订阅或当前是其他套餐：/quantity-breaks/plan
       -> 显示 Ultra 价格和功能点
       -> 不显示试用按钮
       -> 商家点击付费订阅/续费
       -> Worker 查询 SKU、写入订单并调用 create_pay
       -> 回跳查询 charges/status，再用 list + detail 确认权益
       -> 确认后回到 /quantity-breaks
  -> Publish / Activate / Resume 和主题公开接口开放
```

付款后列表数据可能短暂延迟。`appsubscription/create` 或 `appsubscription/paid` Webhook 以及应用进入同步都要立即执行复查；收到付款提示但尚未在 `list` 中看到订阅时写入 `review_pending`，使用有限短退避重试。不能仅凭支付 Webhook 或浏览器页面开放活动。

### 到期、宽恕期和晚续费

```text
有效订阅结束
  -> 保留已确认 valid_until 后 1 天 grace
  -> grace 结束：主题先 fail-closed
  -> 两次成功 list + detail 都无有效权益
  -> state=inactive，创建暂停任务
  -> 删除 SHOPLINE Function 自动折扣
  -> 本地活动 paused，原因 subscription_expired

商家数天后经 SHOPLINE 原生页付款
  -> paid/create Webhook 或进入应用触发 list + detail
  -> 找到新的 active Ultra 且含 quantity_breaks_access
  -> state=active，取消仍待执行的失效任务
  -> 不自动重建已删除自动折扣，不自动重新发布 paused 活动
  -> 商家检查后手动 Publish / Activate，创建新的平台自动折扣
```

若晚续费发生在暂停任务执行前，新的有效权益会取消旧任务，现有活动保持原状态。若已暂停，恢复权益只恢复访问能力。乱序的 `expiration`、`create` 和 `paid` 事件均重新查询当前订阅，因此旧失效事件不能覆盖新有效权益。

浏览器刷新同一个嵌入页面不是一次新的 SHOPLINE 应用进入，不能作为开始试用、重新打开原生套餐页或结束试用的依据。应用不能以刷新次数、Cookie 或浏览器本地时间创造试用权益；只有 Partner 返回的实际 `trial` 记录才能标识 7 天试用期及其 `end_at`。

## API 与路由调整

### 保留和修改

| 接口或路由 | 新行为 |
| --- | --- |
| `GET /api/quantity-breaks/subscription` | 保留为已认证的权益同步和状态投影接口。应用进入时调用 `list + detail`；返回当前订阅类型、套餐 key、宽限期和 `planPageRequired`，驱动是否显示应用订阅页。 |
| `POST /api/quantity-breaks/subscription/checkout` | 保留为付费 Ultra 订阅/续费入口，只在商家点击应用订阅页按钮后调用；不接受 `intent=trial`。无当前订阅或已过期时不传 `subId`；同一订阅组中的其他套餐升级时传入当前 `subId`。 |
| `GET /api/quantity-breaks/subscription/callback` | 临时保留，仅处理部署前已经创建的历史订单：查询 `charges/status`，触发复查，随后重定向到 `/quantity-breaks`。 |
| `appsubscription/create`、`appsubscription/paid`、`appsubscription/expiration` | 校验签名、app key、安装店铺和事件幂等性后，只入队并立即复查。订单关联仅是历史订单兼容逻辑。 |
| 到期任务执行器 | 至少每 15 分钟领取 D1 中到期的复查与暂停任务。到达 `valid_until + 1 天宽恕期` 时先复查；连续两次无权益后才暂停活动。 |
| 每日 Cron | 扫描 `active`、`grace`、`review_pending` 及有待处理操作的店铺；逐店复查并执行到期操作，单店失败不阻断其他店。它是遗漏事件和长期漂移的对账，不是到期暂停的唯一触发器。 |

### 兼容和退役

| 接口或路由 | 新行为 |
| --- | --- |
| `/quantity-breaks/plan` | 保留为无有效权益时的付费 Ultra 页面；有效 `trial`、付费 `active` 和 `grace` 读到后立即回到 `/quantity-breaks`。页面不提供试用入口。 |
| `productList.json` | 仅在商家点击应用订阅页的付费按钮后查询 Ultra SKU；不在页面加载时创建付款。 |
| `create_pay.json` | 仅在商家明确点击付费订阅/续费后调用；付款成功仍不能绕过 `list + detail`。 |
| `intent=trial`、`trialEligible`、本地试用账本 UI | 从 API 和前端移除。试用由 SHOPLINE 原生页面提供；历史账本可保留以兼容已迁移数据，但不参与试用按钮或页面判定。 |

## 服务端授权边界

为了兼容 SHOPLINE 的首次授权直接进入体验，不能再把“所有后台写接口”统一建立在 D1 有效权益之上。权限按影响范围拆分：

| 操作 | 未确认权益 | `trial` / `active` / `grace` | `unknown` / `review_pending` / `inactive` |
| --- | --- | --- | --- |
| 读取活动、编辑器数据、翻译和样式 | 不进入工作区，显示套餐页 | 允许 | 不进入工作区，显示套餐页 |
| 创建、编辑、保存草稿、应用内预览 | 不进入工作区 | 允许 | 不进入工作区 |
| Publish、Activate、Resume、创建或恢复平台自动折扣 | `403 SUBSCRIPTION_REQUIRED` | 允许 | `403 SUBSCRIPTION_REQUIRED` |
| 主题公开接口和组件渲染 | 不返回活动 | 返回活动 | 不返回活动 |

浏览器收到 `SUBSCRIPTION_REQUIRED` 时，必须清除任何乐观的发布状态和前台预览数据，并进入 `/quantity-breaks/plan`。套餐页只显示付费订阅/续费按钮，不显示试用按钮。

## 应用订阅页

`/quantity-breaks/plan` 是无有效 Ultra 权益时的付费订阅页，不是试用页。页面显示应用名称、应用语言选择器、Ultra、USD 9.99 / 30 天、能力说明和当前阻断原因。

页面出现条件：

- 没有当前 `trial`、`active paid` 或 `grace` 的 Ultra 记录；
- 当前有效订阅属于其他 `spuKey`；
- 当前 Ultra 已 `expired`、`unactive`、`cancelled`，或详情缺少 `quantity_breaks_access`；
- 当前处于 `review_pending` 时显示核验态，不立即显示可重复付款按钮。

页面不出现“免费试用”按钮。商家点击“订阅 Ultra”或“立即续费”后，才请求付费 checkout。若当前是同一订阅组的其他套餐，传入当前 `subId` 作为升级依据；若没有当前订阅或原订阅已失效，不传 `subId`。试用中的 Ultra、正在订阅的 Ultra 和宽限期中的 Ultra 不显示此页面。

## D1、队列和主题

现有 `quantity_breaks_entitlements`、操作队列、历史订单和事件去重表继续使用 `(app_key, handle)` 作为租户边界。新的原生方案不需要新迁移来存储套餐价格或试用资格。

有效权益写入时取消同店旧版本的失效任务。失效任务在 D1 状态变为 `inactive` 后才删除平台自动折扣并暂停本地活动。明确不可恢复的错误标记失败而不无限重试；临时错误按受限指数退避。所有任务、Webhook、订单兼容查询和公开接口都不得跨店读取或写入。

主题公开接口继续仅接受有效的 `trial`、`active` 或未过期 `grace`；`unknown`、`review_pending`、`inactive`、非 200 响应和异常 JSON 都必须清空容器并隐藏，且响应保持 `no-store`。

## 错误处理

| 场景 | 行为 |
| --- | --- |
| Partner `list/detail` 网络或 5xx 失败 | 保留最近确认状态，安排复查；不得把失败误判为未付款。主题仍受已确认有效期限制。 |
| 原生付款通知先到、订阅尚未可见 | `review_pending`，短退避复查；不提前返回主题活动或开放发布。 |
| 已付款但缺少 `quantity_breaks_access` | 保持无权益，记录安全诊断；不以 Ultra 名称或付款状态替代 feature key。 |
| 首次授权没有订阅 | 显示应用付费套餐页；主题不渲染活动。 |
| 直接打开 `/quantity-breaks/plan` | 显示付费 Ultra 订阅页；没有试用按钮，只有商家点击后才创建付费链接。 |
| 商家未点击 checkout | 不写订单、不调用 Partner `create_pay`。 |
| 当前是其他套餐 | 显示 Ultra 订阅页；同组升级时使用当前 `subId`，最终仍由 `list + detail` 授权。 |
| 旧回跳或重复 Webhook | 幂等处理并复查；不得重复授权、暂停或跨店更新。 |

## 验收标准

自动化测试必须覆盖：

- 每次进入应用都先执行 `list + detail`；首次授权无有效权益时显示套餐页，主题不返回活动。
- `trial`、`active paid Ultra` 和 `grace` 不显示 `/quantity-breaks/plan`；无权益或其他套餐显示该页且不含试用按钮，付款必须由商家点击后才调用 `create_pay`。
- 试用状态不显示应用自建试用按钮；付费 checkout 的 `subId` 在其他套餐升级与无订阅/已失效两种场景下分别正确传入或省略。
- 应用启动的 `list + detail` 同步能把有效试用写为 `trial`、付费写为 `active`，且只有 feature key 完整时允许发布。
- `preorder`、错误 `handle`、缺少 feature key、Partner 空响应和网络异常不会授权。
- 原生付款通知的延迟可见性进入有限 `review_pending` 重试；重复、乱序、伪造及跨店 Webhook 保持隔离。
- 到期宽恕期、15 分钟到期复查、两次确认失效、主题隐藏、自动折扣删除、暂停原因和晚续费后手动重新发布均保持现有行为。
- API 版本请求为 `v20260901`，且不把 token、Partner 原始响应或订单敏感数据写入浏览器或日志。

开发店验收必须实际记录：首次授权进入并保存草稿、下一次进入的原生试用页、原生试用开始后的权益同步、原生付款后的权益同步、到期后的原生套餐页、晚续费后的活动仍暂停、商家手动重新发布以及主题隐藏和恢复。未实际执行的项目不得标为已验证。
