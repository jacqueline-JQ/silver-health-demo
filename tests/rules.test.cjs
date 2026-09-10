const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('../rules.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../seed-data.js'), 'utf8'), sandbox);
const raw = sandbox.window.SILVER_SEED_DATA;
const fresh = () => R.prepareSeed(raw);
const elder = 'elder-zhang', child = 'child-li', pid = 'profile-zhang';
const at = (d, t, offset = 0) => R.setClock(d, offset, t);
const draft = (slots = ['早餐']) => ({ name: '规则测试药', doseValue: 0.5, doseUnit: '包', slots, slotSettings: Object.fromEntries(Object.entries(R.SLOTS).map(([s, time]) => [s, { time, meal: '' }])), startDate: R.DAY, duration: '长期服用', endDate: '', note: '' });
const task = (d, slot = '早餐') => { at(d, '00:00'); const p = R.savePlan(d, elder, draft([slot]), pid); return d.doseEvents.find(e => e.planId === p.id); };
const record = (d, e, status, correction = false) => R.recordDose(d, elder, e.id, status, { correction });
let count = 0;
function test(name, fn) { fn(); console.log(`PASS ${++count} ${name}`); }
test('seed valid and deterministic history samples', () => {
  const d = fresh(); assert(R.validData(d)); assert(R.dailyResult(d, pid, '2026-09-10').star); assert(!R.dailyResult(d, pid, '2026-09-11').star); assert.equal(R.dailyResult(d, pid, '2026-09-12').total, 0);
});
test('all four exact natural boundaries and declaration before reminder', () => {
  for (const [slot, boundary] of [['早餐','11:00'],['午餐','16:00'],['晚餐','20:00'],['睡前','00:00']]) {
    const d = fresh(), e = task(d, slot);
    at(d, slot === '睡前' ? '23:59' : R.plusMinutes(R.stamp(R.DAY, boundary), -1).slice(11,16));
    assert.equal(R.stateOf(e,d), 'pending');
    at(d,boundary,slot === '睡前' ? 1 : 0); assert.equal(R.stateOf(e,d), 'overdue');
  }
  const d = fresh(), e = task(d); at(d,'05:00'); record(d,e,'taken'); assert.equal(e.actual,null);
});
test('cross-slot snooze endpoints, once, refresh and undo retain allowance', () => {
  const d = fresh(), e = task(d,'午餐'); at(d,'15:50'); R.snooze(d,elder,e.id,30); at(d,'16:19'); assert.equal(R.stateOf(e,d),'snoozed'); assert.equal(R.reminderReason(d,child,e),'正在延后');
  assert.throws(()=>R.snooze(d,elder,e.id,5)); at(d,'16:20'); assert.equal(R.stateOf(e,d),'overdue');
  const op = record(d,e,'taken'); Object.assign(op,{accountId:elder,expires:Date.now()+5000}); R.undoDose(d,elder,op); assert.equal(e.status,'pending'); assert.equal(e.snoozeUsed,1); assert(R.validData(JSON.parse(JSON.stringify(d))));
});
test('within-slot snooze never creates early overdue; past task can snooze', () => {
  const d = fresh(), e=task(d); at(d,'08:10'); R.snooze(d,elder,e.id,5); at(d,'08:15'); assert.equal(R.stateOf(e,d),'pending');
  const d2=fresh(), e2=task(d2); at(d2,'13:00'); assert.equal(R.stateOf(e2,d2),'overdue'); R.snooze(d2,elder,e2.id,5); assert.equal(R.stateOf(e2,d2),'snoozed');
});
test('three facts, no invented actual values, corrections append history', () => {
  const d=fresh(), e=task(d); at(d,'13:00'); record(d,e,'not_taken'); record(d,e,'taken',true); record(d,e,'skipped',true); assert.equal(e.changes.length,3); assert.equal(e.actual,null); assert.equal(e.changes[1].before.status,'not_taken'); assert.equal(e.recordedAt,R.stamp(R.DAY,'13:00'));
  assert.throws(()=>R.recordDose(d,child,e.id,'taken',{correction:true})); assert.throws(()=>R.snooze(d,child,e.id,5));
});
test('strict current stars, historical first entry and corrections frozen', () => {
  const d=fresh(); d.doseEvents=[]; d.medicationPlans=[]; const e=task(d); at(d,'13:00'); record(d,e,'not_taken'); assert(!R.dailyResult(d,pid,R.DAY).star); record(d,e,'taken',true); assert(R.dailyResult(d,pid,R.DAY).star);
  at(d,'00:10',1); record(d,e,'not_taken',true); assert(R.dailyResult(d,pid,R.DAY).star); assert.equal(R.dailyResult(d,pid,R.DAY).basis[0].status,'taken');
  const x=fresh(); x.doseEvents=[]; x.medicationPlans=[]; const y=task(x,'睡前'); at(x,'00:10',1); record(x,y,'taken'); assert(!R.dailyResult(x,pid,R.DAY).star);
});
test('cross-midnight protection preserves original identity and original day star', () => {
  const d=fresh(); d.doseEvents=[]; const e=task(d,'睡前'); at(d,'23:50'); R.snooze(d,elder,e.id,30); assert.equal(e.snoozeUntil,R.stamp('2026-09-14','00:20')); at(d,'00:10',1); assert.equal(R.stateOf(e,d),'snoozed'); record(d,e,'taken'); assert.equal(e.date,R.DAY); assert(!R.dailyResult(d,pid,R.DAY).star);
});
test('create current/future only; started snapshots immutable at exact start', () => {
  const d=fresh(); at(d,'18:00'); const p=R.savePlan(d,child,draft(['早餐','晚餐','睡前']),pid); const es=d.doseEvents.filter(e=>e.planId===p.id); assert.deepEqual(es.map(e=>e.slot),['晚餐','睡前']);
  const dinner=es[0], bedtime=es[1]; R.savePlan(d,child,{...draft(['晚餐','睡前']),name:'改后药名',doseValue:2},pid,p.id); assert.equal(dinner.snapshot.name,'规则测试药'); assert.equal(bedtime.snapshot.name,'改后药名');
  R.stopPlan(d,child,p.id); assert(!dinner.cancelledAt); assert(bedtime.cancelledAt); at(d,'21:00'); record(d,dinner,'taken'); assert.equal(dinner.snapshot.doseValue,0.5);
});
test('future start and inclusive end date; no duplicate tasks', () => {
  const d=fresh(); at(d,'18:00'); const p=R.savePlan(d,elder,{...draft(['早餐','午餐','晚餐']),startDate:'2026-09-14',duration:'截至某日期',endDate:'2026-09-14'},pid);
  assert.equal(d.doseEvents.filter(e=>e.planId===p.id).length,0); at(d,'08:00',1); at(d,'08:00',1); assert.equal(d.doseEvents.filter(e=>e.planId===p.id).length,3); at(d,'08:00',2); assert.equal(d.doseEvents.filter(e=>e.planId===p.id).length,3);
});
test('legacy migration keeps enum source, no inferred meal or actual time', () => {
  const d=R.migrate(raw); const e=d.doseEvents[0]; assert.equal(e.status,'taken'); assert.equal(e.legacy.status,'taken_on_time'); assert.equal(e.snapshot.meal,''); assert.equal(e.actual,null); assert(R.validData(d));
  const x=JSON.parse(JSON.stringify(raw)); x.doseEvents[0].recordedAt=null; const y=R.migrate(x); at(y,'00:00',1); assert.equal(R.dailyResult(y,pid,R.DAY).basis.find(b=>b.eventId===e.id).status,'pending');
});
test('invalid archive/duplicates/references/snooze/settings rejected', () => {
  const d=fresh(); d.doseEvents.push(R.clone(d.doseEvents[0])); assert(!R.validData(d));
  const x=fresh(); x.doseEvents[0].snoozeUsed=2; assert(!R.validData(x));
  const y=fresh(); y.doseEvents[0].planId='missing'; assert(!R.validData(y));
  const z=fresh(); z.medicationPlans[0].slotSettings.早餐.time='11:00'; assert(!R.validData(z));
  const empty=fresh(); empty.doseEvents=[]; empty.medicationPlans=[]; empty.healthRecords=[]; empty.notificationLogs=[]; assert(R.validData(empty)); assert(!R.dailyResult(empty,pid,R.DAY).star);
});
test('shared N3 cooldown survives other family identity and undo', () => {
  const d=fresh(), e=task(d); at(d,'08:00'); assert.equal(R.reminderReason(d,child,e),''); e.n3LastAt=R.now(d); d.accounts.push({...d.accounts.find(a=>a.id===child),id:'child-two'}); assert.match(R.reminderReason(d,'child-two',e),/冷却/);
  const op=record(d,e,'taken'); assert.equal(R.reminderReason(d,child,e),'已有记录'); Object.assign(op,{accountId:elder,expires:Date.now()+5000}); R.undoDose(d,elder,op); assert.match(R.reminderReason(d,child,e),/冷却/); at(d,'08:05'); assert.equal(R.reminderReason(d,child,e),'');
});
test('rewinding cannot edit/cancel once-started tasks or erase declarations', () => {
  const d=fresh(); const e=d.doseEvents.find(e=>e.id==='event-atorvastatin-bedtime'); at(d,'21:15'); R.snooze(d,elder,e.id,5); record(d,e,'taken');
  const original=R.clone(e); at(d,'18:00'); const p=d.medicationPlans.find(p=>p.id===e.planId); R.savePlan(d,elder,{...p,name:'未来版本'},pid,p.id);
  assert.deepEqual(e,original); R.stopPlan(d,elder,p.id); assert.deepEqual(e,original); assert(R.validData(d));
  const x=fresh(); const y=x.doseEvents.find(e=>e.id==='event-atorvastatin-bedtime'); at(x,'18:00'); R.stopPlan(x,elder,y.planId); assert(!y.cancelledAt,'已到过睡前，即使未声明也不能取消');
});
console.log(`PASS ${count} rule groups`);
