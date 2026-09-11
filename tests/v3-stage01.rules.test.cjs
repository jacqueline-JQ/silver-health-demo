const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../rules.js');

const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const v1 = () => fixture('mvp-v3-v1-minimal.json');
const v2 = () => fixture('mvp-v3-v2-minimal.json');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../seed-data.js'), 'utf8'), sandbox);
const seed = sandbox.window.SILVER_SEED_DATA;
let count = 0;
function test(name, fn) { fn(); console.log(`PASS V3-M${String(++count).padStart(2, '0')} ${name}`); }
function eligibilityCase(slot = '早餐') {
  const data = R.prepareSeed(seed);
  data.medicationPlans = [];
  data.doseEvents = [];
  data.notificationLogs = [];
  R.setClock(data, 0, slot === '睡前' ? '19:55' : '04:55');
  const plan = R.savePlan(data, 'elder-zhang', {
    name: `P0-06 ${slot}测试药`, doseValue: 1, doseUnit: '片', slots: [slot],
    slotSettings: { [slot]: { time: R.SLOTS[slot], reminderTime: R.SLOTS[slot], missedAlertTime: R.MISSED_ALERTS[slot], meal: '' } },
    startDate: R.DAY, duration: '长期服用', endDate: '', note: ''
  }, 'profile-zhang');
  return { data, plan, event: data.doseEvents.find(event => event.planId === plan.id) };
}
function rejectedWithoutMutation(data, action, pattern) {
  const before = R.clone(data);
  assert.throws(action, pattern);
  assert.deepEqual(data, before);
}

test('原生种子是有效 version 3 且重复准备不增加历史', () => {
  assert.equal(seed.version, 3);
  assert(R.validData(seed));
  const once = R.prepareSeed(seed), twice = R.prepareSeed(once);
  assert(R.validData(once));
  assert(R.validData(twice));
  assert.equal(once.doseEvents.filter(event => /^history-/.test(event.id)).length, 2);
  assert.equal(twice.doseEvents.filter(event => /^history-/.test(event.id)).length, 2);
});

test('v1 迁移保留来源、原提醒和已完成历史', () => {
  const raw = v1(), before = R.clone(raw), migrated = R.migrate(raw);
  assert.deepEqual(raw, before);
  assert.equal(migrated.version, 3);
  assert(R.validData(migrated));
  assert.deepEqual(migrated.medicationPlans[0].legacy.slots, ['早餐后']);
  assert.deepEqual(migrated.medicationPlans[0].slotSettings.早餐, { time: '08:00', reminderTime: '08:00', missedAlertTime: '09:00', meal: '' });
  const pending = migrated.doseEvents.find(event => event.id === 'fixture-event');
  const history = migrated.doseEvents.find(event => event.id === 'fixture-history');
  assert.equal(pending.reminderTime, '08:00');
  assert.equal(pending.missedAlertTime, '09:00');
  assert.equal(history.reminderTime, '08:30');
  assert.equal(history.reminderAt, '2026-09-12T08:30:00+08:00');
  assert.equal(history.missedAlertTime, null);
  assert.equal(history.snapshot.missedAlertTime, null);
  assert.equal(history.legacy.scheduledTime, '08:30');
});

test('v2 迁移规范化计划与待处理任务，不改写历史快照', () => {
  const raw = v2(), before = R.clone(raw), migrated = R.migrate(raw);
  assert.deepEqual(raw, before);
  assert.equal(migrated.version, 3);
  assert(R.validData(migrated));
  const setting = migrated.medicationPlans[0].slotSettings.早餐;
  assert.equal(setting.time, setting.reminderTime);
  assert.equal(setting.missedAlertTime, '09:00');
  const pending = migrated.doseEvents.find(event => event.id === 'fixture-event');
  const history = migrated.doseEvents.find(event => event.id === 'fixture-history');
  assert.equal(pending.missedAlertAt, '2026-09-13T09:00:00+08:00');
  assert.deepEqual({ name: history.snapshot.name, doseValue: history.snapshot.doseValue, meal: history.snapshot.meal, note: history.snapshot.note }, { name: 'Fixture 历史快照', doseValue: 0.5, meal: '餐前', note: '不得按父计划重写' });
  assert.equal(history.reminderTime, '08:30');
  assert.equal(history.missedAlertTime, null);
});

