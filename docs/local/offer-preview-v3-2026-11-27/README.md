# 赠品／捆绑独立预览与模块设置（2026-11-27）

仅测试目录本地实施，未提交、推送或部署。正式目录725个基线文件哈希均未变化；测试身份配置及本批wrangler配置未变化，见 protection.json。

## 本批行为

- 本应用Worker新增 `/api/quantity-breaks/gifts/preview` 与 `/api/quantity-breaks/bundles/preview`；各自状态、商品缓存、300ms合并编辑请求。未变商品保留缓存引用，卡片memo跳过无关渲染，事件仍使用最新回调。
- 两模块按店铺会话共享串行请求与429冷却，读取Retry-After。Worker也共享队列；取消贯穿身份核验、货币、市场和款式请求。接口拆分不意味着SHOPLINE有独立限额，跨Worker实例也不保证全局限流。
- 显示图片、标签位置为各模块公共设置；赠品额外含公共显示优惠金额。字体大小为number input，间距／图片尺寸／圆角仍为range。
- 单列捆绑主体与赠品一致，左图右标题及款式选择。顶栏无优惠时左复选框右售价；有优惠时左复选框＋折扣价，右优惠金额＋原价。零Save隐藏。
- 当前款式图片优先，缺图回退商品图。商家可选款式中，确认缺货的label标注 `(Sold out)`；预览和主题继续隐藏缺货款式，默认首个可售，全缺货隐藏商品。

## 验证范围

本地模拟接口和实际React／OS2.1模板渲染，保留PC有优惠、无优惠、Mobile及主题截图；款式图切换和选中交互已执行。OS3与OS2.1生成资源同步检查通过。没有执行真实商家保存、线上主题上传、真实加购或结账，不代表线上或整应用验收。

自动测试涵盖双路径、共享429、增量缓存、未变卡片渲染计数及最新回调、取消传播、模块配置、缺货标记与布局。详细结果补录于下方。

SHOPLINE文档依据：https://developer.shopline.com/docs/apps/api-instructions-for-use/shopline-api-rate-limit

## 截图

- preview-discount-pc.png：有优惠PC
- preview-no-discount-pc.png：无优惠PC
- preview-mobile-selected.png：手机捆绑选中与图文布局
- native-single-column.png：实际本地OS2.1模板卡片

## 最终检查结果

- Web目标回归67/67；共享／跨Go层42/42；Worker目标29/29。
- 主题全套166/167，唯一既有失败为默认间距断言10px与8px不符（widget-mount.test.mjs），本批未修改该规则。
- Web build、Web/Worker TypeScript、shared/theme同步检查及git diff --check均通过。
- 首轮跨Go层因磁盘不足链接失败，清理可重建Go缓存后42项重跑通过。首轮旧Web测试仅识别合并接口，更新mock路径和300ms debounce等待后完整67项通过。
- 最终独立只读复审确认取消信号已贯穿真实helpers，未发现阻塞问题。
- 未执行完整Web全套或真实店铺端到端验收，不将本地模拟结果等同线上验证。
