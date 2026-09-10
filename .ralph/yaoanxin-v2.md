# 药安心 MVP v2 自动连续开发

基于73afbf0启动，工作区原干净；用户授权自动五步开发检查记录提交打标记，不推送不覆盖旧标记。MVP v2已完整阅读。

## Checklist
- [x] 第1步规则、UI、13组规则检查、46项浏览器检查完成；提交52f8cf3，标记mvp-v2-step-01已创建
- [x] 第2步首页、表单、BMI、取消入口清理；73项浏览器与13组规则通过，代码记录已保存，待提交mvp-v2-step-02
- [ ] 第3步iOS演示、N1/N2/N3、聚焦、模拟同步、验证、提交mvp-v2-step-03
- [ ] 第4步两个助手、混合草稿、查询、声明测量、验证、提交mvp-v2-step-04
- [ ] 第5步鸿蒙安卓、全82项验收、提交mvp-v2-step-05

## Verification
第1步：node tests/rules.test.cjs 13组通过；Playwright CLI运行tests/step01.browser.js共46项通过，0脚本错误；稳定截图及result.json在output/playwright/step-01/。
服务127.0.0.1:8765；独立测试会话yaoanxin-v2。CLI=/Users/jacqueline/.agents/skills/playwright/scripts/playwright_cli.sh。检查脚本不连接用户浏览器。

## Notes
纯规则模块rules.js供app.js及Node检查复用；全部状态仍由app.js commit保存。后台子代理未产出文件，已由主代理完成。

## Final Verification
全五步结束时填写外部可重新执行的最终命令与结果。