test('旧计划默认 N2 不晚于 N1 时唯一表示为 null', () => {
  const raw = v2();
  raw.medicationPlans[0].slotSettings.早餐.time = '09:30';
  raw.doseEvents[0].scheduledTime = '09:30';
  raw.doseEvents[0].reminderAt = '2026-09-13T09:30:00+08:00';
  const migrated = R.migrate(raw), plan = migrated.medicationPlans[0], task = migrated.doseEvents[0];
  assert.equal(plan.slotSettings.早餐.reminderTime, '09:30');
  assert.equal(plan.slotSettings.早餐.missedAlertTime, null);
  assert.equal(task.reminderTime, '09:30');
  assert.equal(task.missedAlertTime, null);
  assert.equal(task.missedAlertAt, null);
  assert(R.validData(migrated));
});

test('v2 缺失时段设置按旧默认补齐且不改任务自身时间', () => {
  const raw = v2();
  delete raw.medicationPlans[0].slotSettings.午餐;
  raw.doseEvents[0].scheduledTime = '08:20';
  raw.doseEvents[0].reminderAt = '2026-09-13T08:20:00+08:00';
  const migrated = R.migrate(raw);
  assert.deepEqual(migrated.medicationPlans[0].slotSettings.午餐, { time: '12:30', reminderTime: '12:30', missedAlertTime: '14:00', meal: '' });
  assert.equal(migrated.doseEvents[0].reminderTime, '08:20');
  assert.equal(migrated.doseEvents[0].missedAlertTime, '09:00');
  assert(R.validData(migrated));
});

test('旧 N2 可靠记录标截止轮并保留原 ID 与发送时间', () => {
  const migrated = R.migrate(v2()), notice = migrated.notificationLogs[0];
  assert.equal(notice.warningRound, 'deadline');
  assert.equal(notice.receiverId, 'fixture-child');
  assert.equal(notice.notificationId, 'fixture-old-n2');
  assert.equal(notice.sentAt, '2026-09-13T11:00:00+08:00');
  assert.equal(notice.deliveryState, 'delivered');
});

test('重复或缺少接收证据的旧 N2 保留为 legacy', () => {
  const raw = v2(), duplicate = R.clone(raw.notificationLogs[0]);
  duplicate.id = 'fixture-old-n2-duplicate';
  duplicate.operationId = 'duplicate-operation';
  raw.notificationLogs.push(duplicate);
  const missing = R.clone(duplicate);
  missing.id = 'fixture-old-n2-missing';
  missing.operationId = 'missing-operation';
  delete missing.recipientId;
  raw.notificationLogs.push(missing);
  const migrated = R.migrate(raw);
  assert.equal(migrated.notificationLogs.filter(notice => notice.kind === 'N2' && notice.legacy !== true).length, 1);
  assert.equal(migrated.notificationLogs.find(notice => notice.id === duplicate.id).legacy, true);
  assert.equal(migrated.notificationLogs.find(notice => notice.id === missing.id).legacy, true);
  assert(R.validData(migrated));
});

test('v3 再载入幂等且不重写字段', () => {
  const once = R.migrate(v2()), twice = R.migrate(once);
  assert.deepEqual(twice, once);
});

