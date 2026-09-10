/* 药安心：同一浏览器内的家庭协同演示，不连接任何医疗或推送服务。 */
(() => {
  'use strict';

  const DATA_KEY = 'silver-health-data-v1';
  const VIEW_KEY = 'silver-health-view-v1';
  const DAY = '2026-09-13';
  const R = window.MedRules;
  const { SLOTS, STATUS } = R;
  const TYPES = {
    blood_pressure: { name: '血压', fields: [['systolic', '收缩压', 'mmHg'], ['diastolic', '舒张压', 'mmHg'], ['pulse', '脉搏', '次/分']] },
    blood_lipid: { name: '血脂', fields: [['tc', '总胆固醇 TC', 'mmol/L'], ['tg', '甘油三酯 TG', 'mmol/L'], ['hdl', '高密度脂蛋白 HDL-C', 'mmol/L'], ['ldl', '低密度脂蛋白 LDL-C', 'mmol/L']] },
    body: { name: '身体指标', fields: [['height', '身高', 'cm'], ['weight', '体重', 'kg'], ['fat', '体脂率', '%']] },
  };
  const app = document.getElementById('app');
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const resolved = event => R.resolved(event);
  let storageWarning = '';
  let invalidStorage = false;

  function seed() {
    return R.prepareSeed(window.SILVER_SEED_DATA);
  }

  function validData(value) {
    return R.validData(value);
  }

  function load() {
    let saved;
    try {
      saved = localStorage.getItem(DATA_KEY);
    } catch {
      storageWarning = '浏览器不允许本地保存，本次操作仅在当前页面有效。';
      return seed();
    }
    if (saved) {
      try {
        const parsed = R.migrate(JSON.parse(saved));
        if (!validData(parsed)) throw new Error('invalid');
        return parsed;
      } catch {
        // 读取后的任何解析/迁移错误都视作损坏存档，绝不能在下次操作时覆盖原文。
        invalidStorage = true;
        storageWarning = '原有存档无法读取，已保留原存档。本次使用临时演示数据。';
      }
    }
    return seed();
  }

  let data = load();
  let view = { accountId: 'elder-zhang', page: 'home', healthType: 'blood_pressure', planTab: 'active', historyDate: DAY };
  try { Object.assign(view, JSON.parse(sessionStorage.getItem(VIEW_KEY) || '{}')); } catch { /* 无存储权限时继续使用内存。 */ }
  if (!data.accounts.some(a => a.id === view.accountId)) view.accountId = data.accounts[0].id;
  if (!['home', 'plans', 'health', 'me'].includes(view.page)) view.page = 'home';
  if (!TYPES[view.healthType]) view.healthType = 'blood_pressure';
  let modal = null;
  let modalReturnFocus = null;
  let undo = null;
  let undoTimer;
  let toastTimer;
  let overdueOpen = false;

  const account = () => data.accounts.find(a => a.id === view.accountId);
  const family = () => data.families.find(f => f.id === account().familyId);
  const permitted = () => account().role === 'elder' ? [account().profileId] : account().boundProfileIds;
  const canAccess = pid => permitted().includes(pid);
  const profiles = () => data.elderProfiles.filter(p => canAccess(p.id));
  const profile = () => profiles().find(p => p.id === account().selectedProfileId) || profiles()[0];
  const planFor = event => event.snapshot || data.medicationPlans.find(p => p.id === event.planId);
  const stateOf = event => R.stateOf(event, data);
  const today = () => R.day(data);
  const now = () => R.now(data);
  const displayTime = value => value ? String(value).replace('T', ' ').replace(/(?:\:00)?\+08:00$/, '') : '时间依据不足';
  const author = record => data.accounts.find(a => a.id === (record.createdBy || record.recordedBy))?.name || record.recordedByName || '演示数据';
  const eventsOn = (date, pid = profile()?.id) => data.doseEvents.filter(e => e.profileId === pid && e.date === date && !e.cancelledAt).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime) || a.id.localeCompare(b.id));
  const eventsToday = (pid = profile()?.id) => eventsOn(today(), pid);
  const recordsFor = (type = view.healthType) => data.healthRecords.filter(r => r.profileId === profile()?.id && r.type === type).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || (b.createdAt || '').localeCompare(a.createdAt || ''));


  function rememberView() {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* 当前页面仍可正常切换。 */ }
  }

  // 业务修改集中保存；存储失败时明确提示，不把临时数据说成已经持久化。
  function commit(change) {
    const next = clone(data);
    try { change(next); } catch (error) { toast(error.message || '操作未保存，请检查输入。', 'warning'); return false; }
    if (!validData(next)) { toast('数据校验失败，未保存任何修改。', 'warning'); return false; }
    data = next;
    if (!invalidStorage) {
      try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); storageWarning = ''; }
      catch { storageWarning = '本地保存失败，本次操作仅在当前页面有效；刷新后可能丢失。'; }
    }
    return true;
  }

  function button(text, action, css = 'button-primary', attrs = '') {
    return `<button type="button" class="${css}" data-action="${action}" ${attrs}>${text}</button>`;
  }
  const badge = event => `<span class="status-badge status-${stateOf(event)}">${STATUS[stateOf(event)]}</span>`;
  const section = (title, content, trailing = '') => `<section><div class="section-title-row"><h2>${title}</h2>${trailing}</div>${content}</section>`;
  const empty = text => `<div class="empty-slot">${text}</div>`;
  const safety = () => `<aside class="safety-note">${icon('shield')}<span>仅含演示数据，不提供医疗建议，不应用于真实用药决策。</span></aside>`;

  function topbar() {
    return `<div class="topbar"><div class="brand-lockup"><span class="brand-mark">${icon('heartbeat')}</span>药安心</div><div class="header-tools">${button(icon('clock'), 'history', 'header-icon-button', 'aria-label="查看打卡记录" title="查看打卡记录"')}${button(icon('users'), 'accounts', 'header-icon-button', 'aria-label="切换演示账号" title="切换演示账号"')}</div></div>`;
  }

  function profileSelector() {
    const p = profile();
    if (account().role !== 'child' || !p) return '';
    return button(`<span class="mini-avatar">${esc(p.avatar)}</span><span>${esc(p.name)} · ${esc(p.relation)}</span>${icon('down')}`, 'profiles', 'profile-switcher', 'aria-label="切换长辈档案"');
  }

  function header(title, subtitle = '') {
    return `<header class="page-header compact">${topbar()}<h1 class="page-title">${title}</h1>${subtitle ? `<p class="page-subtitle">${subtitle}</p>` : ''}${profileSelector()}</header>`;
  }

  function reminderButton(event) {
    const reason = R.reminderReason(data, view.accountId, event);
    return `<div class="reminder-control">${button(`${icon('bell')}提醒 TA（模拟）`, 'remind', 'button-secondary button-small', `data-id="${event.id}" ${reason ? 'disabled aria-disabled="true"' : ''}`)}${reason ? `<small>${esc(reason)}</small>` : ''}</div>`;
  }

  function doseActions(event) {
    if (account().role === 'child') return reminderButton(event);
    if (!R.canDeclare(data, view.accountId, event)) return '<p class="helper-text">尚未到此时段或任务已取消</p>';
    if (resolved(event)) return button('更正记录', 'correct-dose', 'text-button', `data-id="${event.id}"`);
    const reason = R.snoozeReason(data, view.accountId, event);
    return `<div class="dose-actions">${button(`${icon('check')}已服用`, 'take', 'button-primary', `data-id="${event.id}"`)}${button('未服用', 'declare', 'button-secondary', `data-id="${event.id}" data-status="not_taken"`)}${button('本次无需服用', 'dose-confirm', 'button-secondary', `data-id="${event.id}" data-status="skipped"`)}</div><div class="snooze-actions">${[5, 30].map(n => button(`延后 ${n} 分钟`, 'snooze', 'button-secondary button-small', `data-id="${event.id}" data-minutes="${n}" ${reason ? 'disabled aria-disabled="true"' : ''}`)).join('')}</div><p class="helper-text">${esc(reason ? (event.snoozeUsed ? '* 延后机会已用完，请按实际情况记录' : reason) : '* 本次任务仅有 1 次延后机会')}</p>`;
  }

  function recordDetails(event) {
    return `${event.recordedAt ? `<p class="helper-text">${event.recordedAt >= event.deadlineAt ? '补记 · ' : ''}${esc(displayTime(event.recordedAt))}记录 · ${esc(author(event))}</p>` : ''}${event.snoozeUntil && !resolved(event) ? `<p class="helper-text">再次提醒：${esc(displayTime(event.snoozeUntil))}</p>` : ''}${event.legacy ? '<p class="helper-text">旧版来源保留；餐时待本人核对，记录时间不代表服药时间。</p>' : ''}`;
  }

  const mealTag = event => planFor(event).meal ? `<span class="meal-tag">${esc(planFor(event).meal)}</span>` : '';

  function overdueCard(events) {
    const late = events.filter(e => stateOf(e) === 'overdue');
    if (!late.length) return '';
    return `<section class="card overdue-card ${overdueOpen ? 'is-open' : ''}">${button(`<span class="overdue-dot" aria-hidden="true"></span><span>未按时打卡提醒（${late.length}）</span>${icon('down')}`, 'overdue', 'overdue-toggle', `aria-expanded="${overdueOpen}" aria-controls="overdue-items"`)}<div class="overdue-items" id="overdue-items"><p class="microcopy">未打卡不等于未服药。仅记录实际情况，请勿因提醒自行补服。</p>${late.map(e => `<article class="overdue-item"><div class="overdue-item-main"><div><strong>${esc(planFor(e).name)} ${mealTag(e)}</strong><span>${e.date} ${e.slot} · ${e.scheduledTime} · 计划 ${esc(planFor(e).doseValue)} ${esc(planFor(e).doseUnit)}</span></div>${badge(e)}</div>${doseActions(e)}</article>`).join('')}</div></section>`;
  }

  function medCard(event) {
    const plan = planFor(event);
    return `<article class="card med-card color-${esc(plan.color || 'blue')}" id="task-${event.id}" data-event="${event.id}"><div class="med-card-top"><div class="med-card-title-wrap"><h3>${esc(plan.name)} ${mealTag(event)}</h3><div class="med-meta"><span>${icon('pill')}计划 ${esc(plan.doseValue)} ${esc(plan.doseUnit)}/次</span><span>${icon('clock')}${event.slot} ${event.scheduledTime}</span></div></div>${badge(event)}</div>${recordDetails(event)}${doseActions(event)}${button('查看记录详情', 'task-detail', 'text-button', `data-id="${event.id}"`)}</article>`;
  }

  function homePage() {
    const p = profile();
    const events = eventsToday();
    const complete = events.filter(resolved).length;
    const taken = events.filter(e => e.status.startsWith('taken')).length;
    const late = events.filter(e => stateOf(e) === 'overdue').length;
    const pending = events.length - complete - late;
    if (account().role === 'child') {
      return `<header class="hero">${topbar()}<div class="hero-copy"><p class="hero-greeting">${esc(account().name)}，您好 · ${today()}</p><h1 class="hero-name">首页看板</h1><p class="hero-subtitle">家人的记录，放在一起看</p></div>${profileSelector()}</header><div class="family-summary-grid"><div class="metric-card complete"><strong>${complete}/${events.length}</strong><span>已记录 · 服用 ${taken}</span></div><div class="metric-card pending"><strong>${pending}</strong><span>待记录</span></div><div class="metric-card overdue"><strong>${late}</strong><span>未按时打卡</span></div></div>${overdueCard(events)}${section('今日用药', events.length ? schedule(events) : empty('今天暂无用药打卡计划'), button(`${icon('plus')}添加药品`, 'home-add-med', 'text-button'))}<div class="module-link">${button('查看全部用药／打卡记录', 'history', 'text-button')}</div>${section('本月打卡日历', calendar())}${section('身体数据', healthSummary(), button('添加身体数据', 'home-add-health', 'text-button'))}${safety()}`;
    }
    const currentSlot = Object.keys(SLOTS).find(slot => { const start = { 早餐: 300, 午餐: 660, 晚餐: 960, 睡前: 1200 }[slot]; const end = { 早餐: 660, 午餐: 960, 晚餐: 1200, 睡前: 1440 }[slot]; return minutes(data.demoTime) >= start && minutes(data.demoTime) < end; }) || '凌晨（无固定时段）';
    const current = events.filter(e => e.slot === currentSlot && stateOf(e) !== 'overdue');
    const next = events.find(e => !resolved(e) && minutes(e.scheduledTime) > minutes(data.demoTime));
    return `<header class="hero">${topbar()}<div class="hero-copy"><p class="hero-greeting">${today()} · 北京时间</p><h1 class="hero-name">${esc(p?.name || account().name)}，您好</h1><p class="hero-subtitle">今天，也照顾好自己</p></div></header><div class="home-shortcuts">${button(`<span>${icon('pill')}</span><strong>点击添加用药打卡</strong>`, 'home-add-med', 'shortcut-card')}${button(`<span>${icon('heartbeat')}</span><strong>点击添加身体数据</strong>`, 'home-add-health', 'shortcut-card')}</div><section class="card summary-card overlap-card"><div><h2>今天已记录 ${complete}/${events.length}</h2><p>已服用 ${taken} 次 · 本次无需服用 ${events.filter(e => e.status === 'skipped').length} 次</p><p>${R.dailyResult(data, p?.id, today()).star ? '★ 当天记录符合星星条件' : '有任务且全部已服用／本次无需服用时点星'}</p></div><div class="progress-ring" style="--progress:${events.length ? complete / events.length * 100 : 0}%" role="img" aria-label="今天已记录 ${complete} 次，共 ${events.length} 次"><span>${complete}/${events.length}</span></div></section>${overdueCard(data.doseEvents.filter(e => e.profileId === p?.id && !e.cancelledAt))}${section(`现在 · ${currentSlot}`, current.length ? `<div class="card-list">${current.map(medCard).join('')}</div>` : empty(`本时段没有待打卡药物${next ? `，下一次是${next.slot} ${next.scheduledTime}` : ''}`))}${section('今日其他记录', schedule(events.filter(e => e.slot !== currentSlot && stateOf(e) !== 'overdue'), false))}${safety()}`;
  }

  function calendar() {
    const month = today().slice(0, 7);
    const days = new Date(`${month}-01T00:00:00Z`);
    const offset = (days.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(days.getUTCFullYear(), days.getUTCMonth() + 1, 0)).getUTCDate();
    return `<div class="calendar-card"><div class="calendar-month">${Number(month.slice(0, 4))} 年 ${Number(month.slice(5))} 月 <span>今天 ${today().slice(8)} 日</span></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(x=>`<span class="weekday">${x}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:count},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`;const star=R.dailyResult(data,profile()?.id,date).star;return button(`${star?icon('star'):''}<span>${i+1}</span>`, 'calendar-date', `calendar-date ${date===today()?'is-today':''} ${star?'has-star':''}`,`data-date="${date}" aria-label="${date}${star?'，记录完成':''}" ${date>today()?'disabled':''}`);}).join('')}</div><p class="helper-text">当天有任务，且每项均记录为已服用或本次无需服用时显示星星。</p></div>`;
  }

  function bmiFor(record) {
    if (!record || record.type !== 'body' || !(record.values.weight > 0)) return null;
    const height = record.values.height > 0 ? record : data.healthRecords.filter(r=>r.profileId===record.profileId && r.type==='body' && r.measuredAt<=record.measuredAt && r.values.height>0).sort((a,b)=>b.measuredAt.localeCompare(a.measuredAt))[0];
    if (!height) return null;
    const value = record.values.weight / ((height.values.height / 100) ** 2);
    return Number.isFinite(value) ? { value, heightId: height.id, heightDate: height.measuredAt, height: height.values.height } : null;
  }
  function bmiLabel(record) {
    const bmi=bmiFor(record);
    return bmi ? `<p class="bmi-value">BMI · 自动计算 <strong>${bmi.value.toFixed(1)}</strong> kg/m²</p><p class="helper-text">身高来源：${esc(bmi.heightDate)} · ${bmi.height} cm</p>` : '<p class="helper-text">补充身高和体重后自动计算 BMI</p>';
  }
  function healthSummary() {
    return `<div class="health-summary">${Object.entries(TYPES).map(([type, info])=>{const r=recordsFor(type)[0];return `<article><div class="summary-heading"><h3>${info.name}</h3>${button('查看详情','summary-health','text-button',`data-value="${type}"`)}</div>${r?`<strong>${esc(formatValues(r))}</strong><p class="helper-text">${r.measuredAt.slice(0,10)===today()?'今天':'最近一次'} · ${esc(r.measuredAt)} · ${esc(r.source)}</p>${type==='body'?bmiLabel(r):''}`:'<p class="helper-text">暂无记录</p>'}</article>`;}).join('')}</div>`;
  }

  function schedule(events, remind = true) {
    if (!events.length) return empty('暂无用药记录');
    return `<div class="schedule-list">${Object.entries(SLOTS).filter(([slot]) => events.some(e => e.slot === slot)).map(([slot]) => `<section class="schedule-group"><div class="schedule-group-title">${icon('clock')}${slot}</div>${events.filter(e => e.slot === slot).map(e => `<div class="schedule-row"><div class="schedule-name"><strong>${esc(planFor(e).name)} ${mealTag(e)}</strong><span>计划 ${esc(planFor(e).doseValue)} ${esc(planFor(e).doseUnit)}/次 · 提醒 ${e.scheduledTime}</span>${recordDetails(e)}</div><div class="schedule-status">${badge(e)}${button('查看当次', 'task-detail', 'text-button', `data-id="${e.id}"`)}${remind && account().role === 'child' ? reminderButton(e) : ''}</div></div>`).join('')}</section>`).join('')}</div>`;
  }

  function plansPage() {
    const plans = data.medicationPlans.filter(p => p.profileId === profile()?.id && p.status === view.planTab);
    const history = eventsOn(view.historyDate);
    if (view.planTab === 'history') {
      const result = R.dailyResult(data, profile()?.id, view.historyDate);
      return `${header('用药信息', `${esc(profile()?.name || '')} · 打卡记录`)}<div class="filter-tabs">${button('正在服用', 'plan-tab', 'filter-button', 'data-value="active"')}${button('已停用', 'plan-tab', 'filter-button', 'data-value="inactive"')}${button('打卡记录', 'plan-tab', 'filter-button is-active', 'data-value="history"')}</div><div class="history-date form-row"><label for="history-date">任务日期</label><input id="history-date" type="date" value="${esc(view.historyDate)}" max="${today()}"></div>${section(`${result.star ? '★ ' : ''}${view.historyDate} · 已记录 ${result.recorded}/${result.total}`, `<p class="history-caption">${view.historyDate < today() ? '历史星星依据当日结束前的记录；后续补记、更正单独留痕。' : '按本人声明记录；未记录不代表未服用。'}</p>${history.length ? `<div class="card-list">${history.map(medCard).join('')}</div>` : empty('这一天没有用药任务')}`)}${safety()}`;
    }
    return `${header('用药信息', `${esc(profile()?.name || '')}的药物计划与打卡记录`)}<div class="filter-tabs" role="tablist" aria-label="用药信息分类">${[['active', '正在服用'], ['inactive', '已停用'], ['history', '打卡记录']].map(([key, label]) => button(label, 'plan-tab', `filter-button ${view.planTab === key ? 'is-active' : ''}`, `role="tab" aria-selected="${view.planTab === key}" data-value="${key}"`)).join('')}</div>${view.planTab === 'history' ? `<div class="history-date form-row"><label for="history-date">记录日期</label><input id="history-date" type="date" value="${esc(view.historyDate)}" max="${DAY}"></div>${section('已确认的记录', history.length ? `<div class="record-list">${history.map(e => `<article class="record-row"><div><strong>${esc(planFor(e).name)}</strong><span>${e.slot} ${e.scheduledTime} · ${esc(author(e))}</span></div><div class="record-right">${badge(e)}<span>${esc(e.recordedAt || '')}</span></div></article>`).join('')}</div>` : empty('这一天还没有已确认的打卡记录'))}` : section(view.planTab === 'inactive' ? '已停用的计划' : '药物计划', plans.length ? `<div class="card-list">${plans.map(p => `<article class="card plan-card"><span class="plan-pill-icon ${esc(p.color || 'blue')}">${icon('pill')}</span><div class="plan-info"><h3>${esc(p.name)}</h3><p>${esc(p.doseValue)} ${esc(p.doseUnit)}/次 · 每天 ${p.slots.length} 次</p><p>${p.slots.map(slot => `${slot} ${esc(p.slotSettings[slot].time)}${p.slotSettings[slot].meal ? ` <span class="meal-tag">${esc(p.slotSettings[slot].meal)}</span>` : ''}`).join('<br>')}</p><p>${esc(p.source)}</p>${p.startDate > today() ? `<p>将于 ${p.startDate} 开始</p>` : p.endDate && p.endDate < today() ? `<p>已于 ${p.endDate} 到期</p>` : ''}</div>${button(icon('chevron'), 'plan-detail', 'plan-more', `data-id="${p.id}" aria-label="查看${esc(p.name)}" title="查看药物计划"`)}</article>`).join('')}</div>` : empty('暂无此类药物计划'))}${safety()}`;
  }

  function formatValues(record) {
    if (record.type === 'blood_pressure') return `${record.values.systolic}/${record.values.diastolic} mmHg`;
    return TYPES[record.type].fields.filter(([key]) => record.values[key] != null).map(([key, label, unit]) => `${label} ${record.values[key]} ${unit}`).join(' · ');
  }

  function chart(records) {
    const rows = records.slice(0, 7).reverse();
    if (!rows.length) return empty('记录血压后显示趋势');
    const values = rows.flatMap(r => [r.values.systolic, r.values.diastolic]);
    const min = Math.floor((Math.min(...values) - 10) / 10) * 10;
    const max = Math.max(min + 20, Math.ceil((Math.max(...values) + 10) / 10) * 10);
    const x = i => rows.length === 1 ? 190 : 40 + i * 292 / (rows.length - 1);
    const y = n => 135 - (n - min) / (max - min) * 108;
    return `<div class="chart-card"><svg class="line-chart" viewBox="0 0 360 180" role="img" aria-label="最近 ${rows.length} 次血压记录：蓝线为收缩压，绿线为舒张压"><text x="5" y="12" font-size="11" fill="#536478">mmHg</text>${[min, (min + max) / 2, max].map(v => `<line x1="37" y1="${y(v)}" x2="337" y2="${y(v)}" stroke="#e0e7e3"/><text x="3" y="${y(v) + 4}" font-size="11" fill="#536478">${v}</text>`).join('')}${[['systolic', '#366ca8'], ['diastolic', '#327a57']].map(([key, color]) => `<polyline points="${rows.map((r, i) => `${x(i)},${y(r.values[key])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>${rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.values[key])}" r="4" fill="${color}"><title>${esc(r.measuredAt)} · ${key === 'systolic' ? '收缩压' : '舒张压'} ${r.values[key]} mmHg</title></circle>`).join('')}`).join('')}${rows.map((r, i) => `<text x="${x(i)}" y="161" text-anchor="middle" font-size="10" fill="#536478">${r.measuredAt.slice(5, 10)}</text>`).join('')}</svg><div class="legend-row"><span class="legend-item"><i class="legend-dot" style="background:#366ca8"></i>收缩压</span><span class="legend-item"><i class="legend-dot" style="background:#327a57"></i>舒张压</span></div></div>`;
  }

  function healthPage() {
    const records = recordsFor();
    const latest = records[0];
    return `${header('身体数据', `${esc(profile()?.name || '')}的原始测量记录`)}<div class="filter-tabs" role="tablist" aria-label="身体数据类型">${Object.entries(TYPES).map(([key, type]) => button(type.name, 'health-tab', `filter-button ${view.healthType === key ? 'is-active' : ''}`, `role="tab" aria-selected="${view.healthType === key}" data-value="${key}"`)).join('')}</div>${latest ? `<section class="latest-data-card"><div><h2>最近一次${TYPES[view.healthType].name}</h2>${view.healthType === 'blood_pressure' ? `<p class="latest-value">${latest.values.systolic}/${latest.values.diastolic} <small>mmHg</small></p>${latest.values.pulse != null ? `<p class="microcopy">脉搏 ${latest.values.pulse} 次/分</p>` : ''}` : `<div class="data-values">${TYPES[view.healthType].fields.filter(([key]) => latest.values[key] != null).map(([key, label, unit]) => `<div><span>${label}</span><strong>${latest.values[key]} <small>${unit}</small></strong></div>`).join('')}</div>`}${view.healthType === 'body' ? bmiLabel(latest) : ''}<p class="latest-meta">${esc(latest.measuredAt)} · ${esc(author(latest))}</p></div><span class="pill pill-blue data-source-chip">${esc(latest.source)}</span></section>` : section('最近一次', empty('还没有记录'))}${view.healthType === 'blood_pressure' ? section('最近 7 次趋势', chart(records)) : ''}${section('历史记录', records.length ? `<div class="record-list">${records.map(r => `<article class="record-row"><div><strong>${esc(formatValues(r))}</strong><span>${esc(r.measuredAt)} · ${esc(r.source)} · ${esc(author(r))}</span>${r.type === 'blood_pressure' && r.values.pulse != null ? `<span>脉搏 ${r.values.pulse} 次/分</span>` : ''}${r.extras?.length ? `<span>${r.extras.map(e => `${esc(e.name)} ${esc(e.value)} ${esc(e.unit)}`).join(' · ')}</span>` : ''}${r.note ? `<span>${esc(r.note)}</span>` : ''}${r.type === 'body' ? bmiLabel(r) : ''}</div></article>`).join('')}</div>` : empty('暂无历史记录'))}<div class="device-import-card"><span class="device-icon-wrap">${icon('device')}</span><div><strong>模拟设备导入</strong><span>预设演示值 · 无设备连接</span></div>${button(`${icon('upload')}导入`, 'import', 'button-secondary button-small')}</div>${safety()}`;
  }

  function accountOptions() {
    return `<div class="account-switcher">${data.accounts.map(a => button(`<span class="avatar">${esc(a.avatar)}</span><span><strong>${esc(a.name)}</strong><span>${a.role === 'elder' ? '长辈端' : '子女端'}</span></span>`, 'switch-account', `account-option ${a.id === view.accountId ? 'is-active' : ''}`, `data-id="${a.id}" aria-pressed="${a.id === view.accountId}"`)).join('')}</div>`;
  }

  function mePage() {
    const a = account();
    return `${header('我的')}<section class="profile-card"><span class="avatar">${esc(a.avatar)}</span><div class="profile-info"><h2>${esc(a.name)}</h2><p>${a.age} 岁 · ${a.role === 'elder' ? '长辈账号' : '子女账号'}</p></div><span class="pill pill-green">演示账号</span></section>${section('显示设置', `<div class="settings-list"><div class="setting-row"><span class="setting-leading">${icon('settings')}</span><div class="setting-content"><strong>字号模式</strong></div><div class="font-segmented" role="group" aria-label="字号模式">${[['normal', '标准'], ['elder', '大字']].map(([key, label]) => button(label, 'font', a.fontMode === key ? 'is-active' : '', `data-value="${key}" aria-pressed="${a.fontMode === key}"`)).join('')}</div></div></div>`)}${section('家庭与账号', `<div class="settings-list">${button(`<span class="setting-leading">${icon('users')}</span><span class="setting-content"><strong>${esc(family().name)}</strong><span>${profiles().map(p => esc(p.name)).join('、')}</span></span>${icon('chevron')}`, 'family', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('user')}</span><span class="setting-content"><strong>首次使用引导</strong><span>新建本地演示账号</span></span>${icon('chevron')}`, 'onboarding', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('bell')}</span><span class="setting-content"><strong>模拟提醒记录</strong></span>${icon('chevron')}`, 'notifications', 'setting-row setting-button')}</div>`)}${section('切换演示账号', accountOptions())}${section('演示设置', `<div class="settings-list">${button(`<span class="setting-leading">${icon('clock')}</span><span class="setting-content"><strong>演示时间</strong><span>${today()} ${data.demoTime}</span></span>${icon('chevron')}`, 'clock', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('info')}</span><span class="setting-content"><strong>演示与隐私说明</strong></span>${icon('chevron')}`, 'about', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('back')}</span><span class="setting-content"><strong>恢复初始演示数据</strong></span>${icon('chevron')}`, 'reset', 'setting-row setting-button')}</div>`)}${safety()}`;
  }

  function render() {
    const scroll = document.querySelector('.app-main')?.scrollTop || 0;
    const pages = { home: homePage, plans: plansPage, health: healthPage, me: mePage };
    app.innerHTML = `<div class="app-shell font-${account().fontMode}"><div class="app-main" id="page-region"><div class="demo-strip"><span>本地演示 · ${today()} ${data.demoTime}</span><span>${esc(account().name)} · ${account().role === 'elder' ? '长辈' : '子女'}</span></div>${storageWarning ? `<div class="storage-warning" role="alert">${esc(storageWarning)}</div>` : ''}<div class="page-content">${pages[view.page]()}</div><footer class="page-footer">药安心 · 家庭协同</footer></div>${['plans', 'health'].includes(view.page) ? button(icon('plus'), 'quick-add', 'fab', `aria-label="${view.page === 'plans' ? '添加药品打卡计划' : '添加身体数据'}"`) : ''}<nav class="bottom-nav" aria-label="主导航">${[['home', 'heartbeat', account().role === 'child' ? '首页看板' : '服药打卡'], ['plans', 'pill', '用药信息'], ['health', 'chart', '身体数据'], ['me', 'user', '我的']].map(([key, symbol, label]) => button(`<span class="nav-icon-wrap">${icon(symbol)}</span><span>${label}</span>`, 'navigate', `nav-item ${view.page === key ? 'is-active' : ''}`, `data-page="${key}" ${view.page === key ? 'aria-current="page"' : ''}`)).join('')}</nav><div id="modal-root"></div><div class="toast-stack" id="toast-root" role="status" aria-live="polite"></div></div>`;
    document.querySelector('.app-main').scrollTop = scroll;
    renderModal();
    rememberView();
  }

  function navigate(page) {
    view.page = page;
    closeModal(false);
    render();
    document.querySelector('.app-main').scrollTop = 0;
    window.scrollTo(0, 0);
    const heading = app.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }

  function toast(message, type = 'success', allowUndo = false) {
    clearTimeout(toastTimer);
    const root = document.getElementById('toast-root');
    if (!root) return;
    root.innerHTML = `<div class="toast ${type}">${icon(type === 'warning' ? 'warning' : 'check')}<span>${esc(message)}</span>${allowUndo ? button(`${icon('back')}撤销`, 'undo', 'toast-undo', 'aria-label="撤销本次打卡"') : ''}</div>`;
    toastTimer = setTimeout(() => { root.innerHTML = ''; }, allowUndo ? 5000 : 3800);
  }

  function openModal(type, fields = {}) {
    if (!modal) {
      const active = document.activeElement;
      modalReturnFocus = active?.dataset.action ? { action: active.dataset.action, id: active.dataset.id, page: active.dataset.page } : null;
    }
    modal = { type, ...fields };
    renderModal();
  }

  function closeModal(restore = true) {
    if (restore && modal?.picker) { modal.picker = null; renderModal(); return; }
    if (restore && modal?.errorLayer) { dismissErrors(); return; }
    modal = null;
    document.getElementById('modal-root')?.replaceChildren();
    document.getElementById('page-region')?.removeAttribute('inert');
    document.querySelector('.bottom-nav')?.removeAttribute('inert');
    document.querySelector('.fab')?.removeAttribute('inert');
    document.body.classList.remove('modal-open');
    if (restore && modalReturnFocus) {
      const target = [...app.querySelectorAll('[data-action]')].find(e => e.dataset.action === modalReturnFocus.action && e.dataset.id === modalReturnFocus.id && e.dataset.page === modalReturnFocus.page);
      (target || app.querySelector('.nav-item.is-active'))?.focus({ preventScroll: true });
    }
  }

  function modalFrame(title, content) {
    return `<div class="modal-backdrop"><section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="sheet-handle"></div><div class="modal-header"><h2 id="modal-title">${title}</h2>${button(icon('close'), 'close-modal', 'close-button', 'aria-label="关闭弹窗" title="关闭"')}</div><div class="sheet-content">${content}</div></section></div>`;
  }

  function renderModal() {
    const root = document.getElementById('modal-root');
    if (!root) return;
    if (!modal) { closeModal(false); return; }
    modal.scrollPositions ||= {};
    if(root.dataset.contentKey) modal.scrollPositions[root.dataset.contentKey]=root.querySelector('.modal-sheet')?.scrollTop || 0;
    const contentKey=modal.picker?'picker':modal.type;
    root.dataset.contentKey=contentKey;
    const [title, content] = modal.picker ? ['设置提醒时间', timePicker()] : modalContent();
    root.innerHTML = modalFrame(title, content);
    document.getElementById('page-region').setAttribute('inert', '');
    document.querySelector('.bottom-nav').setAttribute('inert', '');
    document.querySelector('.fab')?.setAttribute('inert', '');
    document.body.classList.add('modal-open');
    root.querySelector('.modal-sheet').focus({ preventScroll: true });
    root.querySelector('.modal-sheet').scrollTop=modal.scrollPositions[contentKey] || 0;
    if (modal.picker) {
      root.querySelectorAll('[data-wheel]').forEach(wheel => {
        const first = Number(wheel.dataset.first);
        wheel.scrollTop = (Number(modal.picker[wheel.dataset.wheel]) - first) * 44;
      });
    }
    if (modal.errors) paintErrors();
    if (modal.errorLayer) {
      root.querySelector('.sheet-content').setAttribute('inert', '');
      root.querySelector('.modal-header').setAttribute('inert', '');
      root.querySelector('.modal-sheet').insertAdjacentHTML('beforeend', `<div class="form-alert" role="alertdialog" aria-modal="true" aria-labelledby="error-title" aria-describedby="error-description"><h3 id="error-title">还有必填信息未完成</h3><p id="error-description">还有必填信息未完成，请填写标红的框后再核对用药计划。</p>${button('去完善', 'dismiss-errors')}</div>`);
      root.querySelector('[data-action="dismiss-errors"]').focus();
    }
  }

  function targetOptions(action) {
    return `<div class="target-list">${profiles().map(p => button(`<span class="avatar">${esc(p.avatar)}</span><span><strong>${esc(p.name)}</strong><span>${esc(p.relation)}</span></span>${icon('chevron')}`, action, 'target-option', `data-id="${p.id}"`)).join('')}</div>`;
  }

  const targetName = () => data.elderProfiles.find(p => p.id === modal?.targetId)?.name || '';
  const errorBox = () => '<p class="form-error" id="form-error" role="alert"></p>';
  const submit = text => `<button class="button-primary button-wide" type="submit">${text}</button>`;
  function input(name, label, value = '', type = 'text', attrs = '') {
    return `<div class="form-row"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}></div>`;
  }
  function select(name, label, options, value) {
    return `<div class="form-row"><label for="field-${name}">${label}</label><select name="${name}" id="field-${name}">${options.map(option => `<option value="${esc(option)}" ${option === value ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select></div>`;
  }

  function modalContent() {
    const m = modal;
    if (m.type === 'accounts') return ['切换演示账号', accountOptions()];
    if (m.type === 'profiles') return ['查看哪位长辈', targetOptions('select-profile')];
    if (m.type === 'target') return ['为哪位长辈添加', targetOptions('select-target')];
    if (m.type === 'medicine') return ['添加药品打卡计划', medicineForm()];
    if (m.type === 'medicine-confirm') return ['确认用药计划', medicineReview()];
    if (m.type === 'health-form') return ['记录身体数据', healthForm()];
    if (m.type === 'health-confirm') return ['确认测量记录', healthReview()];
    if (m.type === 'onboarding') return ['首次使用引导', onboardingForm()];
    if (m.type === 'clock') return ['演示时间', `<form data-form="clock">${input('dateOffset', '相对 2026-09-13 的天数（0–31）', data.dateOffset, 'number', 'required min="0" max="31" step="1"')}${input('time', '北京时间', data.demoTime, 'time', 'required')}<p class="helper-text">固定基准日，受控跨日。未记录任务到自然时段结束且无延后保护才显示未按时打卡。改变时间不会删除原有记录。</p>${errorBox()}<div class="form-footer">${submit('确认时间')}</div></form>`];
    if (m.type === 'task-detail' || m.type === 'correct-dose') {
      const e = data.doseEvents.find(e => e.id === m.eventId);
      if (!e || !canAccess(e.profileId)) return ['无法查看', '<p>任务不存在或无权访问。</p>'];
      const p = planFor(e);
      const trail = e.changes || [];
      return [m.type === 'correct-dose' ? '更正记录' : '当次任务详情', `<p><strong>${esc(p.name)}</strong> · 计划 ${esc(p.doseValue)} ${esc(p.doseUnit)}</p><p>${e.date} ${e.slot} · 提醒 ${e.scheduledTime} ${mealTag(e)}</p>${badge(e)}${recordDetails(e)}${m.type === 'correct-dose' && account().role === 'elder' ? `<p>选择正确声明后确认更正，保留原记录。</p><div class="dose-actions">${['taken', 'not_taken', 'skipped'].map(status => button(STATUS[status], 'choose-correction', 'button-secondary', `data-id="${e.id}" data-status="${status}"`)).join('')}</div>` : doseActions(e)}${trail.length ? `<details class="audit-trail"><summary>记录变更痕迹（${trail.length}）</summary>${trail.map(c => `<p>${esc(displayTime(c.recordedAt || c.at || c.submittedAt))} · ${esc(c.kind || c.type || '声明')} · ${esc(STATUS[c.before?.status || c.before] || '未记录')} → ${esc(STATUS[c.status || c.after?.status || c.after] || '未记录')} · ${esc(data.accounts.find(a => a.id === (c.recordedBy || c.actorId || c.accountId))?.name || '演示记录')}</p>`).join('')}</details>` : ''}${e.actual ? `<p>本人自述：${esc(typeof e.actual === 'string' ? e.actual : JSON.stringify(e.actual))}</p>` : ''}`];
    }
    if (m.type === 'dose-confirm') {
      const event = data.doseEvents.find(e => e.id === m.eventId);
      return [m.correction ? '确认更正' : '确认本次记录', `<p><strong>${esc(planFor(event).name)}</strong> · ${event.date} ${event.slot} ${event.scheduledTime}</p><p>将记录为：<strong>${STATUS[m.status]}</strong></p><div class="confirm-banner">${icon('info')}仅记录您本次的实际安排，不代表系统建议停药。</div><div class="form-footer">${button('取消', 'close-modal', 'button-secondary')}${button(m.correction ? '确认更正' : '确认记录', 'confirm-dose')}</div>`];
    }
    if (m.type === 'plan-detail') {
      const p = data.medicationPlans.find(p => p.id === m.planId);
      return [esc(p.name), `<dl class="review-list"><dt>所属长辈</dt><dd>${esc(targetName())}</dd><dt>计划单次量</dt><dd>${esc(p.doseValue)} ${esc(p.doseUnit)}</dd><dt>服用时段</dt><dd>${p.slots.map(slot => `${slot} ${p.slotSettings[slot].time} ${esc(p.slotSettings[slot].meal || '')}`).join('<br>')}</dd><dt>开始日期</dt><dd>${p.startDate}</dd><dt>服用周期</dt><dd>${p.endDate ? `截至 ${p.endDate}` : '长期服用'}</dd><dt>来源</dt><dd>${esc(p.source)} · ${esc(author(p))}</dd><dt>备注</dt><dd>${esc(p.note || '无')}</dd><dt>状态</dt><dd>${p.status === 'active' ? '启用中' : '已停用'}</dd></dl><p class="helper-text">编辑或停用仅影响未开始时段，已开始任务保留原快照。</p>${p.status === 'active' ? `<div class="form-footer">${button('编辑计划', 'edit-plan', 'button-secondary')}${button('停用此计划', 'stop-plan', 'button-danger')}</div>` : ''}`];
    }
    if (m.type === 'stop-confirm') return ['停用用药计划？', `<p>${esc(data.medicationPlans.find(p => p.id === m.planId).name)}</p><p>仅取消未开始时段及未来任务；已开始任务保留原药名、剂量和安排，仍可补记。此操作不是医疗停药建议。</p><div class="form-footer">${button('取消', 'close-modal', 'button-secondary')}${button('确认停用计划', 'confirm-stop', 'button-danger')}</div>`];
    if (m.type === 'import') return ['模拟设备导入', `<p>记录对象：<strong>${esc(targetName())}</strong></p><p>将新增 3 条${TYPES[m.healthType].name}演示记录，来源标为“模拟设备导入”。</p><div class="confirm-banner">${icon('info')}预设数据，不连接设备，不用于健康判断。同一档案的同类示例不会重复导入。</div><div class="form-footer">${button('确认模拟导入', 'confirm-import')}</div>`];
    if (m.type === 'family') return ['我的家庭组', `<h3>${esc(family().name)}</h3><p>本地演示邀请码：<strong>${esc(family().inviteCode)}</strong></p><div class="target-list">${profiles().map(p => `<div class="setting-row"><span class="avatar">${esc(p.avatar)}</span><span>${esc(p.name)} · ${esc(account().role === 'elder' ? '本人' : p.relation)}</span></div>`).join('')}</div><div class="confirm-banner">${icon('lock')}本机模拟授权。子女可协助录入，不能代打卡；未接入真实身份验证。</div>`];
    if (m.type === 'notifications') {
      const logs = data.notificationLogs.filter(n => canAccess(n.profileId)).slice().reverse();
      return ['模拟提醒记录', logs.length ? `<div class="record-list">${logs.map(n => `<article class="record-row"><div><strong>${esc(n.text)}</strong><span>${n.sentAt} · 本地模拟，未发送消息</span></div></article>`).join('')}</div>` : '<p>暂无模拟提醒记录</p>'];
    }
    if (m.type === 'about') return ['演示与隐私说明', '<p>本版本仅用于复客松演示，不提供医疗建议，不用于真实用药决策。</p><p>数据保存在此浏览器内，切换本地演示账号可查看同一份家庭记录。跨手机同步、微信登录、推送、设备连接均未接入真实服务。请勿录入真实患者信息或处方。</p><p>本地角色限制用于演示产品分工，不是生产环境的安全访问控制；共享此浏览器的人可以切换账号查看演示数据。</p>'];
    if (m.type === 'reset') return ['恢复初始演示数据？', '<p>将清除本原型中新增的账号、计划、打卡和身体数据，恢复张阿姨和小李的初始样例。其他网站的数据不受影响。</p><div class="form-footer">' + button('取消', 'close-modal', 'button-secondary') + button('确认恢复', 'confirm-reset', 'button-danger') + '</div>'];
    return ['提示', '<p>无法打开此内容。</p>'];
  }

  // 表单保留草稿，只有预览页的确认操作会写入共享数据。
  function newMedicine(targetId) {
    openModal('medicine', { targetId, mode: 'manual', draft: { name: '', doseValue: '', doseUnit: '', slots: [], slotSettings: Object.fromEntries(Object.entries(SLOTS).map(([slot, time]) => [slot, { time, meal: '' }])), startDate: today(), duration: '长期服用', endDate: '', note: '', assisted: account().role === 'child' } });
  }

  function medicineForm() {
    const d = modal.draft;
    return `${targetCaption()}<div class="mode-tabs" role="tablist" aria-label="药物录入方式">${button('手动输入','med-mode','mode-tab is-active','role="tab" aria-selected="true" data-value="manual"')}${button('AI语音输入','med-mode','mode-tab','role="tab" aria-selected="false" data-value="voice" disabled title="第4步接入"')}</div><form data-form="medicine" novalidate>${medicineFields(d)}${errorBox()}<div class="form-footer">${submit('核对用药计划')}</div></form>`;
  }

  const required = label => `${label} <span class="required-star" aria-hidden="true">*</span>`;
  function targetCaption() {
    return `<p class="target-caption">记录对象：<strong>${esc(targetName())}</strong>${account().role==='child'&&!modal.planId?button('改选','change-target','text-button'):''}</p>`;
  }
  function medicineFields(d) {
    return `${input('name',required('药品名称'),d.name,'text','required maxlength="80" autocomplete="off"')}${input('doseValue',required('单次用量（请输入数字）'),d.doseValue,'number','required min="0.000001" step="any" inputmode="decimal"')}${input('doseUnit',required('用量单位'),d.doseUnit,'text','required maxlength="12" list="dose-units"')}<datalist id="dose-units">${['片','粒','包','袋','支','毫升','滴','喷','瓶'].map(u=>`<option value="${u}">`).join('')}</datalist>${slotFields(d)}${input('startDate',required('开始日期'),d.startDate,'date','required')}${select('duration',required('服用周期'),['长期服用','截至某日期'],d.duration)}${d.duration==='截至某日期'?input('endDate',required('结束日期'),d.endDate,'date','required'):''}${input('note','服用备注（选填）',d.note,'text','maxlength="240"')}<label class="consent-row"><input name="assisted" type="checkbox" ${d.assisted?'checked':''}><span>本次由家属协助录入</span></label>`;
  }
  function slotFields(d) {
    return `<fieldset class="slot-fieldset" data-field="slots"><legend>${required('服用时段')}</legend><div class="slot-grid"><div class="slot-head"><span>选择</span><span>时段</span><span>提醒推送</span><span>餐时（选填）</span></div>${Object.entries(SLOTS).map(([slot,time])=>{const selected=d.slots.includes(slot);const setting=d.slotSettings[slot]||{time,meal:''};return `<div class="slot-line ${selected?'is-selected':''}"><label class="slot-checkbox"><input type="checkbox" name="slots" value="${slot}" aria-label="选择${slot}" ${selected?'checked':''}></label><span class="slot-name">${slot}<small>${{早餐:'05:00–11:00',午餐:'11:00–16:00',晚餐:'16:00–20:00',睡前:'20:00–24:00'}[slot]}</small></span><div class="slot-time" data-field="time-${slot}">${button(`${setting.time.slice(0,2)}<span>时</span>`,'time-picker','time-part',`data-slot="${slot}" data-part="hour" aria-label="${slot}提醒小时"`)}${button(`${setting.time.slice(3)}<span>分</span>`,'time-picker','time-part',`data-slot="${slot}" data-part="minute" aria-label="${slot}提醒分钟"`)}<span class="required-star" aria-hidden="true">${selected?'*':''}</span></div><div class="meal-segment" role="group" aria-label="${slot}餐时">${['餐前','餐后'].map(meal=>button(meal,'meal',setting.meal===meal?'is-selected':'',`data-slot="${slot}" data-meal="${meal}" aria-pressed="${setting.meal===meal}" ${selected?'':'disabled'}`)).join('')}</div></div>`;}).join('')}</div><p id="frequency" class="helper-text">每天 ${d.slots.length} 次，各时段单次用量相同</p></fieldset>`;
  }
  function timePicker() {
    const p=modal.picker; const [start,end]=R.RANGES[p.slot];
    const wheel=(field,first,last,label)=>`<div class="wheel-column"><label for="picker-${field}">${label}</label><input id="picker-${field}" name="${field}" type="number" min="${first}" max="${last}" step="1" value="${p[field]}" required aria-label="输入${label}"><div class="wheel-list" data-wheel="${field}" data-first="${first}" role="group" aria-label="${label}滚轮">${Array.from({length:last-first+1},(_,i)=>{const n=i+first;return button(String(n).padStart(2,'0'),'wheel-value',n===p[field]?'is-selected':'',`data-part="${field}" data-number="${n}" aria-label="${n}${label}"`)}).join('')}</div></div>`;
    return `<p>${p.slot}：${String(Math.floor(start/60)).padStart(2,'0')}:00–${String(Math.floor((end-1)/60)).padStart(2,'0')}:59</p><p class="helper-text">上下滑动时、分滚轮；也可直接输入数字。取消保留原时间。</p><form data-form="time-picker"><div class="time-wheels">${wheel('hour',Math.floor(start/60),Math.floor((end-1)/60),'小时')}${wheel('minute',0,59,'分钟')}</div><p class="picker-preview" aria-live="polite">${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}</p>${errorBox()}<div class="form-footer">${button('取消','cancel-picker','button-secondary')}${submit('确认提醒时间')}</div></form>`;
  }

  function paintErrors() {
    app.querySelectorAll('[aria-invalid]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');});
    app.querySelectorAll('.field-invalid').forEach(el=>{el.classList.remove('field-invalid');});
    app.querySelectorAll('.field-error').forEach(el=>{el.remove();});
    for (const [key,message] of Object.entries(modal?.errors || {})) {
      const field=document.getElementById(`field-${key}`) || [...app.querySelectorAll('[data-field]')].find(el=>el.dataset.field===key);
      if (!field) continue;
      const row=field.closest('.form-row') || field;
      field.setAttribute('aria-invalid','true');row.classList.add('field-invalid');
      const note=document.createElement('small'); note.className='field-error';note.id=`error-${key}`;note.textContent=message; row.append(note); field.setAttribute('aria-describedby',note.id);
    }
  }
  function reconcileMedicineErrors() {
    if(!modal?.errors || !modal.draft)return;
    const current=R.planErrors(modal.draft);
    for(const key of Object.keys(modal.errors))if(!current[key])delete modal.errors[key];
  }
  function dismissErrors() {
    modal.errorLayer=false;renderModal();
    const field=app.querySelector('[aria-invalid="true"]');
    const focus=field?.matches('input,select,button')?field:field?.querySelector('input,button');
    focus?.scrollIntoView({block:'center'});focus?.focus({preventScroll:true});
  }

  function collectMedicine(form) {
    const fd = new FormData(form);
    return { ...modal.draft, name: String(fd.get('name') || '').trim(), doseValue: fd.get('doseValue'), doseUnit: String(fd.get('doseUnit') || '').trim(), slots: fd.getAll('slots'), startDate: fd.get('startDate'), duration: fd.get('duration'), endDate: fd.get('endDate') || '', note: String(fd.get('note') || '').trim(), assisted: fd.has('assisted') };
  }

  function medicineReview() {
    const d = modal.draft;
    const applicable = d.slots.filter(slot => minutes(data.demoTime) < { 早餐: 660, 午餐: 960, 晚餐: 1200, 睡前: 1440 }[slot]);
    return `<dl class="review-list"><dt>记录对象</dt><dd>${esc(targetName())}</dd><dt>药品名称</dt><dd>${esc(d.name)}</dd><dt>计划单次量</dt><dd>${esc(d.doseValue)} ${esc(d.doseUnit)}</dd><dt>每天次数</dt><dd>${d.slots.length} 次</dd><dt>服用时段</dt><dd>${d.slots.map(slot => `${slot}（${{早餐:'05:00–11:00',午餐:'11:00–16:00',晚餐:'16:00–20:00',睡前:'20:00–24:00'}[slot]}）<br>提醒 ${d.slotSettings[slot].time} ${esc(d.slotSettings[slot].meal || '')}`).join('<br>')}</dd><dt>录入来源</dt><dd>${esc(d.source || '手动输入')}${d.assisted?' · 家属协助':''}</dd><dt>开始日期</dt><dd>${d.startDate}</dd><dt>服用周期</dt><dd>${d.duration === '长期服用' ? d.duration : `截至 ${d.endDate}`}</dd><dt>备注</dt><dd>${esc(d.note || '无')}</dd></dl><div class="confirm-banner">${icon('shield')}<span>请按已有安排核对。${modal.planId ? '编辑仅影响未开始时段，已开始任务保留原快照。' : d.startDate > today() ? '从所选未来日期生效，不生成今天任务。' : `今天适用：${applicable.join('、') || '无'}；不追造已结束时段。当前时段提醒点已过，保存后可提醒一次。`}</span></div><div class="form-footer">${button(`${icon('back')}返回修改`, 'edit-med', 'button-secondary')}${button(modal.planId ? '确认修改' : '确认创建', 'save-med')}</div>`;
  }

  function healthForm() {
    const d = modal.draft;
    return `${targetCaption()}<form data-form="health">${select('healthType', '数据类型', Object.values(TYPES).map(t => t.name), TYPES[modal.healthType].name)}<div class="kv-list">${TYPES[modal.healthType].fields.map(([key, label, unit], i) => `<div class="form-row"><label for="value-${key}">${label}${modal.healthType === 'blood_pressure' && i < 2 ? '' : '（选填）'}</label><div class="value-input"><input id="value-${key}" name="${key}" type="number" inputmode="decimal" min="0" step="any" value="${esc(d.values[key] ?? '')}" ${modal.healthType === 'blood_pressure' && i < 2 ? 'required' : ''}><span>${unit}</span></div></div>`).join('')}</div>${modal.healthType !== 'blood_pressure' ? `<div id="extra-fields">${d.extras.map((e, i) => `<div class="extra-field">${input(`extraName${i}`, '报告指标名称', e.name, 'text', 'required maxlength="40"')}${input(`extraValue${i}`, '数值', e.value, 'number', 'required min="0" step="any"')}${input(`extraUnit${i}`, '单位（与报告一致）', e.unit, 'text', 'required maxlength="16"')}${button(icon('close'), 'remove-extra', 'close-button', `data-index="${i}" aria-label="移除此指标" title="移除此指标"`)}</div>`).join('')}</div>${button(`${icon('plus')}添加一项指标`, 'add-extra', 'add-kv-button')}` : ''}${input('measuredAt', required('测量时间'), d.measuredAt, 'datetime-local', 'required')}${input('note', '备注（选填）', d.note, 'text', 'maxlength="240"')}<label class="consent-row"><input name="assisted" type="checkbox" ${d.assisted?'checked':''}><span>本次由家属协助录入</span></label>${errorBox()}<div class="form-footer">${submit('核对测量记录')}</div></form>`;
  }

  function newHealth(targetId, type=view.healthType) {
    openModal('health-form',{targetId,healthType:type,draft:{values:{},extras:[],measuredAt:`${today()}T${data.demoTime}`,note:'',assisted:account().role==='child'}});
  }
  function updatePicker() {
    const p=modal?.picker;if(!p)return;
    for(const part of ['hour','minute']) {
      const input=app.querySelector(`#picker-${part}`);if(input)input.value=p[part];
      app.querySelectorAll(`[data-part="${part}"][data-number]`).forEach(b=>{b.classList.toggle('is-selected',Number(b.dataset.number)===p[part]);});
    }
    const preview=app.querySelector('.picker-preview');if(preview)preview.textContent=`${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;
  }
  for(const type of ['wheel','pointerdown','touchstart'])app.addEventListener(type,event=>{
    const wheel=event.target.closest?.('[data-wheel]');if(wheel)wheel.dataset.userScrolling='true';
  },{passive:true});
  app.addEventListener('scroll',event=>{
    const wheel=event.target;if(!modal?.picker || !wheel.dataset?.wheel || wheel.dataset.userScrolling!=='true')return;
    const part=wheel.dataset.wheel;modal.picker[part]=Number(wheel.dataset.first)+Math.round(wheel.scrollTop/44);updatePicker();
  },true);
  app.addEventListener('input',event=>{
    const field=event.target;
    if(modal?.picker && ['hour','minute'].includes(field.name)) {
      modal.picker[field.name]=Number(field.value);
      const wheel=app.querySelector(`[data-wheel="${field.name}"]`);wheel.dataset.userScrolling='false';
      if(field.validity.valid)wheel.scrollTop=(Number(field.value)-Number(wheel.dataset.first))*44;
      return;
    }
    if(modal?.type==='medicine' && field.closest('[data-form="medicine"]')) {
      modal.draft=collectMedicine(field.closest('form'));
      if(modal.errors) { reconcileMedicineErrors();paintErrors(); }
    }
    if(modal?.type==='health-form' && field.closest('[data-form="health"]') && field.name!=='healthType') modal.draft=collectHealth(field.closest('form'));
  });

  function collectHealth(form) {
    const fd = new FormData(form);
    const values = {};
    TYPES[modal.healthType].fields.forEach(([key]) => { if (fd.get(key) !== '') values[key] = fd.get(key); });
    return { values, measuredAt: fd.get('measuredAt'), note: String(fd.get('note') || '').trim(), assisted: fd.has('assisted'), extras: modal.draft.extras.map((_, i) => ({ name: String(fd.get(`extraName${i}`) || '').trim(), value: fd.get(`extraValue${i}`), unit: String(fd.get(`extraUnit${i}`) || '').trim() })) };
  }

  function healthReview() {
    const d = modal.draft;
    return `<dl class="review-list"><dt>记录对象</dt><dd>${esc(targetName())}</dd><dt>数据类型</dt><dd>${TYPES[modal.healthType].name}</dd>${TYPES[modal.healthType].fields.filter(([key]) => d.values[key] != null).map(([key, label, unit]) => `<dt>${label}</dt><dd>${esc(d.values[key])} ${unit}</dd>`).join('')}${d.extras.map(e => `<dt>${esc(e.name)}</dt><dd>${esc(e.value)} ${esc(e.unit)}</dd>`).join('')}<dt>测量时间</dt><dd>${esc(d.measuredAt.replace('T', ' '))}</dd><dt>备注</dt><dd>${esc(d.note || '无')}</dd><dt>来源</dt><dd>${esc(d.source || '手动输入')}${d.assisted?' · 家属协助':''}</dd></dl>${modal.healthType==='body'?bmiLabel({type:'body',profileId:modal.targetId,values:d.values,measuredAt:d.measuredAt.replace('T',' ')}):''}<div class="form-footer">${button(`${icon('back')}返回修改`, 'edit-health', 'button-secondary')}${button('确认保存', 'save-health')}</div>`;
  }

  function onboardingForm() {
    const d = modal.draft;
    const steps = ['模拟登录', '基础资料', '显示字号', '家庭绑定', '确认共享'];
    let fields = '';
    if (modal.step === 0) fields = `<p>新建一个本地演示账号。</p>${button('模拟微信登录', 'onboard-login', 'wechat-login')}<p class="demo-login-note">不连接微信，不收集手机号。</p>`;
    if (modal.step === 1) fields = `${input('name', '显示名', d.name, 'text', 'required maxlength="24"')}${input('age', '当前年龄', d.age, 'number', 'required min="1" max="120" step="1"')}${select('role', '我的身份', ['我是长辈', '我是子女'], d.role === 'elder' ? '我是长辈' : '我是子女')}`;
    if (modal.step === 2) fields = `<fieldset class="slot-fieldset"><legend>字号模式</legend>${[['normal', '标准字号'], ['elder', '适老大字号']].map(([key, label]) => `<label class="choice-card ${d.fontMode === key ? 'is-selected' : ''}"><input name="fontMode" type="radio" value="${key}" ${d.fontMode === key ? 'checked' : ''}><span class="font-preview-${key}">${label}</span></label>`).join('')}</fieldset>`;
    if (modal.step === 3) fields = `${select('familyMode', '家庭组', ['加入演示家庭组', '创建我的家庭组'], d.familyMode)}${d.familyMode === '加入演示家庭组' ? `${input('inviteCode', '演示邀请码', d.inviteCode, 'text', 'required maxlength="32"')}<p class="helper-text">初始家庭的邀请码：SILVER2026</p>${d.role === 'child' ? select('joinProfileId', '绑定长辈', data.elderProfiles.filter(p => p.familyId === 'family-silver-2026').map(p => p.name), d.joinProfileName) : ''}` : input('familyName', '家庭组名称', d.familyName, 'text', 'required maxlength="40"')}${d.role === 'child' && d.familyMode === '创建我的家庭组' ? input('profileName', '长辈显示名', d.profileName, 'text', 'required maxlength="24"') : ''}${d.role === 'child' ? select('relation', '长辈与我的关系', ['父亲', '母亲', '祖父母/外祖父母', '配偶', '其他'], d.relation) : `<p class="helper-text">将为${esc(d.name)}建立独立的本人健康档案。</p>`}`;
    if (modal.step === 4) fields = `<dl class="review-list"><dt>显示名</dt><dd>${esc(d.name)}</dd><dt>年龄</dt><dd>${esc(d.age)} 岁</dd><dt>身份</dt><dd>${d.role === 'elder' ? '长辈' : '子女'}</dd><dt>字号</dt><dd>${d.fontMode === 'elder' ? '适老大字号' : '标准字号'}</dd><dt>家庭组</dt><dd>${esc(d.familyMode === '创建我的家庭组' ? d.familyName : '张阿姨的健康小家')}</dd><dt>健康档案</dt><dd>${esc(d.role === 'elder' ? d.name : d.familyMode === '创建我的家庭组' ? d.profileName : d.joinProfileName)}</dd></dl><label class="consent-row"><input name="consent" type="checkbox" required><span>我知悉这是本地演示，并确认模拟家庭授权：绑定的子女可以查看、协助录入，但不能代替长辈打卡。</span></label>`;
    return `<div class="step-indicator" aria-label="第 ${modal.step + 1} 步，共 5 步">${steps.map((_, i) => `<span class="step-dot ${i <= modal.step ? 'is-active' : ''}"></span>`).join('')}</div><h3>${steps[modal.step]}</h3><form data-form="onboarding">${fields}${errorBox()}${modal.step > 0 ? `<div class="form-footer">${button(`${icon('back')}上一步`, 'onboard-back', 'button-secondary')}${submit(modal.step === 4 ? '确认并进入' : '下一步')}</div>` : ''}</form>`;
  }

  function formError(message) {
    const el = document.getElementById('form-error');
    if (el) { el.textContent = message; el.scrollIntoView({ block: 'nearest' }); }
  }

  function recordDose(eventId, status, options = {}) {
    let operation;
    if (!commit(next => { operation = R.recordDose(next, view.accountId, eventId, status, options); })) return false;
    clearTimeout(undoTimer);
    undo = { ...operation, accountId: view.accountId, expires: Date.now() + 5000 };
    undoTimer = setTimeout(() => { undo = null; }, 5000);
    closeModal(false);
    render();
    toast(`已记录为“${STATUS[status]}”。`, 'success', true);
    return true;
  }

  function saveOnboarding() {
    const d = modal.draft;
    const accountId = id('account');
    if (!commit(next => {
      let familyId = 'family-silver-2026';
      if (d.familyMode === '创建我的家庭组') {
        familyId = id('family');
        next.families.push({ id: familyId, name: d.familyName, inviteCode: id('LOCAL').toUpperCase() });
      }
      let profileId;
      if (d.role === 'child' && d.familyMode === '加入演示家庭组') {
        profileId = next.elderProfiles.find(p => p.familyId === familyId && p.name === d.joinProfileName).id;
      } else {
        profileId = id('profile');
        const name = d.role === 'elder' ? d.name : d.profileName;
        next.elderProfiles.push({ id: profileId, familyId, name, avatar: name.slice(0, 1), relation: d.role === 'elder' ? '本人' : d.relation, age: d.role === 'elder' ? Number(d.age) : null, tag: '本地演示档案' });
      }
      next.accounts.push({ id: accountId, name: d.name, age: Number(d.age), avatar: d.name.slice(0, 1), familyId, role: d.role, fontMode: d.fontMode, ...(d.role === 'elder' ? { profileId } : { selectedProfileId: profileId, boundProfileIds: [profileId], relation: d.relation }) });
    })) return;
    view.accountId = accountId;
    navigate('home');
    toast('本地演示账号已建立。');
  }

  app.addEventListener('submit', event => {
    const form = event.target;
    if (!form.dataset.form) return;
    event.preventDefault();
    if (form.dataset.form !== 'medicine' && !form.reportValidity()) return;
    const fd = new FormData(form);
    if (form.dataset.form === 'time-picker' && modal?.picker) {
      const hour=Number(fd.get('hour')),minute=Number(fd.get('minute'));
      const time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
      const [start,end]=R.RANGES[modal.picker.slot];
      if (!Number.isInteger(hour)||!Number.isInteger(minute)||!R.validTime(time)||R.minute(time)<start||R.minute(time)>=end) return formError('提醒时间必须在当前自然时段内。');
      modal.draft.slotSettings[modal.picker.slot].time=time;modal.picker=null;reconcileMedicineErrors();renderModal();return;
    }
    if (form.dataset.form === 'clock') {
      const time = fd.get('time');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return formError('请输入有效时间。');
      if (!commit(next => { R.setClock(next, Number(fd.get('dateOffset')), time); })) return;
      closeModal(false); render(); return;
    }
    if (form.dataset.form === 'medicine') {
      const draft = collectMedicine(form);
      modal.draft = draft;
      modal.errors=R.planErrors(draft);
      if (Object.keys(modal.errors).length) { modal.errorLayer=true;renderModal();return; }
      modal.type = 'medicine-confirm'; renderModal(); return;
    }
    if (form.dataset.form === 'health') {
      const draft = collectHealth(form);
      if (!Object.keys(draft.values).length && !draft.extras.length) return formError('请至少填写一项测量值。');
      if ([...Object.values(draft.values), ...draft.extras.map(e => e.value)].some(v => v === '' || !Number.isFinite(Number(v)) || Number(v) < 0)) return formError('测量值必须是非负数字。');
      if (modal.healthType==='body' && ['height','weight'].some(k=>draft.values[k]!=null && !(Number(draft.values[k])>0))) return formError('身高和体重必须大于 0，并按标注单位填写。');
      if (modal.healthType === 'blood_pressure' && !(Number(draft.values.systolic) > Number(draft.values.diastolic))) return formError('请核对：收缩压需要大于舒张压。');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.measuredAt) || draft.measuredAt > `${today()}T${data.demoTime}`) return formError('测量时间不能晚于当前演示时间。');
      if (draft.extras.some(e => !e.name || !e.unit)) return formError('请填写附加指标的名称和单位。');
      const names = [...TYPES[modal.healthType].fields.map(([, label]) => label), ...draft.extras.map(e => e.name)];
      if (new Set(names).size !== names.length) return formError('指标名称不能重复。');
      modal.draft = draft; modal.type = 'health-confirm'; renderModal(); return;
    }
    if (form.dataset.form === 'onboarding') {
      const d = modal.draft;
      if (modal.step === 1) {
        d.name = String(fd.get('name') || '').trim(); d.age = fd.get('age'); d.role = fd.get('role') === '我是长辈' ? 'elder' : 'child';
        if (!d.name || !Number.isInteger(Number(d.age)) || Number(d.age) < 1 || Number(d.age) > 120) return formError('请填写显示名和 1–120 岁的整数年龄。');
      }
      if (modal.step === 2) d.fontMode = fd.get('fontMode');
      if (modal.step === 3) {
        d.familyMode = fd.get('familyMode'); d.inviteCode = String(fd.get('inviteCode') || '').trim().toUpperCase(); d.familyName = String(fd.get('familyName') || '').trim(); d.profileName = String(fd.get('profileName') || '').trim(); d.relation = fd.get('relation') || '本人'; d.joinProfileName = fd.get('joinProfileId') || '张阿姨';
        if (d.familyMode === '加入演示家庭组' && d.inviteCode !== 'SILVER2026') return formError('演示邀请码不正确。请使用 SILVER2026。');
        if (d.familyMode === '创建我的家庭组' && (!d.familyName || (d.role === 'child' && !d.profileName))) return formError('请填写家庭组与长辈显示名。');
      }
      if (modal.step === 4) { if (fd.get('consent')) saveOnboarding(); return; }
      modal.step += 1; renderModal();
    }
  });

  app.addEventListener('change', event => {
    const field = event.target;
    if (field.id === 'history-date' && field.value) { view.historyDate = field.value; render(); return; }
    if (!modal) return;
    if (modal.picker) return;
    if (modal.type === 'medicine' && field.closest('form')) {
      modal.draft = collectMedicine(field.closest('form'));
      reconcileMedicineErrors();paintErrors();
      if (field.name === 'slots') {
        const slot=field.value;renderModal();app.querySelector(`[name="slots"][value="${slot}"]`)?.focus({preventScroll:true});
      }
      if (field.name === 'duration') renderModal();
    }
    if (modal.type === 'health-form' && field.name === 'healthType') {
      modal.healthType = Object.keys(TYPES).find(key => TYPES[key].name === field.value);
      modal.draft = { values: {}, extras: [], measuredAt: `${today()}T${data.demoTime}`, note: '' }; renderModal();
    }
    if (modal.type === 'onboarding' && field.name === 'familyMode') { modal.draft.familyMode = field.value; renderModal(); }
  });

  app.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const value = target.dataset.value;
    const itemId = target.dataset.id;
    if (action === 'navigate') return navigate(target.dataset.page);
    if (action === 'history' || action==='calendar-date') { view.historyDate=target.dataset.date||today();view.planTab='history';return navigate('plans'); }
    if (action === 'summary-health' && TYPES[value]) { view.healthType=value;return navigate('health'); }
    if (action === 'dismiss-errors') return dismissErrors();
    if (action === 'cancel-picker' && modal?.picker) { modal.picker=null;renderModal();return; }
    if (action === 'wheel-value' && modal?.picker) {
      const part=target.dataset.part;modal.picker[part]=Number(target.dataset.number);
      const wheel=app.querySelector(`[data-wheel="${part}"]`);wheel.scrollTop=(modal.picker[part]-Number(wheel.dataset.first))*44;updatePicker();return;
    }
    if (action === 'time-picker' && modal?.draft?.slotSettings) {
      const setting=modal.draft.slotSettings[target.dataset.slot];modal.picker={slot:target.dataset.slot,hour:Number(setting.time.slice(0,2)),minute:Number(setting.time.slice(3))};renderModal();app.querySelector(`#picker-${target.dataset.part}`)?.focus({preventScroll:true});return;
    }
    if (action === 'meal' && modal?.draft?.slots.includes(target.dataset.slot)) {
      const setting=modal.draft.slotSettings[target.dataset.slot];setting.meal=setting.meal===target.dataset.meal?'':target.dataset.meal;reconcileMedicineErrors();renderModal();return;
    }
    if (action === 'close-modal') return closeModal();
    if (['accounts', 'clock', 'family', 'about', 'notifications', 'reset'].includes(action)) return openModal(action);
    if (action === 'profiles' && account().role === 'child') return openModal('profiles');
    if (action === 'switch-account' && data.accounts.some(a => a.id === itemId)) { view.accountId = itemId; undo = null; overdueOpen = false; return navigate('home'); }
    if (action === 'select-profile' && account().role === 'child' && canAccess(itemId)) { commit(next => { next.accounts.find(a => a.id === view.accountId).selectedProfileId = itemId; }); closeModal(false); render(); return; }
    if (action === 'overdue') { overdueOpen = !overdueOpen; render(); return; }
    if (action === 'font' && ['normal', 'elder'].includes(value)) { commit(next => { next.accounts.find(a => a.id === view.accountId).fontMode = value; }); render(); return; }
    if (action === 'plan-tab' && ['active', 'inactive', 'history'].includes(value)) { view.planTab = value; render(); return; }
    if (action === 'health-tab' && TYPES[value]) { view.healthType = value; render(); return; }
    if (['quick-add','home-add-med','home-add-health'].includes(action)) {
      const pid=profile()?.id;if(!canAccess(pid))return toast('请先绑定长辈档案。','warning');
      const kind=action==='home-add-med'?'medicine':action==='home-add-health'?'health':view.page==='plans'?'medicine':'health';
      return kind==='medicine'?newMedicine(pid):newHealth(pid);
    }
    if (action==='change-target' && account().role==='child') return openModal('target',{returnModal:clone(modal)});
    if (action==='select-target' && canAccess(itemId) && modal?.returnModal) { const previous=modal.returnModal;openModal(previous.type,{...previous,targetId:itemId});return; }
    if (action === 'med-mode' && modal?.type === 'medicine' && value==='manual') { modal.mode = value; renderModal(); return; }
    if (action === 'edit-med' && modal?.type === 'medicine-confirm') { modal.type = 'medicine'; renderModal(); return; }
    if (action === 'save-med' && modal?.type === 'medicine-confirm' && canAccess(modal.targetId)) {
      const d = modal.draft; const pid = modal.targetId;
      const editing = modal.planId;
      if (commit(next => { R.savePlan(next, view.accountId, { ...d, source: d.assisted ? '手动输入 · 家属协助' : '手动输入' }, pid, editing); })) { view.planTab = 'active'; selectTargetForChild(pid); navigate('plans'); toast(editing ? '未来计划已更新，已开始任务保留。' : '用药计划已创建。'); } return;
    }
    if (action === 'edit-health' && modal?.type === 'health-confirm') { modal.type = 'health-form'; renderModal(); return; }
    if (action === 'save-health' && modal?.type === 'health-confirm' && canAccess(modal.targetId)) {
      const d = modal.draft; const pid = modal.targetId; const type = modal.healthType;
      if (commit(next => next.healthRecords.push({ id: id('health'), profileId: pid, type, values: Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, Number(v)])), extras: d.extras.map(e => ({ ...e, value: Number(e.value) })), measuredAt: d.measuredAt.replace('T', ' '), note: d.note, source: d.assisted ? '手动输入 · 家属协助' : '手动输入', assisted: d.assisted, createdBy: view.accountId, createdAt: new Date().toISOString() }))) { view.healthType = type; selectTargetForChild(pid); navigate('health'); toast('测量记录已保存。'); } return;
    }
    if (['add-extra', 'remove-extra'].includes(action) && modal?.type === 'health-form') {
      modal.draft = collectHealth(document.querySelector('[data-form="health"]'));
      if (action === 'add-extra' && modal.draft.extras.length < 8) modal.draft.extras.push({ name: '', value: '', unit: '' });
      if (action === 'remove-extra') modal.draft.extras.splice(Number(target.dataset.index), 1);
      renderModal(); return;
    }
    if (action === 'take') return recordDose(itemId, 'taken');
    if (action === 'declare' && target.dataset.status === 'not_taken') return recordDose(itemId, 'not_taken');
    if (['task-detail', 'correct-dose'].includes(action)) {
      const e = data.doseEvents.find(e => e.id === itemId);
      if (e && canAccess(e.profileId) && (action !== 'correct-dose' || account().role === 'elder')) openModal(action, { eventId: itemId });
      return;
    }
    if (action === 'choose-correction' && modal?.type === 'correct-dose' && account().role === 'elder') return openModal('dose-confirm', { eventId: modal.eventId, status: target.dataset.status, correction: true });
    if (action === 'snooze') {
      if (commit(next => { R.snooze(next, view.accountId, itemId, Number(target.dataset.minutes)); })) { closeModal(false); render(); toast('已设置稍后提醒，原任务与服药事实不变。'); }
      return;
    }
    if (action === 'dose-confirm') {
      const e = data.doseEvents.find(e => e.id === itemId);
      if (e && R.canDeclare(data, view.accountId, e) && !resolved(e) && target.dataset.status === 'skipped') openModal('dose-confirm', { eventId: itemId, status: 'skipped' });
      return;
    }
    if (action === 'confirm-dose' && modal?.type === 'dose-confirm') return recordDose(modal.eventId, modal.status, { correction: !!modal.correction });
    if (action === 'undo' && undo && Date.now() <= undo.expires && undo.accountId === view.accountId) {
      const saved = undo;
      if (commit(next => { R.undoDose(next, view.accountId, saved); })) { undo = null; render(); toast('本次打卡已撤销，延后次数和提醒冷却不变。'); } return;
    }
    if (action === 'remind' && account().role === 'child') {
      const e = data.doseEvents.find(e => e.id === itemId);
      const reason = R.reminderReason(data, view.accountId, e);
      if (reason) { toast(reason, 'warning'); return; }
      commit(next => { next.doseEvents.find(x => x.id === e.id).n3LastAt = now(); next.notificationLogs.push({ id: id('notice'), profileId: e.profileId, eventId: e.id, sentAt: now(), createdBy: view.accountId, text: `模拟提醒${profile().name}核对${e.date} ${e.slot} ${planFor(e).name}的用药记录` }); }); render(); toast('已生成模拟提醒，未发送真实消息。'); return;
    }
    if (action === 'plan-detail') { const p = data.medicationPlans.find(p => p.id === itemId); if (p && canAccess(p.profileId)) openModal('plan-detail', { planId: itemId, targetId: p.profileId }); return; }
    if (action === 'edit-plan' && modal?.type === 'plan-detail' && canAccess(modal.targetId)) {
      const p = data.medicationPlans.find(p => p.id === modal.planId);
      openModal('medicine', { targetId: p.profileId, planId: p.id, mode: 'manual', draft: { ...clone(p), endDate: p.endDate || '', customUnit: '' } }); return;
    }
    if (action === 'stop-plan' && modal?.type === 'plan-detail') { modal.type = 'stop-confirm'; renderModal(); return; }
    if (action === 'confirm-stop' && modal?.type === 'stop-confirm' && canAccess(modal.targetId)) { const planId = modal.planId; if (commit(next => { R.stopPlan(next, view.accountId, planId); })) { closeModal(false); render(); toast('计划已停用，已开始任务和历史记录仍保留。'); } return; }
    if (action === 'import' && profile()) return openModal('import', { targetId: profile().id, healthType: view.healthType });
    if (action === 'confirm-import' && modal?.type === 'import' && canAccess(modal.targetId)) {
      const pid = modal.targetId; const type = modal.healthType;
      let added = 0;
      commit(next => {
        for (let i = 0; i < 3; i++) {
          const key = `device-demo-${pid}-${type}-${i}`;
          if (next.healthRecords.some(r => r.id === key)) continue;
          next.healthRecords.push({ id: key, profileId: pid, type, measuredAt: `2026-09-${10 + i} 08:30`, source: '模拟设备导入', values: type === 'blood_pressure' ? { systolic: 134 - i * 2, diastolic: 84 - i, pulse: 70 + i } : type === 'blood_lipid' ? { tc: 4.2, tg: 1.1, hdl: 1.3, ldl: 2.1 } : { height: 158, weight: 56.2, fat: 31.4 }, note: '预设演示记录，无实际设备连接', createdBy: view.accountId }); added++;
        }
      }); closeModal(false); render(); toast(added ? `已导入 ${added} 条模拟记录。` : '此类示例已导入，未重复添加。'); return;
    }
    if (action === 'onboarding') return openModal('onboarding', { step: 0, draft: { name: '', age: '', role: 'elder', fontMode: 'elder', familyMode: '加入演示家庭组', inviteCode: '', familyName: '', profileName: '', joinProfileName: '张阿姨', relation: '母亲' } });
    if (action === 'onboard-login' && modal?.type === 'onboarding') { modal.step = 1; renderModal(); return; }
    if (action === 'onboard-back' && modal?.type === 'onboarding') {
      const fd = new FormData(document.querySelector('[data-form="onboarding"]'));
      if (modal.step === 1) { modal.draft.name = fd.get('name'); modal.draft.age = fd.get('age'); modal.draft.role = fd.get('role') === '我是子女' ? 'child' : 'elder'; }
      if (modal.step === 2) modal.draft.fontMode = fd.get('fontMode');
      if (modal.step === 3) { for (const key of ['familyMode', 'inviteCode', 'familyName', 'profileName', 'relation']) if (fd.has(key)) modal.draft[key] = fd.get(key); modal.draft.joinProfileName = fd.get('joinProfileId') || modal.draft.joinProfileName; }
      modal.step = Math.max(0, modal.step - 1); renderModal(); return;
    }
    if (action === 'confirm-reset' && modal?.type === 'reset') {
      try { localStorage.removeItem(DATA_KEY); invalidStorage = false; storageWarning = ''; } catch { storageWarning = '无法清除浏览器存档，本次仅恢复临时演示数据。'; }
      data = seed(); view = { accountId: 'elder-zhang', page: 'home', healthType: 'blood_pressure', planTab: 'active', historyDate: DAY }; undo = null; overdueOpen = false; navigate('home'); toast('已恢复初始演示数据。');
    }
  });

  function selectTargetForChild(pid) {
    if (account().role === 'child') commit(next => { next.accounts.find(a => a.id === view.accountId).selectedProfileId = pid; });
  }

  document.addEventListener('keydown', event => {
    if (!modal) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...document.querySelectorAll('.modal-sheet button:not([disabled]), .modal-sheet input:not([disabled]), .modal-sheet select, .modal-sheet textarea')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('modal-sheet'))) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });

  window.addEventListener('storage', event => {
    if (event.key !== DATA_KEY) return;
    // 打开的表单先关闭，避免另一窗口更新后误保存过时草稿。账号仍保持本窗口选择。
    data = load();
    if (!data.accounts.some(a => a.id === view.accountId)) view.accountId = data.accounts[0].id;
    undo = null;
    closeModal(false);
    render();
    toast('本地演示数据已更新。');
  });

  render();
})();
