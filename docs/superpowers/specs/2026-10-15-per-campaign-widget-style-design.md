# 每活动独立组件外观与规格行为设计

状态：设计待商家审阅；不表示已实现、已发布或已在 SHOPLINE 店铺验证。

## 目标与已确认决策

每个多件优惠活动独立保存商品页组件的外观和规格行为。创建与编辑共用同一“样式”面板及实时预览。移除独立“组件外观”导航，不保留全局样式继承或覆盖层。旧地址 `/quantity-breaks/widget` 重定向到活动列表；不删除已有活动数据。

“显示库存状态”设置及面向顾客的剩余库存数字一并移除；缺货禁用、同 Variant 数量汇总、库存不足阻止加购和错误提示始终生效。款式图和对应可点击按钮的尺寸下限均为 10px，不强制扩大按钮命中区。“图片圆角”作用于完整图片区域及其裁切边界，选中边框与内部圆角协调，不只修改 `<img>` 而留下方形底色或溢出角。10px 点击目标在触屏上可能难以准确点选，不能据此声称满足触控无障碍要求；仍需保留可见键盘焦点与可访问名称。

`allowMixedVariants=true`：同一 Product 下不同 Variant 的数量合计命中阶梯。`false`：只有同一 Variant 的购买数量命中阶梯；前台选择器和 Discount Function 都执行该规则，购物车绕过 Widget 加购也不能获得不一致的优惠。跨 Product 混合计数仍不支持。

## 范围与现状

现有活动编辑器 `CampaignEditor.tsx` 只把强调色、规格展示方式、字号放入内存预览；`toCampaignDraft` 始终转发旧 `widget`，没有保存新编辑值。独立 `WidgetStudio` 同样只保存在页面状态。服务端 `CampaignDraft.widget` 是未验证的 `Record<string, unknown>`；需要改成可校验、可版本化的活动配置。主题扩展目前仍是模板，不能把原型预览当成真实店铺组件。

已确认的 Shopify 参考仅来自本次提供的三张截图：四种布局缩略图、圆角/间距滑条、颜色分组、字体尺寸与字重分组。未观察到的缩略图切换细节、取色器状态和保存反馈不得声称与原版一致；实现前需用可访问的参考页面或补充截图核对。仅借鉴交互结构，不复制品牌、素材或页面代码。截图中的免费赠品、胶囊色板等非 Quantity Breaks 功能不在本次范围。

## 商家界面

活动编辑顺序维持“商品 → 设置 → 样式 → 档位”，右侧仍为同一草稿的实时预览。样式面板按以下组组织，控制项修改后立即更新 PC/手机预览，取消编辑不写入活动，保存草稿后重新打开可还原：

1. 布局：四个带实际结构缩略图和可访问名称的单选项。首项沿用当前纵向档位布局；其余为紧凑横向卡片、网格卡片、简洁列表。布局仅改变展示，不改变档位、数量或折扣计算。
2. 卡片：圆角、卡片间距。预览中选中态的内外边框圆角一致，移动端不发生横向裁切。
3. 颜色：常规卡片背景、选中背景、边框、区块标题；优惠栏标题、副标题、价格、原价；标签背景和文字。色块与可编辑 HEX 值共用同一有效颜色状态。当前单一强调色迁移为一组显式默认颜色。
4. 字体：区块标题、档位标题、副标题、标签分别设置字号与字重；价格使用独立字号与字重。正文字号保留为基础字号。输入采用有界数值和标准字重选项，预览可在长译文下自动换行。
5. 规格：是否允许混购、是否展示独立规格选择器、Dropdown／原款式图／纯文本／色板、款式图大小与完整图片区域圆角、图片下方是否显示颜色值、原价/折后价展示。隐藏选择器仅在活动范围内每件商品都只有一个可售 Variant 时允许发布；否则提示商家保持选择器开启。草稿可保存以便后续补全商品范围。

不出现“显示库存状态”开关或“剩余 X 件”标签。售罄文本、图片透明度、禁用态与库存不足错误属于安全反馈，不由商家关闭。`showOriginalAndDiscountedPrice` 只控制比较价格与节省金额的展示，不改变 Function 实际优惠。

设计控件采用现有中性黑白后台视觉，蓝色仅用于已有交互强调。布局缩略图和颜色组对齐用户截图的密度、分组、标签层级；不额外引入营销卡片、渐变或动画。移动端样式配置改为单列，色彩控件按容器宽度换行，预览可切换设备且不与输入遮挡。

## 活动数据契约

服务端 `CampaignDraft.widget` 改为显式 `CampaignWidgetConfig`，由前后端共享字段及约束；前台主题接口只暴露渲染所需的只读快照。配置结构：

