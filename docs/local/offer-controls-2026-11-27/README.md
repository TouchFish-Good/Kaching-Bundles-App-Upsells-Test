# 赠品与捆绑控件、预览加载修订

仅测试环境；用户已确认10项方案、零Save隐藏，以及本批推送并部署测试Worker。基线fac16c6，测试Git https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git ，分支codex/gifts-bundles-test。

- 保留用户先改的quantity-breaks.module.css、CampaignStyleEditor.tsx、offer-module-controls.module.css、offers.module.css。
- 简中赠品位置逐字为“边框居中／商品标签下面”。间距、尺寸、圆角为range＋像素输出；新增PC/Mobile独立可选badge.radiusPx，缺省保持4px，不改旧活动。
- 赠品显示图片与优惠金额置于同div；隐藏轮播滚动条。零优惠隐藏卡片及赠品明细Save。捆绑所有列数整卡可选，排除下拉及原生嵌套控件；指定data-selection-focused及主题对应自定义outline移除。
- 单列捆绑价格第一行，图片与标题/标题下标签第二行，款式下拉最后全宽；两个名称字段同一行。
- 预览按当前hook实例、市场/币种/国家/语言及fetcher隔离缓存，5分钟TTL自动刷新；增删选项只请求缺少商品款式，不清空已有有效预览。保留429冷却、abort和revision保护；跨TTL回包缺口补取一次，服务端真实漏返不无限循环。

## 验收证据

reference-bundle-one-column.png为用户参考；editor-settings-pc.png、editor-range-pc.png为编辑页；preview-one-column-pc.png、preview-one-column-mobile.png为本地预览；zero-save-hidden-pc.png中6卡无data-offer-savings；native-one-column-selected-pc.png为实际OS2.1模板本地整卡勾选。均为本地合成数据，不是线上交易验收。名称字段实际DOM同y、各368px；标签滑块键盘4→5px生效。

复审发现并修复同key TTL不刷新、429等待旧款式到期、同产品增量网络请求跨TTL三个边界。构建与定向检查最终结果见verification.json。全Web曾因磁盘ENOSPC中断，未宣称全套通过；只清除可重新生成的Vite缓存。主题既有默认间距10px与8px断言仍失败。正式725文件和测试身份哈希不变见protection.json。

本次仅部署Worker和管理端资源；主题代码已同步到仓库，两代app-block需要单独上传主题扩展才能进入真实店铺。本次未上传扩展、未发布应用版本或修改真实购物车。
