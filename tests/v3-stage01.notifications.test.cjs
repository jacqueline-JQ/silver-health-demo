const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../rules.js');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../seed-data.js'), 'utf8'), sandbox);
const seed = sandbox.window.SILVER_SEED_DATA;
const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
let count = 0;
function test(name, fn) { fn(); console.log(`PASS V3-N${String(++count).padStart(2, '0')} ${name}`); }
function setup(slot = '早餐') {
  const data = R.prepareSeed(seed);
  data.medicationPlans = [];
  data.doseEvents = [];
  data.notificationLogs = [];
  R.setClock(data, 0, slot === '睡前' ? '19:55' : '04:55');
  const plan = R.savePlan(data, 'elder-zhang', {
    name: `P0-07 ${slot}测试药`, doseValue: 1, doseUnit: '片', slots: [slot],
    slotSettings: { [slot]: { time: R.SLOTS[slot], reminderTime: R.SLOTS[slot], missedAlertTime: R.MISSED_ALERTS[slot], meal: '' } },
    startDate: R.DAY, duration: '长期服用', endDate: '', note: ''
  }, 'profile-zhang');
  return { data, plan, event: data.doseEvents.find(event => event.planId === plan.id) };
}
function addChild(data, id, name) {
  const child = R.clone(data.accounts.find(account => account.id === 'child-li'));
  data.accounts.push({ ...child, id, name, selectedProfileId: 'profile-zhang', boundProfileIds: ['profile-zhang'] });
}
const n2For = (data, event, round) => data.notificationLogs.filter(notice => notice.kind === 'N2' && notice.eventId === event.id && notice.warningRound === round);
const factOf = event => R.clone({ status: event.status, recordedAt: event.recordedAt, recordedBy: event.recordedBy, changes: event.changes });

test('提前轮与截止轮按完整时刻分别触发并覆盖长辈和全部子女', () => {
  const { data, event } = setup();
  addChild(data, 'child-two', '家属乙');
  const fact = factOf(event);
  R.setClock(data, 0, '08:59');
  R.evaluateNotifications(data);
  assert.equal(n2For(data, event, 'early').length, 0);
  R.setClock(data, 0, '09:00');
  const early = R.evaluateNotifications(data).filter(notice => notice.kind === 'N2');
  assert.deepEqual(early.map(notice => notice.recipientId).sort(), ['child-li', 'child-two', 'elder-zhang']);
  assert(early.every(notice => notice.warningRound === 'early' && notice.text.includes('提前预警') && notice.text.includes('尚未收到打卡')));
  assert.equal(R.evaluateNotifications(data).length, 0);
  R.setClock(data, 0, '11:00');
  const deadline = R.evaluateNotifications(data).filter(notice => notice.kind === 'N2');
  assert.deepEqual(deadline.map(notice => notice.recipientId).sort(), ['child-li', 'child-two', 'elder-zhang']);
  assert(deadline.every(notice => notice.warningRound === 'deadline' && notice.text.includes('自然时段截止') && notice.text.includes('尚未收到打卡')));
  assert.equal(R.stateOf(event, data), 'overdue');
  assert.deepEqual(factOf(event), fact);
  assert.equal(new Set(data.notificationLogs.filter(notice => notice.kind === 'N2').map(notice => `${notice.eventId}|${notice.receiverId}|${notice.warningRound}`)).size, 6);
  assert(R.validData(data));
});

test('每轮实时重算授权且历史提前轮保留', () => {
  const { data, event } = setup();
  R.setClock(data, 0, '09:00');
  R.evaluateNotifications(data);
  assert.deepEqual(n2For(data, event, 'early').map(notice => notice.recipientId).sort(), ['child-li', 'elder-zhang']);
  data.accounts.find(account => account.id === 'child-li').boundProfileIds = [];
  addChild(data, 'child-new', '新授权家属');
  R.setClock(data, 0, '11:00');
  R.evaluateNotifications(data);
  assert.deepEqual(n2For(data, event, 'deadline').map(notice => notice.recipientId).sort(), ['child-new', 'elder-zhang']);
  assert.deepEqual(n2For(data, event, 'early').map(notice => notice.recipientId).sort(), ['child-li', 'elder-zhang']);
  assert(R.validData(data));
});

