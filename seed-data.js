/*
 * 药安心 · version 3 核心演示数据
 * 本文件只保存默认本地数据；运行中的改变仍由 app.js 写入兼容存档键。
 */
(() => {
  const slotDefaults = {
    早餐: { time: '08:00', reminderTime: '08:00', missedAlertTime: '09:00', meal: '' },
    午餐: { time: '12:30', reminderTime: '12:30', missedAlertTime: '14:00', meal: '' },
    晚餐: { time: '17:30', reminderTime: '17:30', missedAlertTime: '19:00', meal: '' },
    睡前: { time: '21:00', reminderTime: '21:00', missedAlertTime: '22:00', meal: '' },
  };
  const slotTimes = {
    早餐: ['05:00', '11:00'],
    午餐: ['11:00', '16:00'],
    晚餐: ['16:00', '20:00'],
    睡前: ['20:00', '00:00'],
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const plans = [
    ['med-amlodipine', 'profile-zhang', '氨氯地平片', ['早餐'], '家属协助录入', 'blue'],
    ['med-metformin', 'profile-zhang', '二甲双胍片', ['早餐', '晚餐'], '手动录入', 'coral'],
    ['med-atorvastatin', 'profile-zhang', '阿托伐他汀钙片', ['睡前'], '演示预设', 'purple'],
    ['med-aspirin', 'profile-wang', '阿司匹林肠溶片', ['早餐'], '手动录入', 'amber'],
    ['med-irbesartan', 'profile-wang', '厄贝沙坦片', ['晚餐'], '家属协助录入', 'blue'],
  ].map(([id, profileId, name, slots, source, color]) => ({
    id, profileId, name, doseValue: 1, doseUnit: '片', slots,
    slotSettings: clone(slotDefaults), startDate: profileId === 'profile-zhang' ? '2026-09-01' : '2026-09-02',
    duration: '长期服用', endDate: null, source, assisted: source === '家属协助录入', status: 'active', color,
    note: '请按实际处方服用', createdBy: source === '家属协助录入' ? 'child-li' : profileId === 'profile-zhang' ? 'elder-zhang' : 'child-li',
    createdAt: `${profileId === 'profile-zhang' ? '2026-09-01' : '2026-09-02'}T00:00:00+08:00`,
    effectiveAt: `${profileId === 'profile-zhang' ? '2026-09-01' : '2026-09-02'}T00:00:00+08:00`, version: 1, revisions: [],
  }));
  const planById = Object.fromEntries(plans.map(plan => [plan.id, plan]));
  function event(id, planId, slot, status = 'pending', recordedAt = null, recordedBy = null, recordedByName = null) {
    const plan = planById[planId], setting = plan.slotSettings[slot], [start, deadline] = slotTimes[slot];
    const deadlineDate = slot === '睡前' ? '2026-09-14' : '2026-09-13';
    const at = recordedAt ? `2026-09-13T${recordedAt}:00+08:00` : null;
    const changes = status === 'pending' ? [] : [{
      id: `seed-${id}`, kind: '演示预设', before: { status: 'pending' }, status,
      recordedAt: at, recordedBy, reliableTime: true, actual: null, syncState: 'local', receivedAt: at,
    }];
    return {
      id, planId, profileId: plan.profileId, date: '2026-09-13', slot,
      scheduledTime: setting.reminderTime, reminderTime: setting.reminderTime,
      missedAlertTime: setting.missedAlertTime,
      startAt: `2026-09-13T${start}:00+08:00`,
      deadlineAt: `${deadlineDate}T${deadline}:00+08:00`,
      reminderAt: `2026-09-13T${setting.reminderTime}:00+08:00`,
      missedAlertAt: `2026-09-13T${setting.missedAlertTime}:00+08:00`,
      createdAt: '2026-09-13T00:00:00+08:00', started: true, planVersion: plan.version, cancelledAt: null,
      snapshot: { name: plan.name, doseValue: plan.doseValue, doseUnit: plan.doseUnit, meal: setting.meal, reminderTime: setting.reminderTime, missedAlertTime: setting.missedAlertTime, note: plan.note, color: plan.color },
      status, recordedAt: at, recordedBy, recordedByName, actual: null, changes,
      snoozeUsed: 0, snoozedAt: null, snoozeUntil: null, n3LastAt: null,
    };
  }

  window.SILVER_SEED_DATA = {
    version: 3,
    families: [{ id: 'family-silver-2026', name: '张阿姨的健康小家', inviteCode: 'SILVER2026' }],
    accounts: [
      { id: 'elder-zhang', name: '张阿姨', role: 'elder', age: 68, relation: '本人', avatar: '张', fontMode: 'elder', profileId: 'profile-zhang', familyId: 'family-silver-2026' },
      { id: 'child-li', name: '小李', role: 'child', age: 37, relation: '女儿', avatar: '李', fontMode: 'normal', selectedProfileId: 'profile-zhang', familyId: 'family-silver-2026', boundProfileIds: ['profile-zhang', 'profile-wang'] },
    ],
    elderProfiles: [
      { id: 'profile-zhang', name: '张阿姨', relation: '母亲', age: 68, avatar: '张', tag: '高血压管理中', note: '家人已授权小李协助查看和录入健康记录', familyId: 'family-silver-2026' },
      { id: 'profile-wang', name: '王叔叔', relation: '父亲', age: 71, avatar: '王', tag: '规律随访中', note: '家人已授权小李协助查看和录入健康记录', familyId: 'family-silver-2026' },
    ],
    medicationPlans: plans,
    doseEvents: [
      event('event-amlodipine-breakfast', 'med-amlodipine', '早餐', 'taken', '08:12', 'elder-zhang'),
      event('event-metformin-breakfast', 'med-metformin', '早餐', 'taken', '08:13', 'elder-zhang'),
      event('event-metformin-dinner', 'med-metformin', '晚餐'),
      event('event-atorvastatin-bedtime', 'med-atorvastatin', '睡前'),
      event('event-aspirin-breakfast', 'med-aspirin', '早餐', 'taken', '08:05', null, '王叔叔（演示记录）'),
      event('event-irbesartan-dinner', 'med-irbesartan', '晚餐'),
    ],
    healthRecords: [
      { id: 'bp-0909', profileId: 'profile-zhang', type: 'blood_pressure', measuredAt: '2026-09-09 08:05', source: '手动录入', values: { systolic: 136, diastolic: 85, pulse: 72 }, note: '晨起后测量' },
      { id: 'bp-0910', profileId: 'profile-zhang', type: 'blood_pressure', measuredAt: '2026-09-10 08:10', source: '模拟设备导入', values: { systolic: 134, diastolic: 84, pulse: 70 }, note: '来自模拟血压计' },
      { id: 'bp-0911', profileId: 'profile-zhang', type: 'blood_pressure', measuredAt: '2026-09-11 08:02', source: '手动录入', values: { systolic: 132, diastolic: 82, pulse: 72 }, note: '晨起后测量' },
      { id: 'bp-0912', profileId: 'profile-zhang', type: 'blood_pressure', measuredAt: '2026-09-12 08:07', source: '模拟设备导入', values: { systolic: 130, diastolic: 80, pulse: 69 }, note: '来自模拟华为健康' },
      { id: 'lipid-0901', profileId: 'profile-zhang', type: 'blood_lipid', measuredAt: '2026-09-01 09:30', source: '手动录入', values: { tc: 4.2, tg: 1.1, hdl: 1.3, ldl: 2.1 }, note: '体检报告原始记录' },
      { id: 'body-0908', profileId: 'profile-zhang', type: 'body', measuredAt: '2026-09-08 07:30', source: '模拟设备导入', values: { height: 158, weight: 56.2, fat: 31.4 }, note: '来自模拟智能体脂秤' },
      { id: 'bp-wang-0912', profileId: 'profile-wang', type: 'blood_pressure', measuredAt: '2026-09-12 08:20', source: '手动录入', values: { systolic: 128, diastolic: 78, pulse: 68 }, note: '晨起后测量' },
    ],
    notificationLogs: [{ id: 'notification-1', profileId: 'profile-zhang', eventId: 'event-metformin-dinner', sentAt: '2026-09-13 21:10', text: '模拟提醒张阿姨核对晚餐后的用药记录', legacy: true }],
    demoTime: '21:15', dateOffset: 0, notificationStyle: 'ios', notificationsEnabled: true,
    privatePreview: false, simulationMode: 'online',
  };
})();