test('新计划固定 N2 必须晚于自定义 N1', () => {
  const data = R.migrate(v2());
  const settings = Object.fromEntries(Object.entries(R.SLOTS).map(([slot, time]) => [slot, { time, meal: '' }]));
  settings.早餐.time = '09:17';
  const draft = { name: 'N2 冲突测试', doseValue: 1, doseUnit: '片', slots: ['早餐'], slotSettings: settings, startDate: R.DAY, duration: '长期服用', endDate: '', note: '' };
  assert.throws(() => R.savePlan(data, 'fixture-elder', draft, 'fixture-profile'), /N2 提前预警/);
  settings.早餐.time = '08:30';
  const plan = R.savePlan(data, 'fixture-elder', draft, 'fixture-profile');
  assert.equal(plan.slotSettings.早餐.reminderTime, '08:30');
  assert.equal(plan.slotSettings.早餐.missedAlertTime, '09:00');
  const task = data.doseEvents.find(event => event.planId === plan.id);
  assert.equal(task.snapshot.reminderTime, '08:30');
  assert.equal(task.snapshot.missedAlertTime, '09:00');
  assert(R.validData(data));
});

test('version 3 核心字段、引用与通知状态严格校验', () => {
  const cases = [];
  let data = R.migrate(v2());data.medicationPlans[0].slotSettings.早餐.reminderTime = '08:10';cases.push(data);
  data = R.migrate(v2());delete data.doseEvents[0].snapshot.missedAlertTime;cases.push(data);
  data = R.migrate(v2());data.doseEvents[0].missedAlertAt = '2026-09-13T09:01:00+08:00';cases.push(data);
  data = R.migrate(v2());data.notificationLogs[0].warningRound = 'unknown';cases.push(data);
  data = R.migrate(v2());data.notificationLogs[0].receiverId = 'fixture-elder';cases.push(data);
  data = R.migrate(v2());data.doseEvents[0].planId = 'missing';cases.push(data);
  for (const invalid of cases) assert.equal(R.validData(invalid), false);
  const broken = v2();broken.doseEvents[0].planId = 'missing';assert.throws(() => R.migrate(broken), /invalid/);
});

test('P0-06 未服用按原截止完整时刻开放且拒绝写入零变更', () => {
  let { data, event } = eligibilityCase();
  assert.deepEqual(R.notTakenEligibility(data, 'elder-zhang', event, R.stamp(R.DAY, '10:59')), { allowed: false, reason: '尚未到截止时间' });
  assert.deepEqual(R.notTakenEligibility(data, 'elder-zhang', event, R.stamp(R.DAY, '11:00')), { allowed: true, reason: '' });
  assert.deepEqual(R.notTakenEligibility(data, 'elder-zhang', event, R.stamp(R.DAY, '11:01')), { allowed: true, reason: '' });
  R.setClock(data, 0, '10:59');
  rejectedWithoutMutation(data, () => R.recordDose(data, 'elder-zhang', event.id, 'not_taken'), /尚未到截止时间/);
  R.setClock(data, 0, '11:00');
  R.recordDose(data, 'elder-zhang', event.id, 'not_taken', { operationId: 'deadline-declaration' });
  assert.equal(event.status, 'not_taken');

  ({ data, event } = eligibilityCase('睡前'));
  assert.equal(event.deadlineAt, R.stamp('2026-09-14', '00:00'));
  R.setClock(data, 0, '23:59');
  rejectedWithoutMutation(data, () => R.recordDose(data, 'elder-zhang', event.id, 'not_taken'), /尚未到截止时间/);
  R.setClock(data, 1, '00:00');
  assert.equal(R.notTakenEligibility(data, 'elder-zhang', event).allowed, true);
  R.recordDose(data, 'elder-zhang', event.id, 'not_taken');
  assert.equal(event.status, 'not_taken');
});

