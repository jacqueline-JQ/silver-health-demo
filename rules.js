/* 药安心的纯业务规则：不读写浏览器存储，调用者须在 commit 中执行变更。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MedRules = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DAY = '2026-09-13';
  const SLOTS = { 早餐: '08:00', 午餐: '12:30', 晚餐: '17:30', 睡前: '21:00' };
  const LEGACY_SLOTS = { ...SLOTS, 晚餐: '18:30' };
  const MISSED_ALERTS = { 早餐: '09:00', 午餐: '14:00', 晚餐: '19:00', 睡前: '22:00' };
  const RANGES = { 早餐: [300, 660], 午餐: [660, 960], 晚餐: [960, 1200], 睡前: [1200, 1440] };
  const STATUS = { pending: '待打卡', overdue: '未按时打卡', snoozed: '延后中', taken: '已服用', not_taken: '未服用', skipped: '本次无需服用', cancelled: '已取消' };
  const FACTS = ['taken', 'not_taken', 'skipped'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const minute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const hhmm = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const dateAt = offset => addDays(DAY, offset);
  const stamp = (date, time) => `${date}T${time}:00+08:00`;
  const day = data => dateAt(data.dateOffset);
  const now = data => stamp(day(data), data.demoTime);
  const validStamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/.test(value) && validDate(value.slice(0, 10)) && validTime(value.slice(11, 16));
  const plusMinutes = (value, n) => new Date(Date.parse(value) + (n + 480) * 60000).toISOString().slice(0, 19) + '+08:00';
  const resolved = event => !!event && FACTS.includes(event.status);
  const own = (data, accountId, event) => data.accounts.some(a => a.id === accountId && a.role === 'elder' && a.profileId === event?.profileId);
  const canAccess = (data, accountId, pid) => {
    const a = data.accounts.find(a => a.id === accountId);
    return !!a && data.elderProfiles.some(p => p.id === pid && p.familyId === a.familyId) && (a.role === 'elder' ? a.profileId === pid : a.boundProfileIds.includes(pid));
  };
  const canDeclare = (data, accountId, e) => own(data, accountId, e) && canAccess(data, accountId, e.profileId) && !e.cancelledAt && now(data) >= e.startAt && now(data) >= e.createdAt;
  const protectedAt = (e, at) => !resolved(e) && !!e.snoozeUntil && !!e.snoozedAt && e.snoozedAt <= at && at < e.snoozeUntil;
  function notTakenEligibility(data, accountId, e, at = now(data)) {
    if (!e || !own(data, accountId, e) || !canAccess(data, accountId, e.profileId)) return { allowed: false, reason: '只有长辈本人可记录未服用' };
    if (e.cancelledAt) return { allowed: false, reason: '任务已取消' };
    if (at < e.startAt || at < e.createdAt) return { allowed: false, reason: '任务尚未开始' };
    if (resolved(e)) return { allowed: false, reason: '已有记录，请从更正入口处理' };
    if (protectedAt(e, at)) return { allowed: false, reason: '延后保护中，请在保护结束后按实际情况记录' };
    if (at < e.deadlineAt) return { allowed: false, reason: '尚未到截止时间' };
    return { allowed: true, reason: '' };
  }
  function correctionEligibility(data, accountId, e, at = now(data)) {
    if (!e || !own(data, accountId, e) || !canAccess(data, accountId, e.profileId)) return { allowed: false, reason: '只有长辈本人可更正记录' };
    if (e.cancelledAt) return { allowed: false, reason: '任务已取消' };
    if (!resolved(e)) return { allowed: false, reason: '当前没有可更正的记录' };
    if (at < e.deadlineAt) return { allowed: false, reason: '尚未到原任务截止时间' };
    return { allowed: true, reason: '' };
  }
  const reminderTime = setting => setting?.reminderTime ?? setting?.time;
  const safeMissedAlert = (slot, reminder, preferred = MISSED_ALERTS[slot]) => validTime(reminder) && validTime(preferred) && minute(preferred) > minute(reminder) && minute(preferred) < RANGES[slot][1] ? preferred : null;
  const slotSetting = (slot, setting = {}, { migrated = false } = {}) => {
    const reminder = reminderTime(setting) || (migrated ? LEGACY_SLOTS[slot] : SLOTS[slot]);
    const missed = Object.hasOwn(setting, 'missedAlertTime') ? setting.missedAlertTime : safeMissedAlert(slot, reminder);
    return { ...setting, time: reminder, reminderTime: reminder, missedAlertTime: missed, meal: setting.meal || '' };
  };
  const normalizedSlotSettings = (settings = {}, options) => Object.fromEntries(Object.keys(SLOTS).map(slot => [slot, slotSetting(slot, settings[slot], options)]));
  function stateOf(e, data) {
    if (e.cancelledAt) return 'cancelled';
    if (resolved(e)) return e.status;
    if (protectedAt(e, now(data))) return 'snoozed';
    return now(data) >= e.deadlineAt ? 'overdue' : 'pending';
  }
  function snoozeReason(data, accountId, e) {
    if (!e || !own(data, accountId, e) || !canAccess(data, accountId, e.profileId)) return '只有长辈本人可以延后';
    if (e.cancelledAt) return '任务已取消';
    if (resolved(e)) return '已有记录';
    if (e.snoozeUsed) return '延后机会已用完，请按实际情况记录';
    if (now(data) < e.reminderAt || now(data) < e.createdAt) return '尚未到提醒时间';
    return '';
  }
  function reminderReason(data, accountId, e) {
    const a = data.accounts.find(a => a.id === accountId);
    if (!e || a?.role !== 'child' || !canAccess(data, accountId, e.profileId)) return '无权提醒此任务';
    if (e.cancelledAt) return '任务已取消';
    if (resolved(e)) return '已有记录';
    if (protectedAt(e, now(data))) return '正在延后';
    if (now(data) < e.reminderAt || now(data) < e.createdAt) return '尚未到提醒时间';
    if (e.n3LastAt && Date.parse(now(data)) - Date.parse(e.n3LastAt) < 300000) return `提醒冷却中，还需 ${Math.ceil((300000 - (Date.parse(now(data)) - Date.parse(e.n3LastAt))) / 60000)} 分钟`;
    return '';
  }
  function taskTimes(date, slot, time) {
    return { startAt: stamp(date, hhmm(RANGES[slot][0])), deadlineAt: RANGES[slot][1] === 1440 ? stamp(addDays(date, 1), '00:00') : stamp(date, hhmm(RANGES[slot][1])), reminderAt: stamp(date, time) };
  }
  function makeEvent(p, date, slot, at) {
    const setting = slotSetting(slot, p.slotSettings[slot]),reminder=setting.reminderTime,missed=setting.missedAlertTime;
    return { id: id('event'), planId: p.id, profileId: p.profileId, date, slot, scheduledTime: reminder, reminderTime: reminder, missedAlertTime: missed, missedAlertAt: missed ? stamp(date, missed) : null,
      ...taskTimes(date, slot, reminder), createdAt: at, started: at >= taskTimes(date, slot, reminder).startAt, planVersion: p.version, cancelledAt: null,
      snapshot: { name: p.name, doseValue: p.doseValue, doseUnit: p.doseUnit, meal: setting.meal, reminderTime: reminder, missedAlertTime: missed, note: p.note || '', color: p.color || 'blue' },
      status: 'pending', recordedAt: null, recordedBy: null, actual: null, changes: [], snoozeUsed: 0, snoozedAt: null, snoozeUntil: null, n3LastAt: null };
  }
  function generateEvents(data, p, date = day(data), at = now(data)) {
    if (p.status !== 'active' || date < p.startDate || (p.endDate && date > p.endDate)) return;
    p.slots.forEach(slot => {
      const e = makeEvent(p, date, slot, at > p.effectiveAt ? at : p.effectiveAt);
      if (e.deadlineAt <= e.createdAt || data.doseEvents.some(x => x.planId === p.id && x.date === date && x.slot === slot)) return;
      data.doseEvents.push(e);
    });
  }
  // 受控时钟前进时逐日生成实际生效的任务，不用当前计划反推更早的历史。
  function setClock(data, offset, time) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 31 || !validTime(time)) throw Error('请选择 0–31 天内的有效演示时间');
    const previous = day(data);
    data.doseEvents.forEach(e => { if (now(data) >= e.startAt && now(data) >= e.createdAt) e.started = true; });
    const target = dateAt(offset);
    data.dateOffset = offset; data.demoTime = time;
    for (let date = addDays(previous, 1); date <= target; date = addDays(date, 1)) {
      data.medicationPlans.forEach(p => { generateEvents(data, p, date, stamp(date, '00:00')); });
    }
    data.medicationPlans.forEach(p => { generateEvents(data, p); });
    data.doseEvents.forEach(e => { if (now(data) >= e.startAt && now(data) >= e.createdAt) e.started = true; });
  }
  function planErrors(d) {
    const errors = {};
    if (!d.name?.trim() || d.name.length > 80) errors.name = '请填写药品名称（80字以内）';
    if (!(Number(d.doseValue) > 0) || !Number.isFinite(Number(d.doseValue))) errors.doseValue = '请输入大于 0 的单次用量';
    if (!d.doseUnit?.trim() || d.doseUnit.length > 12) errors.doseUnit = '请填写用量单位（12字以内）';
    if (!Array.isArray(d.slots) || !d.slots.length || new Set(d.slots).size !== d.slots.length || d.slots.some(s => !SLOTS[s])) errors.slots = '至少选择一个有效服用时段';
    (d.slots || []).forEach(s => {
      const t = d.slotSettings?.[s];
      const reminder=reminderTime(t),missed=Object.hasOwn(t||{},'missedAlertTime')?t.missedAlertTime:MISSED_ALERTS[s];
      if (!RANGES[s] || !validTime(reminder) || minute(reminder) < RANGES[s][0] || minute(reminder) >= RANGES[s][1] || (t?.time&&t?.reminderTime&&t.time!==t.reminderTime)) errors[`time-${s}`] = `提醒需在${s}自然时段内`;
      if (missed!==null&&(!validTime(missed)||minute(missed)<=minute(reminder)||minute(missed)>=RANGES[s][1])) errors[`time-${s}`] = `${s}用药提醒必须早于固定 N2 提前预警 ${MISSED_ALERTS[s]}`;
      if (t && !['', '餐前', '餐后'].includes(t.meal)) errors[`meal-${s}`] = '餐时只能选择餐前、餐后或留空';
    });
    if (!validDate(d.startDate)) errors.startDate = '请选择有效开始日期';
    if (!['长期服用', '截至某日期'].includes(d.duration)) errors.duration = '请选择服用周期';
    if (d.duration === '截至某日期' && (!validDate(d.endDate) || d.endDate < d.startDate)) errors.endDate = '结束日期不能早于开始日期';
    return errors;
  }
  function savePlan(data, accountId, draft, pid, planId) {
    if (!canAccess(data, accountId, pid)) throw Error('无权为此长辈保存计划');
    const previous = planId ? data.medicationPlans.find(p => p.id === planId && p.profileId === pid && p.status === 'active') : null;
    if (planId && !previous) throw Error('原计划已变化，请重新打开核对');
    if (previous && draft.version && draft.version !== previous.version) throw Error('计划已更新，请重新核对');
    if (previous && now(data) < previous.effectiveAt) throw Error('演示时间早于计划修改时间，请向前调整');
    const settings=normalizedSlotSettings(draft.slotSettings);
    for(const slot of draft.slots||[])if(settings[slot].missedAlertTime===null&&previous?.slotSettings?.[slot]?.missedAlertTime!==null)settings[slot].missedAlertTime=MISSED_ALERTS[slot];
    const candidate={...draft,slotSettings:settings},errors=planErrors(candidate);
    if(Object.keys(errors).length)throw Error(Object.values(errors).join('；'));
    if(!previous&&candidate.slots.some(slot=>candidate.slotSettings[slot].missedAlertTime===null))throw Error('新计划必须有晚于用药提醒的 N2 提前预警');
    const p = { id: planId || id('med'), profileId: pid, name: draft.name.trim(), doseValue: Number(draft.doseValue), doseUnit: draft.doseUnit.trim(), slots: [...draft.slots], slotSettings: settings, startDate: draft.startDate, duration: draft.duration, endDate: draft.duration === '截至某日期' ? draft.endDate : null, note: draft.note || '', source: draft.source || '手动录入', assisted: !!draft.assisted, createdBy: previous?.createdBy || accountId, createdAt: previous?.createdAt || now(data), effectiveAt: now(data), version: (previous?.version || 0) + 1, status: 'active', color: previous?.color || 'blue', revisions: previous ? [...(previous.revisions || []), clone({ ...previous, revisions: [] })] : [] };
    if (previous) {
      data.medicationPlans[data.medicationPlans.indexOf(previous)] = p;
      data.doseEvents.filter(e => e.planId === p.id && e.startAt > now(data) && !e.started && !e.changes.length && !e.snoozeUsed).forEach(e => {
        const applicable = p.slots.includes(e.slot) && e.date >= p.startDate && (!p.endDate || e.date <= p.endDate);
        if (!applicable) { e.cancelledAt = now(data); e.cancelReason = '计划编辑取消未开始任务'; return; }
        const replacement = makeEvent(p, e.date, e.slot, now(data));
        Object.assign(e, replacement, { id: e.id });
      });
    } else data.medicationPlans.push(p);
    // 未来日期先保存计划；当演示日期前进到该日时再生成任务。
    generateEvents(data, p);
    return p;
  }
  function stopPlan(data, accountId, planId) {
    const p = data.medicationPlans.find(p => p.id === planId);
    if (!p || !canAccess(data, accountId, p.profileId)) throw Error('无权停用此计划');
    if (now(data) < p.effectiveAt) throw Error('演示时间早于计划生效时间');
    p.status = 'inactive'; p.stoppedAt = now(data); p.stoppedBy = accountId;
    data.doseEvents.filter(e => e.planId === planId && e.startAt > now(data) && !e.started && !e.changes.length && !e.snoozeUsed).forEach(e => { e.cancelledAt = now(data); e.cancelReason = '计划停用，取消未开始任务'; });
  }
  const declaration = e => ({ status: e.status, recordedAt: e.recordedAt, recordedBy: e.recordedBy, actual: clone(e.actual), changeToken: e.changeToken || null });
  function recordDose(data, accountId, eventId, status, options = {}) {
    const e = data.doseEvents.find(e => e.id === eventId);
    if (!e || !own(data, accountId, e) || !canAccess(data, accountId, e.profileId)) throw Error('只有长辈本人可记录已开始且仍保留的任务');
    if (!FACTS.includes(status)) throw Error('请选择明确的本人声明');
    if (options.operationId && e.changes.some(c => c.id === options.operationId)) return { eventId, token: options.operationId, before: declaration(e), duplicate: true };
    if (options.correction) {
      const eligibility = correctionEligibility(data, accountId, e);
      if (!eligibility.allowed) throw Error(eligibility.reason);
    } else if (status === 'not_taken') {
      const eligibility = notTakenEligibility(data, accountId, e);
      if (!eligibility.allowed) throw Error(eligibility.reason);
    } else {
      if (!canDeclare(data, accountId, e)) throw Error('只有长辈本人可记录已开始且仍保留的任务');
      if (resolved(e)) throw Error('此任务已有记录，请从更正入口处理');
    }
    if (e.changes.at(-1)?.recordedAt > now(data)) throw Error('演示时钟早于已有记录，请先向前调整时间');
    const before = declaration(e);
    const token = options.operationId || id('change');
    const at = now(data);
    e.changes.push({ id: token, kind: options.correction ? '更正' : '声明', before, status, recordedAt: at, recordedBy: accountId, actual: options.actual || null, reliableTime: true, syncState: data.simulationMode === 'offline' ? 'pending' : 'local', receivedAt: data.simulationMode === 'offline' ? null : at, inputSource: options.inputSource || '手动' });
    Object.assign(e, { status, recordedAt: at, recordedBy: accountId, actual: options.actual || null, changeToken: token, started: true });
    return { eventId, before, token };
  }
  function undoDose(data, accountId, operation) {
    const e = data.doseEvents.find(e => e.id === operation.eventId);
    if (!canDeclare(data, accountId, e) || e.changeToken !== operation.token || operation.accountId !== accountId || Date.now() > operation.expires) throw Error('撤销已过期或记录已变化，请使用更正记录');
    const before = declaration(e);
    const token = id('undo');
    e.changes.push({ id: token, kind: '撤销', before, status: operation.before.status, recordedAt: now(data), recordedBy: accountId, reliableTime: true, restores: clone(operation.before), syncState: data.simulationMode==='offline'?'pending':'local', receivedAt: data.simulationMode==='offline'?null:now(data) });
    Object.assign(e, clone(operation.before), { changeToken: token });
  }
  function snooze(data, accountId, eventId, duration) {
    const e = data.doseEvents.find(e => e.id === eventId);
    const reason = snoozeReason(data, accountId, e);
    if (reason) throw Error(reason);
    if (![5, 30].includes(duration)) throw Error('请选择延后 5 或 30 分钟');
    e.snoozeUsed = 1; e.started = true; e.snoozedAt = now(data); e.snoozeUntil = plusMinutes(now(data), duration); e.snoozedBy = accountId;
    e.snoozeSyncState = data.simulationMode === 'offline' ? 'pending' : 'local';
  }
  // 历史结算始终保留任务及截止前版本依据，后补记/更正不会覆盖旧结果。
  function dailyResult(data, pid, date) {
    const cutoff = stamp(addDays(date, 1), '00:00');
    const historical = date < day(data);
    const tasks = data.doseEvents.filter(e => e.profileId === pid && e.date === date && e.createdAt < cutoff && (!e.cancelledAt || (historical && e.cancelledAt >= cutoff)));
    const basis = tasks.map(e => {
      const changes = e.changes.filter(c => !historical || (c.reliableTime && c.recordedAt && c.recordedAt < cutoff));
      const c = changes.at(-1);
      return { eventId: e.id, planVersion: e.planVersion, snapshot: clone(e.snapshot), declarationVersion: c?.id || null, status: historical ? c?.status || 'pending' : e.status, recordedAt: c?.recordedAt || null, ruleVersion: 2 };
    });
    return { star: date <= day(data) && basis.length > 0 && basis.every(b => ['taken', 'skipped'].includes(b.status)), total: basis.length, recorded: basis.filter(b => FACTS.includes(b.status)).length, taken: basis.filter(b => b.status === 'taken').length, basis, cutoff, ruleVersion: 2 };
  }
  function notificationDefaults(d) {
    d.notificationsEnabled ??= true;d.privatePreview ??= false;d.simulationMode ??= 'online';
    d.notificationLogs.forEach(n=>{if(!n.kind)n.legacy=true;});
    return d;
  }
  // 仅专门的离线场景重建“模拟远端可见”版本；共享家庭事实仍只保存一份。
  function simulatedRemote(e) {
    const remote=clone(e);
    if(e.changes.some(c=>c.syncState==='pending')) {
      const received=e.changes.filter(c=>c.syncState!=='pending').at(-1);
      remote.status=received?.status||'pending';remote.recordedAt=received?.recordedAt||null;
    }
    if(e.snoozeSyncState==='pending') { remote.snoozeUsed=0;remote.snoozedAt=null;remote.snoozeUntil=null; }
    return remote;
  }
  function validN2TaskTimes(e) {
    if(!e||!validDate(e.date)||!SLOTS[e.slot]||!validTime(e.reminderTime)||e.scheduledTime!==e.reminderTime||minute(e.reminderTime)<RANGES[e.slot][0]||minute(e.reminderTime)>=RANGES[e.slot][1])return false;
    const times=taskTimes(e.date,e.slot,e.reminderTime);
    if(e.startAt!==times.startAt||e.reminderAt!==times.reminderAt||e.deadlineAt!==times.deadlineAt)return false;
    if(e.missedAlertTime===null)return e.missedAlertAt===null;
    return validTime(e.missedAlertTime)&&minute(e.missedAlertTime)>minute(e.reminderTime)&&minute(e.missedAlertTime)<RANGES[e.slot][1]&&e.missedAlertAt===stamp(e.date,e.missedAlertTime);
  }
  function notificationEligible(d,kind,e,warningRound=null) {
    if(!e)return false;
    const task=kind==='N2'?simulatedRemote(e):e,at=now(d);
    if(task.cancelledAt||resolved(task)||protectedAt(task,at)||at<task.createdAt||at<task.startAt)return false;
    if(kind==='N2') {
      if(!validN2TaskTimes(task))return false;
      const eligible=round=>round==='early'
        ? task.missedAlertAt!==null&&at>=task.missedAlertAt&&at<task.deadlineAt
        : round==='deadline'&&at>=task.deadlineAt;
      return warningRound===null?eligible('early')||eligible('deadline'):eligible(warningRound);
    }
    if(kind==='N3')return at>=task.reminderAt;
    return at>=task.reminderAt && ((at<task.deadlineAt) || (task.snoozeUsed&&at>=task.snoozeUntil));
  }
  function notificationRound(d,e,kind,warningRound=null) {
    const task=kind==='N2'?simulatedRemote(e):e;
    if(kind==='N2') {
      const round=warningRound||((now(d)>=task.deadlineAt)?'deadline':'early');
      return `warning-${round}-${round==='deadline'?task.deadlineAt:task.missedAlertAt}`;
    }
    return task.snoozeUsed&&now(d)>=task.snoozeUntil?`snooze-${task.snoozeUntil}`:`initial-${task.reminderAt}`;
  }
  function notificationRecipients(d,kind,pid) {
    return d.accounts.filter(a=>canAccess(d,a.id,pid)&&(kind==='N2'?(a.role==='child'||a.profileId===pid):a.role==='elder'));
  }
  const n2NotificationKey=(eventId,receiverId,warningRound)=>`${eventId}|${receiverId}|${warningRound}`;
  function appendNotification(d,kind,e,recipientId,operationId,fromAccountId=null,warningRound=null) {
    if(kind==='N2'&&!['early','deadline'].includes(warningRound))throw Error('N2 通知轮次无效');
    const round=kind==='N3'?operationId:notificationRound(d,e,kind,warningRound);
    const existing=kind==='N2'
      ? d.notificationLogs.find(n=>n.kind==='N2'&&n.legacy!==true&&n2NotificationKey(n.eventId,n.receiverId,n.warningRound)===n2NotificationKey(e.id,recipientId,warningRound))
      : d.notificationLogs.find(n=>n.kind===kind&&n.eventId===e.id&&n.recipientId===recipientId&&n.round===round);
    if(existing)return existing;
    const p=d.elderProfiles.find(p=>p.id===e.profileId),a=d.accounts.find(a=>a.id===fromAccountId);
    const pending=kind==='N2'&&(e.changes.some(c=>c.syncState==='pending')||e.snoozeSyncState==='pending');
    const title=kind==='N1'?'该吃药啦！':kind==='N2'?`${p.name}有用药记录待核对`:`${a.name}提醒您核对`;
    const missing=pending?'模拟远端暂未收到记录（打卡）':'尚未收到打卡';
    const noticeText=kind==='N2'?(warningRound==='early'?`提前预警：${missing}`:`已到本次自然时段截止，${missing}`):'目前尚未记录';
    const text=`${e.date} ${e.slot} · ${e.snapshot.name} · 计划 ${e.snapshot.doseValue} ${e.snapshot.doseUnit} · ${e.scheduledTime} 提醒，${noticeText}。请按实际情况记录。`;
    const queued=d.simulationMode==='offline'&&['N2','N3'].includes(kind);
    const deliveryState=d.simulationMode==='failure'?'failed':queued?'pending':'delivered';
    const noticeId=id('notice'),createdAt=now(d);
    const n={id:noticeId,kind,eventId:e.id,profileId:e.profileId,date:e.date,recipientId,fromAccountId,operationId,round,title,text,shortText:'您有一条用药记录提醒',createdAt,deliveryState,deliveryAttempts:deliveryState==='pending'?0:1,deliveredAt:deliveryState==='delivered'?createdAt:null,simulated:true,...(kind==='N2'?{warningRound,receiverId:recipientId,notificationId:noticeId,sentAt:deliveryState==='delivered'?createdAt:null}:{})};
    if(kind==='N2') {
      const decision=deliveryDecision(d,n,e);
      if(decision!=='deliver') {n.deliveryState=decision==='suppress'?'suppressed':'pending';n.deliveryAttempts=0;n.sentAt=null;n.deliveredAt=null;}
    }
    d.notificationLogs.push(n);return n;
  }
  function deliveryDecision(d,n,e) {
    if(!e||e.profileId!==n.profileId||e.date!==n.date||!notificationRecipients(d,n.kind,e.profileId).some(account=>account.id===n.recipientId))return 'suppress';
    if(n.kind==='N3') {
      const sender=d.accounts.find(account=>account.id===n.fromAccountId);
      if(sender?.role!=='child'||!canAccess(d,n.fromAccountId,e.profileId))return 'suppress';
    }
    if(e.cancelledAt||resolved(e))return 'suppress';
    const at=now(d);
    if(n.kind==='N2') {
      if(!validN2TaskTimes(e)||!['early','deadline'].includes(n.warningRound))return 'suppress';
      if(n.warningRound==='early'&&at>=e.deadlineAt)return 'suppress';
      if(at<e.createdAt||at<e.startAt||protectedAt(e,at))return 'wait';
      if(n.warningRound==='early')return at>=e.missedAlertAt?'deliver':'wait';
      return at>=e.deadlineAt?'deliver':'wait';
    }
    if(at<e.createdAt||at<e.startAt||protectedAt(e,at))return 'wait';
    if(notificationEligible(d,n.kind,e))return 'deliver';
    return at<e.reminderAt?'wait':'suppress';
  }
  function reconcileNotifications(d,{retryFailed=false}={}) {
    for(const n of d.notificationLogs.filter(n=>n.legacy!==true&&['pending','failed'].includes(n.deliveryState))) {
      const e=d.doseEvents.find(e=>e.id===n.eventId),decision=deliveryDecision(d,n,e);
      if(decision==='suppress') {n.deliveryState='suppressed';continue;}
      if(decision==='wait'||(n.deliveryState==='failed'&&!retryFailed))continue;
      if(d.simulationMode==='online') {
        n.deliveryAttempts+=1;n.deliveryState='delivered';n.deliveredAt=now(d);if(n.kind==='N2')n.sentAt=now(d);
      } else if(d.simulationMode==='failure'&&retryFailed) {
        n.deliveryAttempts+=1;n.deliveryState='failed';n.deliveredAt=null;if(n.kind==='N2')n.sentAt=null;
      }
    }
  }
  function evaluateNotifications(d) {
    if(!d.notificationsEnabled)return [];
    const before=new Set(d.notificationLogs.map(n=>n.id));
    reconcileNotifications(d);
    for(const e of d.doseEvents) {
      if(notificationEligible(d,'N1',e))for(const recipient of notificationRecipients(d,'N1',e.profileId))appendNotification(d,'N1',e,recipient.id,`N1-${e.id}-${notificationRound(d,e,'N1')}`);
      for(const warningRound of ['early','deadline']) {
        if(!notificationEligible(d,'N2',e,warningRound))continue;
        for(const recipient of notificationRecipients(d,'N2',e.profileId))appendNotification(d,'N2',e,recipient.id,`N2-${n2NotificationKey(e.id,recipient.id,warningRound)}`,null,warningRound);
      }
    }
    return d.notificationLogs.filter(n=>!before.has(n.id));
  }
  function sendN3(d,accountId,eventId,operationId) {
    const previous=d.notificationLogs.find(n=>n.kind==='N3'&&n.operationId===operationId);
    if(previous) { if(previous.fromAccountId!==accountId||previous.eventId!==eventId)throw Error('提醒请求不一致');return previous; }
    const e=d.doseEvents.find(e=>e.id===eventId),reason=reminderReason(d,accountId,e);
    if(reason)throw Error(reason);
    if(!d.notificationsEnabled)throw Error('模拟通知已关闭，未发送');
    const recipients=notificationRecipients(d,'N3',e.profileId);
    if(!recipients.length)throw Error('该档案暂无可接收通知的长辈演示账号');
    e.n3LastAt=now(d);
    return appendNotification(d,'N3',e,recipients[0].id,operationId,accountId);
  }
  function retryNotifications(d) {
    if(!d.notificationsEnabled)return;
    reconcileNotifications(d,{retryFailed:true});
  }
  function syncSimulation(d) {
    d.simulationMode='online';
    for(const e of d.doseEvents) {
      for(const c of e.changes)if(c.syncState==='pending') { c.syncState='synced';c.receivedAt=now(d); }
      if(e.snoozeSyncState==='pending') { e.snoozeSyncState='synced';e.snoozeReceivedAt=now(d); }
    }
    retryNotifications(d);
  }
  function focusCandidates(d,accountId) {
    return d.doseEvents.filter(e=>own(d,accountId,e)&&canAccess(d,accountId,e.profileId)&&notificationEligible(d,'N1',e))
      .sort((a,b)=>a.reminderAt.localeCompare(b.reminderAt)||a.id.localeCompare(b.id));
  }
  function migrateTaskToV3(e,p,d) {
    const reminder=validTime(e.reminderTime)?e.reminderTime:e.scheduledTime;
    if(!validTime(reminder))throw Error('invalid');
    const historical=resolved(e)||!!e.cancelledAt;
    const missed=historical?null:p.slotSettings[e.slot].missedAlertTime===null?null:safeMissedAlert(e.slot,reminder);
    e.scheduledTime=reminder;e.reminderTime=reminder;e.reminderAt ||= stamp(e.date,reminder);
    e.missedAlertTime=missed;e.missedAlertAt=missed?stamp(e.date,missed):null;
    e.snapshot={...e.snapshot,reminderTime:reminder,missedAlertTime:missed};
    e.started ||= e.startAt<=now(d)||!!e.changes.length||!!e.snoozeUsed;
  }
  function migrateNotificationsToV3(d) {
    const candidates=d.notificationLogs.map(n=>{
      if(n.kind!=='N2'||n.legacy===true)return null;
      const e=d.doseEvents.find(e=>e.id===n.eventId),sentAt=validStamp(n.sentAt)?n.sentAt:n.deliveryState==='delivered'&&validStamp(n.deliveredAt)?n.deliveredAt:null;
      const linked=e&&e.profileId===n.profileId&&e.date===n.date&&d.accounts.some(a=>a.id===n.recipientId);
      const complete=typeof n.text==='string'&&typeof n.operationId==='string'&&validStamp(n.createdAt)&&['delivered','failed','pending','suppressed'].includes(n.deliveryState)&&Number.isInteger(n.deliveryAttempts)&&n.deliveryAttempts>0;
      const deadlineRound=e&&n.round===`initial-${e.deadlineAt}`;
      const timing=e&&sentAt&&n.createdAt>=e.deadlineAt&&sentAt>=e.deadlineAt&&n.createdAt<=sentAt;
      return linked&&complete&&deadlineRound&&timing?{key:n2NotificationKey(n.eventId,n.recipientId,'deadline'),sentAt,rank:`${sentAt}|${n.createdAt}|${n.id}`} : null;
    });
    const winners=new Map();
    candidates.forEach(candidate=>{if(!candidate)return;const current=winners.get(candidate.key);if(!current||candidate.rank<current.rank)winners.set(candidate.key,candidate);});
    d.notificationLogs.forEach((n,index)=>{
      if(n.kind!=='N2')return;
      const original=clone(n),candidate=candidates[index];
      if(!candidate||winners.get(candidate.key)!==candidate){n.legacy=true;n.legacyRecord=original;delete n.warningRound;delete n.receiverId;delete n.notificationId;return;}
      delete n.legacy;n.warningRound='deadline';n.receiverId=n.recipientId;n.notificationId=n.id;n.sentAt=candidate.sentAt;
    });
  }
  function migrateV2ToV3(raw) {
    const d=clone(raw);d.version=3;
    d.medicationPlans.forEach(p=>{p.slotSettings=normalizedSlotSettings(p.slotSettings,{migrated:true});});
    d.doseEvents.forEach(e=>{const p=d.medicationPlans.find(p=>p.id===e.planId&&p.profileId===e.profileId);if(!p||!SLOTS[e.slot])throw Error('invalid');migrateTaskToV3(e,p,d);});
    migrateNotificationsToV3(d);return notificationDefaults(d);
  }
  function migrate(raw) {
    if (raw?.version === 3) {
      const d = clone(raw);
      d.doseEvents.forEach(e => { e.started ||= e.startAt <= now(d) || !!e.changes.length || !!e.snoozeUsed; });
      return notificationDefaults(d);
    }
    if(raw?.version===2)return migrateV2ToV3(raw);
    if (!raw || (raw.version != null && raw.version !== 1)) throw Error('invalid');
    const d = clone(raw);
    if (!['accounts', 'elderProfiles', 'medicationPlans', 'doseEvents', 'healthRecords', 'notificationLogs'].every(k => Array.isArray(d[k]))) throw Error('invalid');
    d.families ||= d.family ? [d.family] : [];
    d.version = 2; d.demoTime ||= '21:15'; d.dateOffset = 0; d.notificationStyle = 'ios';
    d.accounts.forEach(a => { a.familyId ||= d.family?.id; if (a.role === 'child') a.boundProfileIds ||= d.elderProfiles.map(p => p.id); });
    d.elderProfiles.forEach(p => { p.familyId ||= d.family?.id; });
    const slotName = slot => ({ 早餐后: '早餐', 午餐后: '午餐', 晚餐后: '晚餐' }[slot] || slot);
    d.medicationPlans.forEach(p => {
      if (!Array.isArray(p.slots) || p.slots.some(s => !SLOTS[slotName(s)])) throw Error('invalid');
      p.legacy = { slots: [...p.slots], source: p.source }; p.slots = p.slots.map(slotName);
      p.slotSettings = Object.fromEntries(Object.entries(LEGACY_SLOTS).map(([s, time]) => [s, { time, meal: '' }]));
      p.version = 1; p.effectiveAt = stamp(p.startDate, '00:00'); p.createdAt = p.effectiveAt;
      p.endDate ||= null; p.revisions = [];
    });
    d.doseEvents = d.doseEvents.map(old => {
      const p = d.medicationPlans.find(p => p.id === old.planId && p.profileId === old.profileId);
      const slot = slotName(old.slot);
      if (!p || !SLOTS[slot] || !validDate(old.date) || !['pending', 'overdue', 'taken_on_time', 'taken_late', 'skipped', 'not_taken'].includes(old.status)) throw Error('invalid');
      const eventPlan=clone(p),sourceReminder=validTime(old.scheduledTime)?old.scheduledTime:eventPlan.slotSettings[slot].time;eventPlan.slotSettings[slot].time=sourceReminder;
      const e = makeEvent(eventPlan, old.date, slot, stamp(old.date, '00:00'));
      delete e.reminderTime;delete e.missedAlertTime;delete e.missedAlertAt;delete e.snapshot.reminderTime;delete e.snapshot.missedAlertTime;
      const sourceTime = validTime(old.recordedAt) ? stamp(old.date, old.recordedAt) : validStamp(old.recordedAt) ? old.recordedAt : null;
      e.id = old.id; e.status = old.status.startsWith('taken_') ? 'taken' : old.status === 'overdue' ? 'pending' : old.status;
      e.recordedAt = sourceTime; e.recordedBy = old.recordedBy || null; e.recordedByName = old.recordedByName || null;
      e.legacy = clone(old);
      e.started = e.startAt <= now(d) || resolved(e);
      if (resolved(e)) e.changes.push({ id: `legacy-${e.id}`, kind: '旧版声明', before: { status: 'pending' }, status: e.status, recordedAt: sourceTime, recordedBy: e.recordedBy, reliableTime: !!sourceTime, actual: null, syncState: 'local' });
      if (p.status === 'inactive' && !resolved(e) && e.startAt > now(d)) { e.cancelledAt = now(d); e.cancelReason = '旧版停用计划的未开始任务'; }
      return e;
    });
    // 明确弃用字段只清理当前模型，legacy中保留原记录来源供追溯。
    for (const key of ['isPro', 'proEnabled', 'subscriptionStatus', 'piggyBank', 'rewardBalance', 'transactions', 'mascot', 'mascotUpdatedAt']) {
      delete d[key]; d.accounts.forEach(a => { delete a[key]; }); d.elderProfiles.forEach(p => { delete p[key]; });
    }
    return migrateV2ToV3(notificationDefaults(d));
  }
  function prepareSeed(raw) {
    const d = migrate(raw);
    d.medicationPlans.forEach(p => { delete p.legacy; p.source = p.source?.includes('拍照') ? '演示预设' : p.source; });
    d.doseEvents.forEach(e => { delete e.legacy; });
    // 明确预设的历史样例：10日全完成、11日含未服用、12日无任务。
    const p = d.medicationPlans[0];
    if (p) [10, 11].forEach(n => {
      const date = `2026-09-${n}`;
      const e = makeEvent(p, date, '早餐', stamp(date, '00:00'));
      e.id = `history-${n}`; e.status = n === 10 ? 'taken' : 'not_taken'; e.recordedAt = stamp(date, '08:10'); e.recordedBy = 'elder-zhang';
      e.changes = [{ id: `seed-history-${n}`, kind: '演示预设', before: { status: 'pending' }, status: e.status, recordedAt: e.recordedAt, recordedBy: e.recordedBy, reliableTime: true, syncState: 'local' }];
      if(!d.doseEvents.some(existing=>existing.id===e.id))d.doseEvents.push(e);
    });
    return d;
  }
  function validDeliveryMetadata(n) {
    if(!Number.isInteger(n.deliveryAttempts)||n.deliveryAttempts<0)return false;
    if(['delivered','failed'].includes(n.deliveryState)&&n.deliveryAttempts<1)return false;
    if(n.kind!=='N2')return true;
    if(!['early','deadline'].includes(n.warningRound)||n.receiverId!==n.recipientId||n.notificationId!==n.id)return false;
    if(n.sentAt!==null&&!validStamp(n.sentAt)||n.deliveredAt!==null&&!validStamp(n.deliveredAt))return false;
    if(n.deliveryState==='delivered')return validStamp(n.sentAt)&&validStamp(n.deliveredAt);
    if(n.deliveryState==='pending')return n.deliveryAttempts===0&&n.sentAt===null&&n.deliveredAt===null;
    if(n.deliveryState==='failed')return n.deliveryAttempts>0&&n.deliveredAt===null;
    return true;
  }
  function validData(d) {
    try {
      if (!d || d.version !== 3 || !validTime(d.demoTime) || !Number.isInteger(d.dateOffset) || d.dateOffset < 0 || d.dateOffset > 31 || !['ios', 'harmonyos', 'android'].includes(d.notificationStyle)) return false;
      const keys = ['accounts', 'families', 'elderProfiles', 'medicationPlans', 'doseEvents', 'healthRecords', 'notificationLogs'];
      if (!keys.every(k => Array.isArray(d[k]) && d[k].every(x => x && typeof x.id === 'string') && new Set(d[k].map(x => x.id)).size === d[k].length) || !d.accounts.length) return false;
      if (!d.accounts.every(a => ['elder', 'child'].includes(a.role) && ['normal', 'elder'].includes(a.fontMode) && d.families.some(f => f.id === a.familyId) && (a.role === 'elder' ? d.elderProfiles.some(p => p.id === a.profileId && p.familyId === a.familyId) : Array.isArray(a.boundProfileIds) && a.boundProfileIds.every(pid => d.elderProfiles.some(p => p.id === pid && p.familyId === a.familyId))))) return false;
      if (!d.elderProfiles.every(p => d.families.some(f => f.id === p.familyId))) return false;
      if (!d.medicationPlans.every(p => Object.keys(planErrors(p)).length === 0 && ['active', 'inactive'].includes(p.status) && d.elderProfiles.some(x => x.id === p.profileId) && Number.isInteger(p.version) && validStamp(p.effectiveAt) && Object.keys(SLOTS).every(slot=>{
        const setting=p.slotSettings?.[slot],reminder=setting?.reminderTime,missed=setting?.missedAlertTime;
        return setting&&setting.time===reminder&&validTime(reminder)&&minute(reminder)>=RANGES[slot][0]&&minute(reminder)<RANGES[slot][1]&&(missed===null||(validTime(missed)&&minute(missed)>minute(reminder)&&minute(missed)<RANGES[slot][1]));
      }))) return false;
      const taskKeys = d.doseEvents.map(e => `${e.profileId}|${e.planId}|${e.date}|${e.slot}`);
      if (new Set(taskKeys).size !== taskKeys.length) return false;
      if (!d.doseEvents.every(e => {
        if (!validDate(e.date) || !SLOTS[e.slot] || !['pending', ...FACTS].includes(e.status) || !d.medicationPlans.some(p => p.id === e.planId && p.profileId === e.profileId)) return false;
        const t = taskTimes(e.date, e.slot, e.scheduledTime),missed=e.missedAlertTime;
        if (!validTime(e.scheduledTime) || e.reminderTime!==e.scheduledTime || minute(e.scheduledTime) < RANGES[e.slot][0] || minute(e.scheduledTime) >= RANGES[e.slot][1] || Object.keys(t).some(k => e[k] !== t[k]) || !validStamp(e.createdAt)) return false;
        if(missed!==null&&(!validTime(missed)||minute(missed)<=minute(e.reminderTime)||minute(missed)>=RANGES[e.slot][1]||e.missedAlertAt!==stamp(e.date,missed))||missed===null&&e.missedAlertAt!==null)return false;
        if (!e.snapshot?.name || !(e.snapshot.doseValue > 0) || !Number.isFinite(e.snapshot.doseValue) || !e.snapshot.doseUnit || !['', '餐前', '餐后'].includes(e.snapshot.meal) || e.snapshot.reminderTime!==e.reminderTime || e.snapshot.missedAlertTime!==missed) return false;
        if (![0, 1].includes(e.snoozeUsed) || [e.cancelledAt, e.recordedAt, e.snoozeUntil, e.snoozedAt, e.n3LastAt].some(x => x != null && !validStamp(x))) return false;
        if (e.snoozeUsed && (!e.snoozeUntil || !e.snoozedAt || ![300000, 1800000].includes(Date.parse(e.snoozeUntil) - Date.parse(e.snoozedAt)))) return false;
        return Array.isArray(e.changes) && new Set(e.changes.map(c => c.id)).size === e.changes.length && e.changes.every(c => c.id && ['pending', ...FACTS].includes(c.status) && (c.recordedAt == null || validStamp(c.recordedAt)));
      })) return false;
      if (!d.healthRecords.every(r => d.elderProfiles.some(p => p.id === r.profileId) && ['blood_pressure', 'blood_lipid', 'body'].includes(r.type) && r.values && Object.values(r.values).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) && typeof r.measuredAt === 'string' && validDate(r.measuredAt.slice(0, 10)) && validTime(r.measuredAt.slice(11, 16)))) return false;
      if(typeof d.notificationsEnabled!=='boolean'||typeof d.privatePreview!=='boolean'||!['online','offline','failure'].includes(d.simulationMode))return false;
      const n2Keys=d.notificationLogs.filter(n=>n.kind==='N2'&&n.legacy!==true).map(n=>n2NotificationKey(n.eventId,n.receiverId,n.warningRound));if(new Set(n2Keys).size!==n2Keys.length)return false;
      return d.notificationLogs.every(n => n.legacy===true?typeof n.text==='string':
        (d.doseEvents.some(e=>e.id===n.eventId&&e.profileId===n.profileId&&e.date===n.date)&&typeof n.text==='string'&&['N1','N2','N3'].includes(n.kind)&&d.accounts.some(a=>a.id===n.recipientId)&&validDate(n.date)&&typeof n.round==='string'&&typeof n.operationId==='string'&&validStamp(n.createdAt)&&['delivered','failed','pending','suppressed'].includes(n.deliveryState)&&validDeliveryMetadata(n)));
    } catch { return false; }
  }
  return { DAY, SLOTS, MISSED_ALERTS, STATUS, RANGES, FACTS, clone, id, dateAt, addDays, stamp, day, now, minute, validDate, validTime, validStamp, plusMinutes, stateOf, resolved, protectedAt, canAccess, canDeclare, notTakenEligibility, correctionEligibility, snoozeReason, reminderReason, generateEvents, setClock, migrate, prepareSeed, validData, planErrors, savePlan, stopPlan, recordDose, undoDose, snooze, dailyResult, notificationDefaults, simulatedRemote, notificationEligible, notificationRound, evaluateNotifications, sendN3, retryNotifications, syncSimulation, focusCandidates };
});
