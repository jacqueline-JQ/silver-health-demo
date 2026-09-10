# 药安心 MVP v2 自动连续开发

基于73afbf0启动，工作区原干净；用户授权自动五步开发检查记录提交打标记，不推送不覆盖旧标记。MVP v2已完整阅读。

## Checklist
- [x] 第1步规则、UI、13组规则检查、46项浏览器检查完成；提交52f8cf3，标记mvp-v2-step-01已创建
- [x] 第2步首页、表单、BMI、取消入口清理；73项浏览器与13组规则通过，提交434878c、标记mvp-v2-step-02
- [x] 第3步iOS演示、N1/N2/N3、聚焦与模拟同步；59+22新增浏览器、75回归、22组规则通过；版本mvp-v2-step-03
- [x] 第4步双助手与复核补修完成；96项新增、134项回归、36组规则通过；版本mvp-v2-step-04
- [x] 第5步三系统及82项台账已落盘，701项浏览器/37组规则通过；最终复核通过，mvp-v2-step-05-fix-01补齐遗漏测试源码，原五步标签保留

## Verification
第1步：node tests/rules.test.cjs 13组通过；Playwright CLI运行tests/step01.browser.js共46项通过，0脚本错误；稳定截图及result.json在output/playwright/step-01/。
服务127.0.0.1:8765；独立测试会话yaoanxin-v2。CLI=/Users/jacqueline/.agents/skills/playwright/scripts/playwright_cli.sh。检查脚本不连接用户浏览器。

## Notes
纯规则模块rules.js供app.js及Node检查复用；全部状态仍由app.js commit保存。后台子代理未产出文件，已由主代理完成。

## Final Verification
第5步最终证据：output/playwright/step-05/；82项映射、检查名称及复现命令：output/验收/验收台账.md和JSON；统计重建：python3 tests/build-acceptance-ledger.py。701项浏览器/37组规则全部通过；未做真人读屏或真实服务验证，范围见output/验收/验证总览.md。

### 循环收尾的可复现核验

- 工作目录：`/Users/jacqueline/Documents/projects/复客松_20260913`。
- 在该目录的新Shell中执行：

  ```bash
  node tests/rules.test.cjs && node tests/notifications.test.cjs && node tests/conversation.test.cjs && python3 tests/build-acceptance-ledger.py
  ```

- 环境：PATH中可用Node和Python 3；无需额外环境变量、网络或浏览器服务。此命令重新运行37组纯规则，并检查已保留的浏览器证据；不代表重新运行701项浏览器检查。
- 必须保留：`rules.js`、`conversation.js`、`seed-data.js`、上述测试/台账脚本，以及`output/playwright/step-05/`内15份浏览器结果JSON和三份规则日志；它们均已纳入Git。
- 通过结果：规则13组、通知9组、解析15组；台账输出`items:82, browserChecks:701, ruleGroups:37, resultFiles:15`。
- 应用交付版本保持`ac5f25d` / `mvp-v2-step-05-fix-01`；本次只补齐循环收尾记录，保留原五步及补交标签，不推送远端。
