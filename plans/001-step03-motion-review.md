# 第3步视觉与动效复核

状态：已修复并复核。基准提交：434878c；本轮工作树对应 `mvp-v2-step-03`。范围：demo.css/demo.js 的桌面、横幅、展开返回，styles.css/app.js 的聚焦卡、普通弹窗、按钮反馈。参考 iOS 18，素材本地 SVG/CSS。

| Before | After | Why |
| --- | --- | --- |
| demo.js `showApp()` 每次从桌面打开都强制恢复图标起点 | 只在完全不可见时初始化起点，收起中反向沿当前 transition 继续 | 快速反向不跳回起点；补测通过当前矩阵差值而非仅检查最终状态 |
| styles.css `.page-content` 每次 render 有 page-in，toast 重复 keyframes | 高频页面更新和 toast 取消装饰性入场 | 避免打卡后整页移动，减少重复刺激 |
| app.js 退出视觉副本保留原按钮定位属性 | 副本 inert，移除 id/data-action/name，完成即删除 | 退出动效不留下第二个可操作表单或干扰权限检查 |

判定：Approve（限定本轮 iOS 网页演示）。展开／返回 280ms、横幅 260ms、弹窗 250ms（退出 200ms）、按压 120ms；自定义 ease-out，位移使用 transform/opacity。壁纸和日历结果不动，星星不做循环庆祝，聚焦闹钟仅短暂轻摆。应用真实从可见图标区域展开，因此起始缩放由图标/面板尺寸比计算，不使用 scale(0)。这是入口空间关系的特例，不套用通用弹窗 scale(.95)。

机会审查保留：图标展开、返回桌面、通知入场、弹窗关闭、按压反馈。明确跳过：药物数值、日历日期、BMI、历史记录、每次角色切换的装饰入场；这些信息以稳定阅读优先。减少动态效果时采用静态开关及颜色反馈，键盘触发取消位移动效，动作不等待动画结束。

实际检查：`tests/step03.extra.browser.js` 暂停真实 CSS transition 于中间帧截图；收起 100ms 后反向打开，当前矩阵连续；快速切换 iframe 同一实例；开启 reduced motion 后 transform 为 none。截图 `output/playwright/step-03/motion-midframe.png`，桌面／应用全景在同目录。已目视检查中间帧、材质、主按钮、窄屏与大字号；不以静态截图证明所有浏览器性能，也未测试实体系统手势。
