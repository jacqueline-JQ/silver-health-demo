const assert=require('node:assert/strict'),C=require('../conversation.js'),R=require('../rules.js');
const draft=()=>({name:'',doseValue:'',doseUnit:'',slots:[],slotSettings:Object.fromEntries(Object.entries(R.SLOTS).map(([slot,time])=>[slot,{time,meal:''}])),startDate:R.DAY,duration:'长期服用',endDate:'',note:''});
const checks=[];function test(name,fn){fn();checks.push(name);console.log('PASS',name);}
test('否定和含糊声明严格区分',()=>{assert.equal(C.declaration('还没吃').fact,'not_taken');assert.equal(C.declaration('没有按时服用').ambiguous,true);assert.equal(C.declaration('后来已经吃过了').fact,'taken');assert.equal(C.declaration('好像吃了').fact,undefined);});
test('早晚不擅自映射，半片改口保留单位',()=>{const original=draft(),first=C.parsePlan('那个，示例药，每次一片，早晚吃',original);assert.equal(first.draft.name,'示例药');assert.deepEqual(first.pendingSlots,['早餐','晚餐']);assert.deepEqual(first.draft.slots,[]);assert.equal(original.name,'');const next=C.parsePlan('不是一片，是半片',first.draft);assert.equal(next.draft.doseValue,.5);assert.equal(next.draft.name,'示例药');assert.equal(next.draft.doseUnit,'片');});
test('未知表达不覆盖手动字段或餐时',()=>{const d=draft();d.name='手动名称';d.slots=['早餐'];d.slotSettings.早餐.meal='餐前';assert.deepEqual(C.parsePlan('这个怎么说呢',d).draft,d);assert.equal(C.parsePlan('早餐饭前改饭后',d).draft.slotSettings.早餐.meal,'餐后');});
test('两个时段的餐时分别解析，不以末尾覆盖',()=>{const d=draft();d.slots=['早餐','晚餐'];const r=C.parsePlan('早餐餐前，晚餐餐后',d);assert.equal(r.draft.slotSettings.早餐.meal,'餐前');assert.equal(r.draft.slotSettings.晚餐.meal,'餐后');});
test('餐时否定不删除服用时段',()=>{const d=draft();d.slots=['早餐','晚餐'];d.slotSettings.早餐.meal='餐前';const r=C.parsePlan('早餐不要餐前，改为餐后',d);assert.deepEqual(r.draft.slots,['早餐','晚餐']);assert.equal(r.draft.slotSettings.早餐.meal,'餐后');assert.deepEqual(C.parsePlan('取消早餐',d).draft.slots,['晚餐']);});
test('完整句子中重复提及的餐时归属于正确行',()=>{const r=C.parsePlan('药名是示例药，每次半片，早餐和晚餐，早餐餐前',draft());assert.deepEqual(r.draft.slots,['早餐','晚餐']);assert.equal(r.draft.slotSettings.早餐.meal,'餐前');assert.equal(r.draft.slotSettings.晚餐.meal,'');});
test('疑问条件矛盾或否定记录指令不产生事实',()=>{for(const t of ['这次吃过了吗？','这次还没吃吗？','如果吃过了','吃过了，但还没吃','这次无需服用，已经吃过了','不是没吃','不要记录已服用'])assert(C.declaration(t).ambiguous,t);assert.equal(C.declaration('还没吃过').fact,'not_taken');});
test('只接受完整支持声明，不依赖疑问词黑名单',()=>{for(const t of ['这次已经吃过了没有','这次已经吃过了吧','这次已经吃过了也许','这次还没吃吧'])assert(C.declaration(t).ambiguous,t);assert.equal(C.declaration('这次已经吃过了，只吃了半片').fact,'taken');assert.equal(C.declaration('示例药已经吃过了','示例药').fact,'taken');});
test('孤立餐时否定保持全部原字段',()=>{const d=draft();d.slots=['早餐','晚餐'];d.slotSettings.早餐.meal='餐后';const r=C.parsePlan('早餐不要餐前',d);assert.deepEqual(r.draft,d);assert(r.issues.length);assert.deepEqual(C.parsePlan('早餐不要餐前，晚餐改为餐后',d).draft,d);});
test('分时不同量与非每日周期阻止候选',()=>{for(const text of ['早一片晚两片','隔日一片','每周三片','必要时一片'])assert.equal(C.parsePlan(text,draft()).blocked,true);assert.equal(C.parsePlan('改为每天，每次半片，早餐和晚餐',draft()).resolveBlocked,true);});
test('数字自定义单位和明确次数可校验',()=>{const parsed=C.parsePlan('药名是样例，每次0.5小包，每天三次，早餐和晚餐',draft());assert.equal(parsed.expectedTimes,3);assert.equal(parsed.draft.doseUnit,'小包');assert.equal(parsed.draft.slots.length,2);});
test('不同测量单位不换算为默认单位',()=>{const d={values:{},extras:[],note:'',measuredAt:'2026-09-13T08:00'};const r=C.parseHealth('总胆固醇120 mg/dL',d,'blood_lipid',R.DAY,'21:15');assert.equal(r.draft.values.tc,undefined);assert.equal(r.issues.length,1);});
test('身体数值时间与用户转述来源保留',()=>{const d={values:{},extras:[],note:'',measuredAt:'2026-09-13T21:15'};const r=C.parseHealth('身高160厘米，体重60公斤，今天08:30测量，医生说遵照原安排',d,'blood_pressure',R.DAY,'21:15');assert.equal(r.type,'body');assert.equal(r.draft.values.height,'160');assert.equal(r.draft.measuredAt,'2026-09-13T08:30');assert.match(r.draft.note,/用户转述/);});
test('查询优先且不以问题触发保存',()=>{assert.equal(C.intent('今天晚上吃什么','home'),'query');assert.equal(C.intent('几点提醒','record'),'query');assert.equal(C.intent('应该加量吗','plan'),'medical');assert.equal(C.intent('这次吃过了','home'),'record');});
test('本人细节来自白名单片段，不从药名或计划推造',()=>{
  for(const [text,value,unit] of [['这次已经吃过了，只吃了半粒',.5,'粒'],['这次已经吃过了，三片',3,'片'],['这次已经吃过了，一包',1,'包'],['这次吃了三片',3,'片']])assert.deepEqual(C.declaration(text),{fact:'taken',details:[{kind:'dose',value,unit}]});
  assert.deepEqual(C.declaration('这次已经吃过了，实际时间为08:10'),{fact:'taken',details:[{kind:'time',text:'08:10'}]});
  assert.deepEqual(C.declaration('这次药吃过了'),{fact:'taken'});
  assert.deepEqual(C.declaration('维生素B12已经吃过了','维生素B12'),{fact:'taken'});
  assert.deepEqual(C.declaration('这次已经吃过了，只吃了半粒吗？'),{ambiguous:true});
});
console.log(`PASS ${checks.length} conversation rule groups`);
