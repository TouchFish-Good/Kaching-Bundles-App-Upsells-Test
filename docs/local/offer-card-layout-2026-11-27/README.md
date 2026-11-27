# 赠品／捆绑卡片布局（本地验收）

仅测试目录，未提交、未推送、未部署。保持折扣、额度和加购规则。

## 实现

- 赠品实际单列：左图，右侧标题、优惠金额、款式下拉；多列全部居中。
- 捆绑实际单列：第一行复选框／折后价／优惠金额／原价；第二行图与换行标题；底部全宽下拉。
- 捆绑多列：视觉隐藏原生复选框，整卡点击选中；图片／标题居中，价格行自动换行。原生键盘 Space／Enter 切换，款式控件不触发卡片切换。
- 按实际有效列数响应；图片不超过单列内容区35%，保留标签与锁层。

## 浏览器证据

before-one-column.png、before-three-columns.png 为修改前参考。
after-one-column-pc.png、after-two-columns-pc.png、after-three-columns-pc.png、after-one-column-mobile.png 为本地React预览。
native-one-column-pc.png、native-two-columns-pc.png、native-three-columns-pc.png、native-mobile.png 为真实OS2.1模板本地渲染；两代生成JS/CSS同步检查通过。
large-image-narrow-container.png 为400px图片配置、200px窄容器实际降列，无卡片横向溢出。
carousel-end-pc.png 为轮播到尾，Next按钮隐藏。

交互实测：React整卡点击选中、Space取消；主题整卡点击选中、下拉S→L保持选中且更新金额、Enter取消。未执行真实店铺写入。

## 检查

目标React55/55；跨层37/37；主题164/165（既有默认间距10px对8px断言）；全Web403/416（13项既有失败，见verification.json）。构建、TypeScript、canonical与两代资源同步通过。正式目录725文件哈希及测试身份配置保持。详见protection.json。

复审发现并修复：单列图片列缺少35%上限；单列捆绑价格／选择器被通用CSS权重覆盖。新增实际CSS回归并浏览器复核。整应用、线上及真实商家流程不在本次验收范围。