test('P0-06 延后保护、权限、取消与既有事实统一拒绝', () => {
  let { data, event } = eligibilityCase();
  R.setClock(data, 0, '10:50');
  R.snooze(data, 'elder-zhang', event.id, 30);
  R.setClock(data, 0, '11:00');
  assert.match(R.notTakenEligibility(data, 'elder-zhang', event).reason, /延后保护中/);
  rejectedWithoutMutation(data, () => R.recordDose(data, 'elder-zhang', event.id, 'not_taken'), /延后保护中/);
  R.setClock(data, 0, '11:19');
  assert.equal(R.notTakenEligibility(data, 'elder-zhang', event).allowed, false);
  R.setClock(data, 0, '11:20');
  assert.equal(R.notTakenEligibility(data, 'elder-zhang', event).allowed, true);

  ({ data, event } = eligibilityCase());
  R.setClock(data, 0, '11:00');
  data.accounts.push({ id: 'elder-wang', name: '王叔叔', role: 'elder', age: 71, relation: '本人', avatar: '王', fontMode: 'elder', profileId: 'profile-wang', familyId: 'family-silver-2026' });
  assert.match(R.notTakenEligibility(data, 'child-li', event).reason, /只有长辈本人/);
  assert.match(R.notTakenEligibility(data, 'elder-wang', event).reason, /只有长辈本人/);
  rejectedWithoutMutation(data, () => R.recordDose(data, 'child-li', event.id, 'not_taken'), /只有长辈本人/);
  rejectedWithoutMutation(data, () => R.recordDose(data, 'elder-wang', event.id, 'not_taken'), /只有长辈本人/);
  event.cancelledAt = R.now(data);
  const cancelled = R.clone(data);
  assert.equal(R.notTakenEligibility(data, 'elder-zhang', event).reason, '任务已取消');
  assert.throws(() => R.recordDose(data, 'elder-zhang', event.id, 'not_taken'), /任务已取消/);
  assert.deepEqual(data, cancelled);

  ({ data, event } = eligibilityCase());
  R.setClock(data, 0, '11:00');
  R.recordDose(data, 'elder-zhang', event.id, 'taken');
  assert.match(R.notTakenEligibility(data, 'elder-zhang', event).reason, /已有记录/);
  rejectedWithoutMutation(data, () => R.recordDose(data, 'elder-zhang', event.id, 'not_taken'), /更正入口/);
});

test('P0-06 保留任务、幂等重试与截止后更正保持审计版本', () => {
  let { data, plan, event } = eligibilityCase();
  R.setClock(data, 0, '08:00');
  R.stopPlan(data, 'elder-zhang', plan.id);
  assert.equal(event.cancelledAt, null);
  R.setClock(data, 0, '11:00');
  assert.equal(R.notTakenEligibility(data, 'elder-zhang', event).allowed, true);

  ({ data, plan, event } = eligibilityCase());
  R.setClock(data, 0, '08:00');
  R.savePlan(data, 'elder-zhang', { ...R.clone(plan), name: '编辑后的父计划', version: plan.version }, 'profile-zhang', plan.id);
  assert.equal(event.snapshot.name, 'P0-06 早餐测试药');
  R.setClock(data, 0, '11:00');
  const first = R.recordDose(data, 'elder-zhang', event.id, 'not_taken', { operationId: 'same-operation' });
  const afterFirst = R.clone(data);
  const retry = R.recordDose(data, 'elder-zhang', event.id, 'not_taken', { operationId: 'same-operation' });
  assert.equal(first.token, 'same-operation');
  assert.equal(retry.duplicate, true);
  assert.deepEqual(data, afterFirst);

  ({ data, event } = eligibilityCase());
  R.setClock(data, 0, '08:00');
  R.recordDose(data, 'elder-zhang', event.id, 'taken', { operationId: 'initial-fact' });
  R.setClock(data, 0, '10:59');
  rejectedWithoutMutation(data, () => R.recordDose(data, 'elder-zhang', event.id, 'not_taken', { correction: true }), /原任务截止时间/);
  R.setClock(data, 0, '11:00');
  R.recordDose(data, 'elder-zhang', event.id, 'not_taken', { correction: true, operationId: 'history-correction' });
  assert.equal(event.status, 'not_taken');
  assert.equal(event.changes.length, 2);
  assert.equal(event.changes[1].kind, '更正');
  assert.equal(event.changes[1].before.status, 'taken');
  assert.equal(event.changes[0].id, 'initial-fact');
  assert(R.validData(data));
});

console.log(`PASS ${count} version 3 migration groups`);
