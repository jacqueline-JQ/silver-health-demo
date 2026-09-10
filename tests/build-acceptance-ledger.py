"""用已通过的检查结果生成验收台账；不运行测试、不把缺失证据视作通过。"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/验收'
RESULTS = ROOT / 'output/playwright/step-05'
ALIASES = {
    'B2': ('regression02.json', 'step02.browser.js'),
    'B3': ('regression03.json', 'step03.browser.js'),
    'X3': ('regression03-extra.json', 'step03.extra.browser.js'),
    'B4': ('regression04.json', 'step04.browser.js'),
    'X4': ('regression04-extra.json', 'step04.extra.browser.js'),
    'A4': ('regression04-audit.json', 'step04.audit.browser.js'),
    'E': ('edges.json', 'step05.edges.browser.js'),
    'H': ('acceptance-gaps.json', 'step05.acceptance.browser.js'),
    'D': ('details.json', 'step05.details.browser.js'),
}
for theme in ['ios', 'harmonyos', 'android']:
    ALIASES[f'F-{theme}'] = (f'flow-{theme}.json', 'step05.browser.js')
    ALIASES[f'L-{theme}'] = (f'layout-{theme}.json', 'step05.layout.browser.js')

# 每项指向具体结果中的检查序号；*表示该套复合场景的全部检查。
MAPPING = {
 'A01':'B2:1,5,40 F-ios:*', 'A02':'B2:6,7,8,9 G:6',
 'A03':'B2:10,11,12,40 X4:*', 'A04':'B2:10,39 E:*',
 'A05':'B2:1,66,67,68,69,70,71,72,73 L-ios:*',
 'A06':'B2:26,27,28,29,30 B4:*', 'A07':'B2:2', 'A08':'B2:3,4',
 'A09':'B2:14,26,28 L-android:*', 'A10':'B2:14,21 G:2,8 L-harmonyos:*',
 'A11':'B2:21,22,23,24 H:*', 'A12':'B2:19,20,31 F-ios:*',
 'A13':'B4:* A4:* E:*', 'A14':'B4:* X4:*', 'A15':'B4:* C:*',
 'A16':'B2:15,16,17,18 B4:*', 'A17':'B2:17,18,26,27,30 B4:*',
 'A18':'G:8,9 B4:* X4:* E:*', 'A19':'H:* X4:* L-ios:*',
 'A20':'H:* F-ios:* X4:* G:5 D:* C:15', 'A21':'G:3 N:* B3:26,28,29,30',
 'A22':'H:* G:5', 'A23':'H:*', 'A24':'H:* X4:* A4:* C:*',
 'A25':'H:* G:5 E:*', 'A26':'B4:* H:* C:* F-android:*',
 'A27':'B2:33,34 F-android:*', 'A28':'B2:35,36,37',
 'A29':'B3:1,2,46,47,50,51 X3:* L-ios:* E:*',
 'A30':'B3:3,7,10,18,26,29,31 N:* F-ios:*',
 'A31':'B3:21,22,29,30,31,42 N:* F-harmonyos:*',
 'A32':'B3:23,24,28,32,37 N:* F-android:*',
 'A33':'B3:8,9,11,18,28,31,32,33,34,35,37,41,42,43 X3:*',
 'A36':'B2:74 E:* X4:*', 'A37':'B3:3,4,5,6,7,18 X3:*',
 'A38':'G:3 B3:26,28,29,30,56 F-ios:*',
 'A39':'F-ios:* F-harmonyos:* F-android:* L-ios:* L-harmonyos:* L-android:*',
 'A40':'B2:1,3,4,66,67,68,69,70,71,72,73 L-ios:* L-harmonyos:* L-android:*',
 'A41':'B2:65 L-ios:* L-harmonyos:* L-android:*',
 'A42':'B2:41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65 L-ios:* L-harmonyos:* L-android:* H:*',
 'A43':'G:10,11 E:* B3:56,57,58', 'A44':'G:8,13 B3:20,37 X3:* X4:* A4:*',
 'A45':'E:* F-ios:* F-harmonyos:* F-android:* H:* X4:*',
 'A46':'G:6,7 B2:6,7,8 E:*', 'A47':'E:* F-ios:*',
 'A48':'G:2,3,4 N:*', 'A49':'H:*', 'A50':'H:* G:3,5,12 B2:32 X3:*',
 'A51':'G:5,6 X4:*', 'A52':'B3:2,3,4,5,6,7,8,9,11 X3:* X4:*',
 'A53':'G:8,9,13 N:* A4:*', 'A54':'G:12 N:* B3:23,24,28,31,32',
 'A55':'G:3,4 N:* B3:26,28,29,30,31', 'A56':'G:7 N:*',
 'A57':'E:* B4:*', 'A58':'N:* B3:41,42,43,45',
 'A59':'G:6,7,8 B2:6,7,8', 'A60':'B2:15,26,30 H:* G:5,8,9 X4:* D:* C:15',
 'A61':'E:* B3:1,2 X3:*', 'A62':'B3:1,36,38 L-ios:* L-harmonyos:* L-android:*',
 'A63':'B3:1,2,3,4,5,54,55 X3:* L-ios:*',
 'A64':'F-harmonyos:* F-android:* L-harmonyos:* L-android:*',
 'A65':'F-ios:* F-harmonyos:* F-android:* B4:* X4:*',
 'A66':'F-ios:* F-harmonyos:* X4:*', 'A67':'F-ios:* F-harmonyos:* F-android:* B3:4,5,6,16,17',
 'A68':'B3:21,23,24,28,29,30,31,32 N:* F-ios:*',
 'A69':'B3:11,18,20,22,37 X3:* X4:*',
 'A70':'B3:1,36,37,38 X3:* F-ios:* L-ios:*',
 'A71':'H:* X4:*', 'A72':'H:* E:* X4:*', 'A73':'C:* B4:* A4:* H:*',
 'A74':'H:* B4:* E:* C:*', 'A75':'B4:* A4:*',
 'A76':'B4:* C:* X4:*', 'A77':'B4:* A4:* X4:* B2:14,21,22,23,24,26,27',
 'A78':'C:* A4:* X4:*', 'A79':'B4:* X4:* F-ios:*',
 'A80':'B4:* X4:* F-ios:* F-harmonyos:* F-android:* G:6',
 'A81':'X4:* B3:20,37 F-ios:*', 'A82':'X4:* A4:* B3:8,9,11,13,15',
 'A83':'X3:* B3:54,55 L-ios:* L-harmonyos:* L-android:*',
 'A84':'F-ios:* F-harmonyos:* F-android:*',
}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    catalog = {}
    # 汇总行不是测试组，不能把PASS总计再次计入。
    rule_results = []
    for alias, name in [('G','rules'), ('N','notifications'), ('C','conversation')]:
        lines = (RESULTS/f'{name}.log').read_text().splitlines()
        checks = [s for s in lines if s.startswith('PASS ') and not s.endswith('rule groups')]
        assert checks and not any(s.startswith('FAIL') for s in lines)
        result = dict(suite=name, passed=len(checks), checks=checks, errors=[])
        rule_results.append(result)
        catalog[alias] = dict(file=f'output/playwright/step-05/{name}.log', command=f'node tests/{name}.test.cjs', checks=checks)
    assert [r['passed'] for r in rule_results] == [13,9,15]
    (RESULTS/'rules-result.json').write_text(json.dumps(rule_results,ensure_ascii=False,indent=2)+'\n')
    browser_total = 0
    for alias, (file, script) in ALIASES.items():
        result=json.loads((RESULTS/file).read_text())
        assert result['passed'] == len(result['checks']) and result['passed'] > 0 and not result['errors'], file
        browser_total += result['passed']
        theme = f"TEST_THEME={alias[2:]} " if alias.startswith(('F-','L-')) else ''
        catalog[alias]=dict(file=f'output/playwright/step-05/{file}', command=f'{theme}node tests/browser-runner.cjs tests/{script} output/playwright/step-05/{file}', checks=result['checks'])
    rows=[]
    for line in (ROOT/'药安心_MVP文档_v2.md').read_text().splitlines():
        match=re.match(r'\| (A\d\d) \| (.*?) \| (.*?) \|$',line)
        if not match or match[1] in ['A34','A35']: continue
        identifier,scenario,condition=match.groups()
        evidence=[]
        for item in MAPPING[identifier].split():
            alias,indices=item.split(':')
            entry=catalog[alias]
            numbers=list(range(1,len(entry['checks'])+1)) if indices=='*' else [int(n) for n in indices.split(',')]
            selected=[dict(number=n,name=entry['checks'][n-1]) for n in numbers]
            evidence.append(dict(alias=alias,file=entry['file'],command=entry['command'],checks=selected))
        rows.append(dict(id=identifier,scenario=scenario,condition=condition,status='通过（首轮网页范围）',reproduce=['项目根目录运行 python3 -m http.server 8765',scenario,'执行下列证据命令，在独立浏览器上下文按脚本中的真实操作与断言复现'],evidence=evidence))
    assert len(rows)==82 and set(MAPPING)=={r['id'] for r in rows}
    payload=dict(scope='本地网页演示；A34/A35已取消，P01–P06后续服务不纳入本轮',browserChecks=browser_total,ruleGroups=37,limitations=['官方参考正文未成功取得；界面为本地CSS/SVG参考风格，不是原生系统实现或厂商认证','键盘路径和浏览器辅助功能树已检查；未进行真人VoiceOver/NVDA操作测试','未进行真实设备安装、系统推送、双设备云同步、麦克风/ASR/模型或生产医疗验证'],items=rows)
    (OUT/'验收台账.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    text='# 药安心 MVP v2 有效验收台账\n\n82项均已按首轮本地网页演示范围核对；取消A34/A35，后续P01–P06不纳入本轮。\n\n'
    text+='共执行 '+str(browser_total)+' 项浏览器断言、37组规则检查，所有结果文件均为通过且无脚本错误。浏览器为本机Chrome，自动化在独立上下文运行，不接触用户浏览器数据。\n\n'
    text+='A42的键盘路径、可访问名称/角色和动态消息语义已检查；未声称完成真人VoiceOver/NVDA测试。参考与真实服务边界见[验证总览](验证总览.md)。完整检查名称、编号和命令保存在[JSON台账](验收台账.json)。\n\n'
    text+='复现：项目根目录启动 `python3 -m http.server 8765`；按每行证据代号执行文末命令。结果的`checks`数组从1开始编号。场景与通过条件均从已确认MVP原文提取；复合项同时引用规则、浏览器和视觉证据。\n\n|编号|复现场景|通过条件|状态|证据代号与检查序号|\n|---|---|---|---|---|\n'
    for r in rows:
        refs=[]
        for e in r['evidence']:
            nums=[c['number'] for c in e['checks']]
            numbers=f'1–{len(nums)}' if nums==list(range(1,len(catalog[e['alias']]['checks'])+1)) else ','.join(map(str,nums))
            refs.append(f"[{e['alias']}](../../{e['file']}) #{numbers}")
        text+=f"|{r['id']}|{r['scenario']}|{r['condition']}|通过|{'；'.join(refs)}|\n"
    text+='\n## 证据复现命令\n\n'
    for alias,e in catalog.items():
        text+=f"- **{alias}**：`{e['command']}`\n"
    (OUT/'验收台账.md').write_text(text)
    print(json.dumps(dict(items=82,browserChecks=browser_total,ruleGroups=37,resultFiles=len(ALIASES)),ensure_ascii=False))

if __name__=='__main__': main()