```ts
type CampaignWidgetConfig = {
  version: 1;
  layout: 'stacked' | 'compact' | 'grid' | 'list';
  card: { radiusPx: number; gapPx: number };
  colors: {
    card: string; selected: string; border: string; sectionTitle: string;
    title: string; subtitle: string; price: string; comparePrice: string;
    badgeBackground: string; badgeText: string;
  };
  typography: {
    bodyPx: number;
    sectionTitle: { sizePx: number; weight: 400 | 500 | 600 | 700 };
    title: { sizePx: number; weight: 400 | 500 | 600 | 700 };
    subtitle: { sizePx: number; weight: 400 | 500 | 600 | 700 };
    price: { sizePx: number; weight: 400 | 500 | 600 | 700 };
    badge: { sizePx: number; weight: 400 | 500 | 600 | 700 };
  };
  variants: {
    allowMixedVariants: boolean;
    showSelectors: boolean;
    selectorStyle: 'dropdown' | 'images' | 'text' | 'swatches';
    imageSizePx: number; imageRadiusPx: number; showImageColorValue: boolean;
    defaultSelection: 'first_available' | 'none';
  };
  showOriginalAndDiscountedPrice: boolean;
};
```

服务端校验 `#RRGGBB` 色值、枚举、布尔值与整数范围：卡片圆角 0–24px、间距 0–32px、图片尺寸 10–96px、图片圆角 0–24px；正文字号 12–20px，区块标题/档位标题/价格 12–28px，副标题/标签 10–20px。前端控件与服务端使用同一边界。未知字段拒绝保存，不悄悄丢弃。旧活动 `widget` 缺失时读取为稳定默认配置；重新保存前不改写数据库。旧草稿里已有但未识别的 `widget` 属性须先盘点，不能无声覆盖。活动适配器双向传递配置；实时预览与保存使用同一草稿对象。

公共文案的翻译页继续存在，档位标题、副标题和标签仍随活动设置；本次不迁移翻译数据。最终语言回退继续遵守现有 11 语言规范。当前演示商品与原型金额仅用于本地视觉预览，真实商品页必须使用商品目录数据及当前市场价格。

## Function 与发布约束

发布规则加入 `allowMixedVariants`。新规则采用递增的 `schemaVersion`，旧版本按 `true` 解释以维持已发布活动的现有行为。必须先部署能读取新旧版本的 Function，再允许发布关闭混购的活动；不能让旧 Function 静默忽略新字段。

开启混购：按 Product ID 汇总合格购物车行数量，命中最高已达档，对该 Product 的每条 Variant 行分别计算并输出折扣。关闭混购：按稳定 Variant ID 汇总（同一 Variant 分成多条购物车行时仍合计），每个 Variant 组独立找最高已达档，只折扣该组行。例如 A×1、B×2 在 3 件档下不能合计命中 3 件档；B 可独立命中 2 件档。不同 Variant 单价继续逐行计算并按当前金额精度舍入。

**平台能力门槛：**当前 `product-discount-customizations/input.graphql` 只请求 Product ID，生成的 `ProductVariantInput` 模型也没有 Variant ID。`sku`/`skuCode` 可能为空或不唯一，购物车行 ID 不能替代 Variant ID。实施前必须用 SHOPLINE Function schema/官方资料验证稳定 Variant 标识是否可查询，并以真实输入测试。未验证或不可用时，UI 可保存关闭混购的草稿，但必须阻止其发布，明确提示原因；不能仅限制前台选择，也不能猜测 SKU。不得虚构 GraphQL 字段。

外观设置不进入折扣计算规则；只同步 `allowMixedVariants` 等确实影响资格判断的业务字段。保存活动与平台折扣更新不应被当作一个已原子完成的操作：平台更新失败时保留可恢复错误与未同步状态，不宣称结账规则已经更新。

## 主题组件与异常处理

Theme Extension 按匹配活动读取其配置快照；无活动、未启用、规则未同步或配置无效时不得显示可购买的优惠。色彩、字体和布局用受限 Token/样式变量实现，不直接注入商家字符串到 CSS。图片半径应用在承载图片的完整区域及 `overflow: hidden` 裁切层；图片与对应可点击按钮均允许缩至 10px，不额外强制 44px 命中区域。

所有布局共享同一数量档位选择、规格槽位、库存检查和购物车原子批量加购逻辑。切换布局、设备或编辑样式不重置已选档位与规格；库存变化时重新验证。缺图回退为可读文本选项；售罄仍可辨识且不可选；颜色和文字需满足基本对比度。预览价仅供说明，结账价格以 SHOPLINE 为准。

## 验收与非目标

- 前端：创建和编辑分别修改、保存、刷新后还原独立样式；两个活动互不影响；旧活动默认值稳定；四种布局在 1440/768/390px 无溢出；颜色、字体、间距、圆角及时预览；图片和对应按钮最小 10px、完整圆角；无库存开关但售罄与库存不足反馈保留。
- 服务端：按活动保存和校验 `widget`；非法颜色/枚举/数值拒绝；旧记录兼容；保存失败不显示成功；旧路由重定向，活动入口与翻译页正常。
- Function：旧版规则兼容；混购开启/关闭、同 Variant 多行、不同价格、1/2/3/4/5 件与最高已达档、市场金额、无效 Variant 标识和规则版本均有测试。未取得稳定 Variant ID 前，关闭混购不得发布。
- 集成：主题扩展读取正确活动配置；真实购物车、结账、库存及市场场景在授权开发店验证。不能用原型构建成功替代 SHOPLINE 集成验收。

不实现截图中的免费赠品、胶囊色板或其他非多件优惠功能；不部署、不改真实店铺活动、不未经确认推送。此设计需与现有 SHOPLINE API 研究及正式接入计划交叉核对，发现平台差异时先更新设计并请商家确认。