test('提前轮后完成任务不再发送截止轮', () => {
  const { data, event } = setup();
  R.setClock(data, 0, '09:00');
  R.evaluateNotifications(data);
  R.setClock(data, 0, '10:00');
  R.recordDose(data, 'elder-zhang', event.id, 'taken');
  R.setClock(data, 0, '11:00');
  assert.equal(R.evaluateNotifications(data).filter(notice => notice.kind === 'N2').length, 0);
  assert.equal(n2For(data, event, 'deadline').length, 0);
  assert(R.validData(data));
});

test('睡前截止轮跨日但始终关联原任务日期', () => {
  const { data, event } = setup('睡前');
  R.setClock(data, 0, '22:00');
  R.evaluateNotifications(data);
  assert.equal(n2For(data, event, 'early').length, 2);
  R.setClock(data, 1, '00:00');
  R.evaluateNotifications(data);
  const deadline = n2For(data, event, 'deadline');
  assert.equal(deadline.length, 2);
  assert(deadline.every(notice => notice.date === R.DAY && notice.eventId === event.id));
  assert.equal(event.deadlineAt, R.stamp('2026-09-14', '00:00'));
  assert(R.validData(data));
});

test('迁移产生的 null 提前时刻只关闭提前轮', () => {
  const { data, plan, event } = setup();
  plan.slotSettings.早餐.missedAlertTime = null;
  event.missedAlertTime = null;
  event.missedAlertAt = null;
  event.snapshot.missedAlertTime = null;
  R.setClock(data, 0, '10:00');
  assert.equal(R.evaluateNotifications(data).filter(notice => notice.kind === 'N2').length, 0);
  R.setClock(data, 0, '11:00');
  assert.equal(R.evaluateNotifications(data).filter(notice => notice.kind === 'N2').length, 2);
  assert.equal(n2For(data, event, 'early').length, 0);
  assert.equal(n2For(data, event, 'deadline').length, 2);
  assert(R.validData(data));
});

test('无效 N2 时间字段不猜测轮次且不改任务事实', () => {
  const { data, event } = setup();
  const fact = factOf(event);
  event.missedAlertTime = '08:00';
  event.missedAlertAt = R.stamp(R.DAY, '08:00');
  event.snapshot.missedAlertTime = '08:00';
  R.setClock(data, 0, '11:00');
  assert.equal(R.evaluateNotifications(data).filter(notice => notice.kind === 'N2').length, 0);
  assert.deepEqual(factOf(event), fact);
  assert.equal(R.validData(data), false);
});

test('截止轮后延后到期仍复用 canonical 轮次而不新增记录', () => {
  const { data, event } = setup();
  R.setClock(data, 0, '11:00');
  R.evaluateNotifications(data);
  const before = n2For(data, event, 'deadline').map(notice => notice.id).sort();
  R.snooze(data, 'elder-zhang', event.id, 30);
  R.setClock(data, 0, '11:30');
  R.evaluateNotifications(data);
  assert.deepEqual(n2For(data, event, 'deadline').map(notice => notice.id).sort(), before);
  assert(R.validData(data));
});

test('旧通知仅凭真实发送证据迁移且不以当前授权否定历史', () => {
  const revoked = fixture('mvp-v3-v2-minimal.json');
  revoked.accounts.find(account => account.id === 'fixture-child').boundProfileIds = [];
  const migrated = R.migrate(revoked), notice = migrated.notificationLogs[0];
  assert.equal(notice.legacy, undefined);
  assert.equal(notice.warningRound, 'deadline');
  assert.equal(notice.sentAt, notice.deliveredAt);
  assert(R.validData(migrated));

  for (const mode of ['explicit-legacy', 'created-only', 'missing-event']) {
    const raw = fixture('mvp-v3-v2-minimal.json'), original = raw.notificationLogs[0];
    if (mode === 'explicit-legacy') original.legacy = true;
    if (mode === 'created-only') delete original.deliveredAt;
    if (mode === 'missing-event') original.eventId = 'missing-event';
    const result = R.migrate(raw), kept = result.notificationLogs[0];
    assert.equal(kept.legacy, true);
    assert.equal(kept.legacyRecord.text, '旧版截止提醒');
    assert.equal(kept.legacyRecord.eventId, original.eventId);
    assert.equal(kept.sentAt, undefined);
    assert(R.validData(result));
  }
});

console.log(`PASS ${count} stage-1 notification groups`);
