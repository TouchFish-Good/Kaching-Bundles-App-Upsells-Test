# Task7 本地视觉与交互证据

参考：`docs/reference/screenshots/gifts-bundles-section-toggle-reference.png`（原应用管理面板header）。本次沿用现有tokens和卡片，没有未见参考的店铺设计等价声明。

截图来自真实本地React editor/preview和两代主题实际JS/CSS，合成Products/接口/购物车。OS2.1使用实际Handlebars模板/helper fixture；OS3仍是原生DOM合同fixture，不是SHOPLINE原生编译或实店。已有Playwright与Chromium headless-shell1248，专用本地5277/5287服务已停止，临时web路由移除，无依赖安装/平台写入。

`before-*`均在Task7修改前捕获；`after-*`执行当前代码。React旧bundle quantity=3变为一槽位，theme after使用历史quantity=3验证固定1件；before theme为原quantity=1 fixture，视觉控件差异仍真实。React before390采用窄viewport，after390加viewport meta并采用mobile/touch context，均实际scrollWidth390。20PNG如下：

- [after-merchant-bundles-1440.png](after-merchant-bundles-1440.png)
- [after-merchant-bundles-390.png](after-merchant-bundles-390.png)
- [after-merchant-gifts-1440.png](after-merchant-gifts-1440.png)
- [after-merchant-gifts-390.png](after-merchant-gifts-390.png)
- [after-os2.1-1440.png](after-os2.1-1440.png)
- [after-os2.1-390.png](after-os2.1-390.png)
- [after-os3-1440.png](after-os3-1440.png)
- [after-os3-390.png](after-os3-390.png)
- [after-react-editor-1440.png](after-react-editor-1440.png)
- [after-react-editor-390.png](after-react-editor-390.png)
- [after-react-preview-1440.png](after-react-preview-1440.png)
- [after-react-preview-390.png](after-react-preview-390.png)
- [before-os2.1-1440.png](before-os2.1-1440.png)
- [before-os2.1-390.png](before-os2.1-390.png)
- [before-os3-1440.png](before-os3-1440.png)
- [before-os3-390.png](before-os3-390.png)
- [before-react-editor-1440.png](before-react-editor-1440.png)
- [before-react-editor-390.png](before-react-editor-390.png)
- [before-react-preview-1440.png](before-react-preview-1440.png)
- [before-react-preview-390.png](before-react-preview-390.png)

5份JSON：before-react-evidence.json、after-react-evidence.json、before-theme-evidence.json、after-theme-evidence.json、merchant-evidence.json。当前after无pageerrors或水平溢出。theme四场景记录native Space连续切换/有焦点时恢复、label或touch取消/勾选、single选择/取消、locked解锁与重新勾选、unready disabled、resize/remount保留v-c-2、一POST/五行/八件的模拟批量，bundle各1件。React实测multiple与single的Space、触摸、locked/recheck及unready。展开商家卡片图证明bundle数量编辑0、gift数量编辑2、两类主门槛各2。

人工检视了React preview390/editor1440、展开bundle390/gifts1440与theme移动前后；根控制器另检视theme桌面/移动和React图。保留商家可配标签（fixture Free gift）；去除自动附加的Included状态。产品图是既有合成插画，不代表真实商家商品。
