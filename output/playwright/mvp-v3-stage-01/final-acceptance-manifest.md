# MVP v3 第一阶段最终验收清单

- 测试源码基线：`ecf9cbf`（P0-05 提交后，业务源码无未提交修改）
- 本地服务：`http://127.0.0.1:8765`
- 浏览器：已安装 Google Chrome，`TEST_BROWSER_CHANNEL=chrome`
- 通用命令：`TEST_BASE_URL=http://127.0.0.1:8765 TEST_BROWSER_CHANNEL=chrome TEST_THEME=<theme> node tests/browser-runner.cjs <script> <result>`
- 结果口径：下表每份当前结果只计一次；JSON 的 `errors` 均为空。断言数包含跨脚本回归重叠，不等同于独立需求数。

## 需求与证据

| 范围 | 实际脚本与结果 | 主题与视口/字号 | 结论 |
| --- | --- | --- | --- |
| 三个账号入口各 5 次完整往返、档案归一 | `tests/v3-stage01.accounts.browser.js` → `final-account-entries-ios.json`（34） | iOS；1280px | 顶部账号弹窗、“我的”直接账号列表、demo 外层选择器均回首页；子女选王叔叔后切回长辈归一到张阿姨 |
| 草稿隔离、显式恢复、刷新落首页 | `tests/v3-stage01.browser.js` → `final-v3-stage01-ios.json`（55）；`tests/step02.browser.js` → `p0-05-step02-ios.json`（81） | iOS；脚本内桌面/移动覆盖 | 两账号草稿不串用；刷新不恢复旧页面/弹窗；合法身份和当前档案保留 |
| 关闭提醒与显式查看任务 | `tests/v3-stage01.browser.js` → `final-v3-stage01-ios.json`；`tests/step03.browser.js` → `final-step03-ios.json`（61） | iOS；360/1280px、两字号 | 关闭回长辈首页，任务事实、延后次数和通知日志零变化；仅“查看对应任务”定位列表 |
| 助手否定、改口、冲突与草稿四处一致 | `tests/conversation.test.cjs`；`tests/v3-stage01.browser.js`；`tests/step04.browser.js` → `p0-05-step04-ios.json`（38）；`tests/step04.audit.browser.js` → `final-step04-audit-ios.json`（18） | Node + iOS；360/1280px、两字号 | 被否定值不写入；不可靠冲突阻止核对；聊天摘要、配置卡、手动表单和核对页一致 |
| “未服用”原截止资格、睡前跨日、保护、权限、更正与拒绝零写入 | `tests/v3-stage01.rules.test.cjs`；`tests/v3-stage01.browser.js`；`tests/step03.browser.js`；`tests/step05.acceptance.browser.js` → `final-step05-acceptance-ios.json`（38） | Node + iOS | 仅任务本人、达到原截止且无有效保护时可确认；子女、截止前、保护中、取消及既有事实均拒绝；历史更正保留审计版本 |
| N2 提前/截止两轮、实时授权、幂等与事实不变 | `tests/v3-stage01.notifications.test.cjs`；`tests/v3-stage01.browser.js` | Node + iOS | 09:00/11:00 独立轮次；长辈与当轮授权子女独立键；撤权只影响目标接收人；通知不写“未服用” |
| 延后跨轮、初次送达、离线/失败重试、原 ID 与刷新唯一性 | `tests/v3-stage01.p0-08.browser.js` → `final-p0-08-ios.json`（14）；`tests/v3-stage01.notifications.test.cjs` | Node + iOS | 过时提前轮终态抑制；临时保护保持排队；恢复在线和显式重试复用原 ID；刷新后 canonical 键唯一 |
| 固定 v1/v2 迁移、重复载入、旧快照、无效原存档与重置 | `tests/v3-stage01.migration.browser.js` → `final-migration-ios.json`（14）；`tests/step05.edges.browser.js` → `final-step05-edges-ios.json`（17）；`tests/v3-stage01.rules.test.cjs` | Node + iOS | v1/v2 固定 fixture 升级为 version 3 核心结构；不改历史快照；无效原文不覆盖；重复载入/重置幂等 |
| 加药页防挤压基础骨架 | `tests/v3-stage01.p0-05.browser.js` → `p0-05-ios.json`、`p0-05-harmonyos.json`、`p0-05-android.json`（各 97） | 三主题；320/360/390/1280px × 标准/大字号 | 新增/编辑、错误态、滚轮、核对、长药名和自定义单位均无水平滚动、右裁切或控件越界，操作可达 |
| 既有页面和系统舞台布局 | `tests/step05.layout.browser.js` → `p0-05-layout-ios.json`、`p0-05-layout-harmonyos.json`、`p0-05-layout-android.json`（各 89） | 三主题；360/1280px × 标准/大字号 | 首页、看板、表单、滚轮、核对、聊天、聚焦、桌面和减少动态/透明回退通过 |
| 全量 Node 回归 | `node --test tests/*.test.cjs` → `final-node-tests.txt` | Node | 5 个测试文件全部通过：`tests 5 / pass 5 / fail 0` |
| 其余受影响浏览器回归 | `final-step01-ios.json`（47）、`final-step03-extra-ios.json`（24）、`final-step04-extra-ios.json`（41）、`final-step05-ios.json`（34）、`final-step05-details-ios.json`（29） | iOS；各脚本既定矩阵 | 基础闭环、通知异常/深链、助手打断、端到端和详情字段均通过 |

## 阶段门槛

| 门槛 | 结果 | 边界 |
| --- | --- | --- |
| `S1-A01` | 通过 | 仅第一阶段现有三个账号入口、草稿和刷新落点；不宣称第二阶段新增入口对应的 `V3-A01` 全量通过 |
| `S1-M01` | 通过 | version 3 核心用药/N2 的 v1/v2 迁移；不宣称含后置 mg、血糖、重新启用和身份模块的 `V3-A36` 全量通过 |
| `S1-L01` | 通过 | 第一阶段现有加药字段防挤压；不宣称第二阶段五组时段界面 `V3-A14` 或全产品布局 `V3-A38` 通过 |

## 已核实限制

- 浏览器自动化使用桌面 Chrome 模拟视口，未执行真实 iOS/HarmonyOS/Android 设备和系统推送验证。
- 未接入真实登录、跨设备同步、推送、设备或医疗服务；全部账号、通知和健康数据均为本地演示。
- 第二阶段 P1-01～P1-06 及后置 P1-07～P1-09、P2-01～P2-03 未实施，也未计入本阶段通过范围。
