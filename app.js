/* 药安心：同一浏览器内的家庭协同演示，不连接任何医疗或推送服务。 */
(() => {
  'use strict';

  const DATA_KEY = 'silver-health-data-v1';
  const VIEW_KEY = 'silver-health-view-v1';
  const DAY = '2026-09-13';
  const R = window.MedRules;
  const Bridge = window.DemoBridge;
  const C = window.Conversation;
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
  try { const savedView=JSON.parse(sessionStorage.getItem(VIEW_KEY)||'{}');if(typeof savedView.accountId==='string')view.accountId=savedView.accountId;if(typeof savedView.healthType==='string')view.healthType=savedView.healthType; } catch { /* 无存储权限时继续使用内存。 */ }
  if (!data.accounts.some(a => a.id === view.accountId)) view.accountId = data.accounts[0].id;
  if (!TYPES[view.healthType]) view.healthType = 'blood_pressure';
  // 整页载入只恢复合法身份与显示偏好，不恢复旧页面或工作弹窗。
  Object.assign(view, { page: 'home', planTab: 'active', historyDate: R.day(data) });
  let modal = null;
  let modalReturnFocus = null;
  let undo = null;
  let undoTimer;
  let toastTimer;
  let overdueOpen = false;
  let stageVisible = !Bridge.embedded;
  let themeReady = !Bridge.embedded;
  let visitId = id('visit');
  const dismissedFocus = new Set();
  const shownBanners = new Set();
  const drafts = new Map();
  const sessionViews = new Map();
  const conversations = new Map();
  let focusScheduled = false;

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
    try { change(next); R.evaluateNotifications(next); } catch (error) { toast(error.message || '操作未保存，请检查输入。', 'warning'); return false; }
    if (!validData(next)) { toast('数据校验失败，未保存任何修改。', 'warning'); return false; }
    data = next;
    if (!invalidStorage) {
      try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); storageWarning = ''; }
      catch { storageWarning = '本地保存失败，本次操作仅在当前页面有效；刷新后可能丢失。'; }
    }
    queueMicrotask(()=>{publishState();scheduleFocus();});
    return true;
  }

  const sessionKey = () => `${view.accountId}|${profile()?.id || ''}`;
  const workModal = m => m && ['medicine','medicine-confirm','health-form','health-confirm','chat'].includes(m.type);
  function preserveDraft() {
    syncChatDraft();
    sessionViews.set(sessionKey(),{view:clone(view),scroll:app.querySelector('.app-main')?.scrollTop||0});
    if(workModal(modal)) {
      modal.scrollPositions ||= {};modal.scrollPositions[modal.picker?'picker':modal.type]=app.querySelector('.modal-sheet')?.scrollTop||0;
      drafts.set(sessionKey(),{modal:clone(modal),view:clone(view)});
    }
  }
  function clearSavedDraft() { drafts.delete(sessionKey()); }
  function resumeDraft() {
    const saved=drafts.get(sessionKey());
    if(!saved || !canAccess(saved.modal.targetId))return toast('没有可继续的输入。','warning');
    view={...saved.view,accountId:view.accountId};modal=clone(saved.modal);hydrateChatDraft();render();
  }
  function enterAccountHome(accountId,{preserveUndo=false}={}) {
    const nextAccount=data.accounts.find(a=>a.id===accountId);
    if(!nextAccount)throw Error('演示账号不存在');
    if(!preserveUndo)clearTimeout(undoTimer);
    view={...view,accountId,page:'home',planTab:'active',historyDate:today()};
    modal=null;modalReturnFocus=null;if(!preserveUndo)undo=null;overdueOpen=false;
  }
  function focusHome() {
    const main=app.querySelector('.app-main');if(main)main.scrollTop=0;
    window.scrollTo(0,0);const heading=app.querySelector('h1');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  }
  function switchAccount(accountId) {
    document.querySelectorAll('.modal-exit-copy').forEach(el=>{el.remove();});
    preserveDraft();closeModal(false);enterAccountHome(accountId);
    render();focusHome();scheduleFocus();publishState();
  }
  function switchProfile(profileId,restore=true) {
    if(account().role!=='child'||!canAccess(profileId))throw Error('无权选择此档案');
    document.querySelectorAll('.modal-exit-copy').forEach(el=>{el.remove();});
    preserveDraft();
    if(!commit(next=>{next.accounts.find(a=>a.id===view.accountId).selectedProfileId=profileId;}))return;
    closeModal(false);view.page='home';overdueOpen=false;render();if(restore&&drafts.has(sessionKey()))resumeDraft();
  }

  const emptyPlan = () => ({name:'',doseValue:'',doseUnit:'',slots:[],slotSettings:Object.fromEntries(Object.entries(SLOTS).map(([slot,time])=>[slot,{time,reminderTime:time,missedAlertTime:R.MISSED_ALERTS[slot],meal:''}])),startDate:today(),duration:'长期服用',endDate:'',note:'',assisted:account().role==='child'});
  const emptyHealth = () => ({values:{},extras:[],measuredAt:`${today()}T${data.demoTime}`,note:'',assisted:account().role==='child'});
  const withSource=(...sources)=>[...new Set(sources.filter(Boolean).flatMap(s=>s.split('、')))].join('、');
  const fieldLabel=key=>({name:'药品名称',doseValue:'单次用量',doseUnit:'用量单位',slots:'服用时段',startDate:'开始日期',duration:'服用周期',endDate:'结束日期',note:'备注',assisted:'家属协助'}[key]||key.replace('time-','提醒：').replace('meal-','餐时：'));
  function chatSession(key=modal?.chatKey) {
    const c=conversations.get(key);
    return c&&c.accountId===view.accountId&&canAccess(c.targetId)?c:null;
  }
  function chatMessage(c,text,role='assistant',source='') {c.messages.push({id:id('message'),role,text,source});if(role==='assistant')c.scrollToLatest=true;}
  function syncChatDraft() {
    const c=chatSession();if(!c||!modal.draft)return;
    if(['medicine','medicine-confirm'].includes(modal.type))c.plan=modal.draft;
    if(['health-form','health-confirm'].includes(modal.type)){c.health=modal.draft;c.healthType=modal.healthType;}
  }
  function hydrateChatDraft() {
    const c=chatSession();if(!c)return;
    if(['medicine','medicine-confirm'].includes(modal.type)){modal.draft=c.plan;modal.planId=c.planId;}
    if(['health-form','health-confirm'].includes(modal.type)){modal.draft=c.health;modal.healthType=c.healthType;}
  }
  function openChat(entry='home',mode='text') {
    const targetId=modal?.targetId||profile()?.id;if(!targetId||!canAccess(targetId))return toast('请先选择已绑定的长辈。','warning');
    const key=`${view.accountId}|${targetId}`,previous=modal;
    let c=chatSession(key);
    if(!c){c={key,id:id('chat'),accountId:view.accountId,targetId,date:today(),entry,mode,intent:entry==='plan'?'plan':'home',messages:[],input:'',inputSource:'文字输入',plan:emptyPlan(),health:emptyHealth(),healthType:'blood_pressure',sources:{},cards:[],selectedId:null,status:'等待输入',example:'',preview:null,planIssues:{},pendingSlots:null,expectedTimes:null};conversations.set(key,c);
      chatMessage(c,entry==='plan'?'我来帮您整理用药计划。请先告诉我药品名称、每次用量和单位；也可以一起说时段和提醒时间，或直接点配置卡。':account().role==='elder'?`${account().name}，您好。您可以记录是否吃过药、添加药品、记录身体数据，也可以查询今天的用药安排。`:`${account().name}，您好。当前查看${data.elderProfiles.find(p=>p.id===targetId).name}。您可以查询、协助添加计划和身体数据，或对合格任务提醒 TA。`);
    }
    c.planIssues||={};
    if(entry==='plan'){if(previous?.draft&&previous.type==='medicine'&&(previous.chatKey===key||previous.planId||!hasPlanInput(c.plan)||hasPlanInput(previous.draft))){if(c.planId!==previous.planId){c.planIssues={};c.pendingSlots=null;c.expectedTimes=null;c.sources={};}c.plan=previous.draft;c.planId=previous.planId;}if(c.intent!=='plan'){chatMessage(c,'继续整理用药计划，已经填写的内容保留。');c.intent='plan';}}
    c.mode=mode;openModal('chat',{targetId,chatKey:key,planId:c.planId});
  }
  function returnChat(key) {
    syncChatDraft();const c=chatSession(key);if(!c)return toast('当前账号无权继续该会话。','warning');
    openModal('chat',{targetId:c.targetId,chatKey:key,planId:c.planId});
  }
  function chatPlanProblems(c) {
    const errors=R.planErrors(c.plan);
    Object.entries(c.planIssues||{}).forEach(([kind,message])=>{errors[`issue-${kind}`]=message;});
    if(c.pendingSlots)errors.slots='请明确确认“早晚”对应的时段。';
    if(c.expectedTimes&&c.expectedTimes!==c.plan.slots.length)errors.slots=`您说每天${c.expectedTimes}次，当前选择${c.plan.slots.length}个时段，请澄清。`;
    return errors;
  }
  function chatPlanQuestion(c) {
    const errors=chatPlanProblems(c),schedule=c.plan.slots.map(slot=>`${slot} ${c.plan.slotSettings[slot].time}${c.plan.slotSettings[slot].meal?` ${c.plan.slotSettings[slot].meal}`:''}`).join('、');
    const known=[c.plan.name&&`药名 ${c.plan.name}`,c.plan.doseValue&&`每次 ${c.plan.doseValue} ${c.plan.doseUnit||'（单位待补）'}`,schedule&&`时段 ${schedule}`,c.plan.startDate&&`开始 ${c.plan.startDate}`,c.plan.duration==='截至某日期'&&c.plan.endDate?`截至 ${c.plan.endDate}`:c.plan.duration,c.plan.note&&`备注 ${c.plan.note}`].filter(Boolean).join('，');
    return `${known?`已记下：${known}。`:''}${Object.values(errors)[0]||'信息已整理，可在下方配置卡修改；开始日期和长期周期是表单默认值，请核对。餐时与备注可以不设。'} 尚未创建计划。`;
  }
  function chatOpenForm(kind) {
    const c=chatSession();if(!c)return;
    const key=c.key;syncChatDraft();
    if(kind==='plan')openModal('medicine',{targetId:c.targetId,chatKey:key,draft:c.plan,planId:c.planId,mode:'manual'});
    else openModal('health-form',{targetId:c.targetId,chatKey:key,draft:c.health,healthType:c.healthType});
  }
  function chatIntent(c,intent) {
    if(c.busy){c.processingId=null;c.busy=false;chatMessage(c,'已取消上一条处理中输入，原文保留在对话中。');}
    c.intent=intent;c.cards=[];c.selectedId=null;c.status='正在询问';
    if(intent==='plan')chatMessage(c,chatPlanQuestion(c));
    else if(intent==='health')chatMessage(c,'要记录血压、血脂还是身体指标？可以一次说多项。测量时间和单位请在卡片中核对，备注仅记录您的转述。');
    else if(intent==='query'){c.cards=eventsOn(today(),c.targetId).map(e=>e.id);chatMessage(c,c.cards.length?'按已保存的计划，今天的安排如下。点击具体任务后可以追问几点、多少。':'当前没有找到对应的用药计划／任务。可以查看用药信息或添加计划。');}
    else if(['record','makeup','snooze','correct','remind'].includes(intent)) {
      if(account().role==='child'&&intent!=='remind'){c.status='无权限';chatMessage(c,'只有长辈本人可以声明、补记、更正或延后。您可以查询、协助添加，或发起合格模拟提醒。');return;}
      const tasks=data.doseEvents.filter(e=>e.profileId===c.targetId&&!e.cancelledAt&&(intent==='makeup'?stateOf(e)==='overdue':intent==='correct'?resolved(e):e.date===today()));c.cards=tasks.map(e=>e.id);
      chatMessage(c,tasks.length?'请先选择具体药品、日期和时段。打开卡片不会自动记录。':'还没有找到对应任务。可查看已有任务或创建适用计划，不追造过去任务。');
    }else chatMessage(c,'可以查询安排、添加药品或身体数据；请选择一项，或输入具体内容。');
  }
  function chatTaskCard(e,selectable=true) {
    return `<article class="chat-task"><strong>${esc(e.snapshot.name)}</strong><p>${esc(e.date)} · ${e.slot} · 计划 ${esc(e.snapshot.doseValue)} ${esc(e.snapshot.doseUnit)}</p><p>提醒 ${e.scheduledTime} ${mealTag(e)||'· 餐时未设置'}</p>${badge(e)}${selectable?button('选择这次任务','chat-task','button-secondary',`data-id="${esc(e.id)}"`):''}</article>`;
  }
  function chatContent() {
    const c=chatSession();if(!c)return ['无法继续','<p>当前账号无权查看该会话。</p>'];
    if(c.intent==='plan')modal.draft=c.plan;
    const queryTasks=c.cards.map(taskId=>data.doseEvents.find(e=>e.id===taskId&&e.profileId===c.targetId&&!e.cancelledAt)).filter(Boolean),selected=data.doseEvents.find(e=>e.id===c.selectedId&&e.profileId===c.targetId&&!e.cancelledAt);
    const suggestions=[['query','今天吃什么药'],['plan','添加药品'],['health','添加身体数据'],...(account().role==='elder'?[['record','记录服药'],['snooze','稍后提醒'],['makeup','补记用药']]:[['remind','提醒 TA']])];
    let config='';
    if(c.intent==='plan')config=`<section class="chat-config"><h3>当前计划草稿 · 未保存</h3>${Object.values(c.planIssues||{}).map(message=>`<p class="chat-conflict" role="alert">${esc(message)}</p>`).join('')}${c.pendingSlots?`<p>您说“早晚”，请确认具体时段。</p>${button('确认早餐和晚餐','chat-confirm-slots','button-secondary')}`:''}${c.expectedTimes?`<p>用户描述每天 ${c.expectedTimes} 次；当前勾选 ${c.plan.slots.length} 次。</p>`:''}<form data-form="chat-plan" novalidate>${medicineFields(c.plan)}${submit('核对用药计划')}</form>${button('改为手动输入','chat-form-plan','text-button')}<details><summary>字段来源与默认值</summary><p>开始日期、长期周期、各时段提醒为可编辑默认值；未推断餐时。</p>${Object.entries(c.sources).map(([k,v])=>`<p>${esc(fieldLabel(k))}：${esc(v)}</p>`).join('')}</details></section>`;
    if(c.intent==='health')config=`<section class="chat-config"><h3>${TYPES[c.healthType].name}草稿 · 未保存</h3><p>${Object.entries(c.health.values).map(([k,v])=>`${TYPES[c.healthType].fields.find(f=>f[0]===k)?.[1]||k} ${v} ${TYPES[c.healthType].fields.find(f=>f[0]===k)?.[2]||''}`).map(esc).join('；')||'尚无测量值'}</p><p>测量时间：${esc(c.health.measuredAt.replace('T',' '))}（请核对）</p>${c.health.note?`<p>${esc(c.health.note)}</p>`:''}${button('编辑并核对测量记录','chat-form-health','button-secondary')}</section>`;
    return [c.entry==='plan'?'添加药品打卡计划':'AI 助手',`<p class="chat-context">${esc(account().name)} · 记录对象：<strong>${esc(targetName())}</strong> · ${today()}${account().role==='child'?button('切换长辈','chat-profile','text-button'):''}</p><p class="chat-disclaimer">有限文字规则与示例语音模拟，不接麦克风或模型，不提供医疗建议。</p><div class="chat-stream" role="log" aria-label="对话消息" aria-live="polite">${c.messages.map(m=>`<article class="chat-message ${m.role}"><small>${m.role==='user'?`您 · ${esc(m.source||'文字输入')}`:'药安心助手'}</small><p>${esc(m.text)}</p></article>`).join('')}</div><p class="chat-status" role="status">${esc(c.status)}${c.date!==today()?' · 演示日期已变化，任务按最新状态重新核验':''}</p><div class="chat-suggestions">${suggestions.map(([kind,label])=>button(label,'chat-intent','chip',`data-intent="${kind}"`)).join('')}${button('查看用药信息','chat-view','chip','data-page="plans"')}</div>${config}<div class="chat-tasks">${queryTasks.map(e=>chatTaskCard(e)).join('')}</div>${selected?`<section class="chat-selected"><h3>当前明确任务</h3>${chatTaskCard(selected,false)}${c.ambiguous?'<p class="chat-conflict">这一次到现在还没有服用，还是后来已经服用了？请明确选择。</p>':''}${doseActions(selected)}${c.followup?button('暂不处理这项','chat-dismiss-followup','text-button'):''}</section>`:''}<div class="chat-composer"><div class="mode-tabs">${button('文字','chat-mode',c.mode==='text'?'is-active':'',`data-mode="text" aria-pressed="${c.mode==='text'}"`)}${button('按住说话（模拟）','chat-mode',c.mode==='voice'?'is-active':'',`data-mode="voice" aria-pressed="${c.mode==='voice'}"`)}</div>${c.mode==='voice'?`<label class="voice-label" for="voice-example">选择示例语音内容</label><select id="voice-example" data-chat-example><option value="">请选择，不会自动发送</option>${C.examples.map(([label,text],i)=>`<option value="${i}" ${String(i)===c.example?'selected':''}>${esc(label)}：${esc(text)}</option>`).join('')}</select>${button('按住体验语音输入（模拟）','voice-experience','voice-pad')}${button('点按体验（等效操作）','voice-experience','text-button')}`:''}${c.preview?`<p class="voice-preview-label">示例文字预览，可修改；发送前不会更新草稿</p>${button('取消示例','voice-cancel','text-button')}`:''}<form data-form="chat"><label class="sr-only" for="chat-input">输入消息</label><textarea id="chat-input" name="message" rows="2" maxlength="1000" placeholder="输入文字，或编辑示例内容">${esc(c.input)}</textarea><div class="chat-send">${button('重新输入','chat-clear','text-button')}<button class="button-primary" type="submit" ${c.busy?'disabled':''}>发送</button></div></form></div>`];
  }
  function chatSaved(key,text,eventId) {
    const c=chatSession(key);if(!c)return;
    c.status='已保存';c.intent='home';c.cards=[];c.selectedId=null;c.ambiguous=false;chatMessage(c,text);
    if(eventId&&account().role==='elder') {
      const next=data.doseEvents.find(e=>e.profileId===c.targetId&&e.id!==eventId&&stateOf(e)==='overdue');
      if(next){c.selectedId=next.id;c.followup=true;chatMessage(c,`你有未打卡的记录：${next.snapshot.name}，${next.date} ${next.slot}，计划 ${next.snapshot.doseValue} ${next.snapshot.doseUnit}。这次已经服用、未服用，还是本次无需服用？`);}
    }
    modal=null;render();openModal('chat',{targetId:c.targetId,chatKey:key});
  }
  function processChat(c,text,source) {
    const detected=C.intent(text,c.intent),inferred=detected!=='medical'&&hasPlanInput(c.plan)&&C.planModification(text)?'plan':detected;c.status='正在询问';
    if(inferred==='medical'){chatMessage(c,'我可以整理和查询已保存的安排，不能推荐药物、增减剂量或作健康判断。请查看已有计划；涉及用药决定请向医生或药师确认。');return;}
    if(account().role==='child'&&inferred==='record'&&C.declaration(text).fact==='not_taken'){const e=data.doseEvents.find(e=>e.id===c.selectedId&&e.profileId===c.targetId);const eligibility=R.notTakenEligibility(data,view.accountId,e);c.cards=[];c.selectedId=null;c.status='无权限';chatMessage(c,`${eligibility.reason}。文字、示例语音和任务卡都遵守同一权限。`);return;}
    if(account().role==='child'&&['record','makeup','snooze','correct'].includes(inferred)){c.cards=[];c.selectedId=null;c.status='无权限';chatMessage(c,'只有长辈本人可以声明、补记、更正或延后。文字、示例语音和任务卡都遵守同一权限。');return;}
    if(inferred==='plan') {
      c.intent='plan';c.cards=[];c.selectedId=null;const result=C.parsePlan(text,c.plan);c.plan=result.draft;
      c.planIssues||={};
      if(result.blocked)c.planIssues[result.blockKind||'schedule']=result.issues[0];
      else {for(const kind of result.resolvedKinds||[])delete c.planIssues[kind];if(result.resolveBlocked)delete c.planIssues.schedule;}
      if(result.pendingSlots)c.pendingSlots=result.pendingSlots;
      if(result.expectedTimes!==undefined)c.expectedTimes=result.expectedTimes;
      if(result.changed.includes('slots'))c.pendingSlots=null;
      result.changed.forEach(field=>{c.sources[field]=source;});c.plan.source=withSource(c.plan.source,source);
      chatMessage(c,[...result.issues,chatPlanQuestion(c)].join(' '));if(!result.changed.length&&!result.issues.length)chatMessage(c,'这段表达未能确定新的字段。原文保留，可用下方卡片或手动填写。');return;
    }
    if(inferred==='health') {
      c.intent='health';c.cards=[];c.selectedId=null;const result=C.parseHealth(text,c.health,c.healthType,today(),data.demoTime);if(result.type!==c.healthType)c.healthConflicts={};c.health=result.draft;c.healthType=result.type;c.health.source=withSource(c.health.source,source);c.healthConflicts={...c.healthConflicts,...result.uncertain};for(const key of result.changed)delete c.healthConflicts[key];c.healthIssues=Object.values(c.healthConflicts);
      chatMessage(c,`${result.changed.length?'已将您提供的测量值放入草稿。':'请补充测量类型和数值。'}${result.issues.join(' ')}单位和测量时间需要在“编辑并核对测量记录”中确认，确认保存前不会成为健康记录。`);return;
    }
    if(inferred==='query') {
      c.intent='query';const available=eventsOn(today(),c.targetId);let tasks=C.taskFilter(text,available,today());
      if(/几点|多少|计划用量/.test(text)&&c.selectedId&&!/今天|晚上|早餐|午餐|晚餐|睡前/.test(text))tasks=available.filter(e=>e.id===c.selectedId);
      c.cards=tasks.map(e=>e.id);c.selectedId=tasks.length===1?tasks[0].id:null;
      chatMessage(c,tasks.length?'按已保存的计划，当前安排如下。多个任务请先选择具体一项，提醒时间不代表实际服药时间。':'当前没有找到对应的用药计划／任务。可以查看用药信息或添加计划。');return;
    }
    if(['record','makeup','snooze','correct','remind'].includes(inferred)) {
      c.intent=inferred;let e=data.doseEvents.find(e=>e.id===c.selectedId&&e.profileId===c.targetId&&!e.cancelledAt);
      const all=data.doseEvents.filter(t=>t.profileId===c.targetId&&!t.cancelledAt);
      const named=all.some(t=>text.includes(t.snapshot.name));
      const otherTarget=text.match(/^(.{1,50}?)(?:已经(?:吃|服)|吃过|还没吃|未服用|没有按时服用)/)?.[1]?.replace(/这次药|这一次药|我|这次|这回|这个药|这项|刚才|后来|现在|今天|早餐|午餐|晚餐|睡前|的|[，, ]/g,'');
      if(otherTarget&&!named){c.cards=[];c.selectedId=null;chatMessage(c,'还没有找到您提到的对应任务。请明确选择已有任务；不会沿用上一种药来记录，也不会新建临时服药记录。');return;}
      if(named){const found=C.taskFilter(text,all,today());e=found.length===1?found[0]:null;c.selectedId=e?.id||null;c.cards=found.map(t=>t.id);}
      if(!e){c.cards=C.taskFilter(text,inferred==='makeup'?all.filter(t=>stateOf(t)==='overdue'):all.filter(t=>t.date===today()),today()).map(t=>t.id);chatMessage(c,c.cards.length?'请先选择对应的药品、原日期与时段，再明确本次声明；不会猜测或批量打卡。':'还没有找到对应任务。请选择已有任务，或创建适用计划；不会新建无计划的临时服药记录。');return;}
      if(inferred==='snooze'){const duration=text.match(/(\d+)\s*分钟/)?.[1];chatMessage(c,duration&&!['5','30'].includes(duration)?'仅支持5分钟或30分钟，请点选，不会取近似值。':'请选择5分钟或30分钟。按钮会显示设置后的完整日期时间；原任务时段不变。');return;}
      if(inferred==='remind'){chatMessage(c,R.reminderReason(data,view.accountId,e)||'这项符合提醒条件，请点击“提醒 TA（模拟）”。');return;}
      if(inferred==='correct'){chatMessage(c,'请点击当前任务的“更正记录”，核对后确认；原记录会保留。');return;}
      const declaration=C.declaration(text,e.snapshot.name);
      if(declaration.ambiguous){c.ambiguous=true;chatMessage(c,'这一次到现在还没有服用，还是后来已经服用了？未明确前保留原记录。');return;}
      if(declaration.fact){if(resolved(e)){chatMessage(c,'这次已有声明。若需修改，请进入“更正记录”，不会重复记录。');return;}
        if(declaration.fact==='not_taken'){
          const eligibility=R.notTakenEligibility(data,view.accountId,e);
          if(!eligibility.allowed){c.status='暂不能记录';chatMessage(c,`${eligibility.reason}。任务保持待打卡，不会自动记录为未服用。`);return;}
        }
        const details=declaration.details||[],differs=details.some(part=>part.kind==='dose'&&(part.value!==Number(e.snapshot.doseValue)||part.unit!==e.snapshot.doseUnit));
        const actual=details.length?`用户自述（未经核验）：${text}${differs?'；自述用量与计划不同，仅保留本人声明，不生成剩余剂量任务。':''}`:null;
        if(['not_taken','skipped'].includes(declaration.fact)){openModal('dose-confirm',{eventId:e.id,status:declaration.fact,chatKey:c.key,actual});return;}
        recordDose(e.id,declaration.fact,{actual,inputSource:source,operationId:id('chat-record')});return;}
      chatMessage(c,'请明确选择已服用、未服用或本次无需服用；不用补填实际时间和数量。');return;
    }
    chatMessage(c,'我还不能确定这段表达的意图，原文已保留。可选择下方事项或使用手动表单。');c.status='无法理解';
  }
  function sendChat() {
    const c=chatSession();if(!c||c.busy||!c.input.trim())return;
    const text=c.input.trim(),source=c.preview?'示例输入（模拟）':'文字输入',key=c.key,sessionId=c.id,processingId=id('processing');c.processingId=processingId;
    c.busy=true;c.status=c.preview?'模拟处理中':'文字处理中';chatMessage(c,text,'user',source);c.input='';c.preview=null;renderModal();
    setTimeout(()=>{
      if(conversations.get(key)?.id!==sessionId||c.processingId!==processingId)return;c.busy=false;
      if(!chatSession(key)||modal?.chatKey!==key||modal.type!=='chat'){c.status='已取消';chatMessage(c,'处理期间切换了对象或页面，本轮未提交，请回到此会话重新发送。');return;}
      processChat(c,text,source);if(modal?.type==='chat')renderModal();publishState();
    },120);
  }
  function previewVoice() {
    const c=chatSession();if(!c)return;if(c.example==='') {c.status='正在询问';chatMessage(c,'请先选择示例，或切换文字输入；不会随机生成识别结果。');renderModal();return;}
    if(!c.preview)c.beforePreview=c.input;c.preview=true;c.mode='voice';c.status='示例语音体验中';c.input=C.examples[Number(c.example)][1];renderModal();
  }
  let longPress=null,suppressLongClick=false;
  app.addEventListener('pointerdown',event=>{
    suppressLongClick=false;
    clearTimeout(longPress?.timer);
    const target=event.target.closest('[data-action="assistant"],[data-action="voice-experience"]');if(!target||event.button!==0)return;
    longPress={x:event.clientX,y:event.clientY,fired:false,timer:setTimeout(()=>{if(!longPress)return;longPress.fired=true;suppressLongClick=true;if(target.dataset.action==='assistant')openChat('home','voice');else previewVoice();},500)};
  });
  app.addEventListener('pointermove',event=>{if(longPress&&!longPress.fired&&Math.hypot(event.clientX-longPress.x,event.clientY-longPress.y)>12){clearTimeout(longPress.timer);longPress=null;}});
  for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{if(longPress){clearTimeout(longPress.timer);if(longPress.fired)setTimeout(()=>{suppressLongClick=false;},350);longPress=null;}});
  function notificationList() {
    return data.notificationLogs.filter(n=>n.legacy!==true&&n.kind&&n.recipientId===view.accountId&&canAccess(n.profileId)).map(n=>{
      const e=data.doseEvents.find(e=>e.id===n.eventId),currentState=R.stateOf(n.kind==='N2'?R.simulatedRemote(e):e,data);
      return {...n,currentState,...(['taken','not_taken','skipped','cancelled'].includes(currentState)?{title:'记录已更新',text:`${e.date} ${e.slot} · ${e.snapshot.name}，最新状态：${STATUS[currentState]}。打开查看最新记录。`}:{})};
    });
  }
  function bridgeState() {
    return {account:{id:account().id,name:account().name,role:account().role,fontMode:account().fontMode},accounts:data.accounts.map(a=>({id:a.id,name:a.name,role:a.role})),profiles:profiles().map(p=>({id:p.id,name:p.name})),profileId:profile()?.id||'',theme:data.notificationStyle,date:today(),dateOffset:data.dateOffset,time:data.demoTime,notificationsEnabled:data.notificationsEnabled,privatePreview:data.privatePreview,simulationMode:data.simulationMode,notifications:notificationList(),page:view.page,modalActive:!!modal};
  }
  function publishState() {
    if(!Bridge.embedded||!themeReady)return;
    document.documentElement.dataset.os=data.notificationStyle;
    Bridge.send('STATE',bridgeState());
    if(!data.notificationsEnabled)return;
    const notices=notificationList().filter(n=>n.deliveryState==='delivered'&&!shownBanners.has(n.id)&&R.notificationEligible(data,n.kind,data.doseEvents.find(e=>e.id===n.eventId),n.warningRound||null));
    notices.forEach(n=>{shownBanners.add(n.id);});
    const last=notices.at(-1);if(last)Bridge.send('BANNER',{notification:last,privatePreview:data.privatePreview});
  }
  const focusKey = e => `${visitId}|${e.id}|${R.notificationRound(data,e,'N1')}`;
  function scheduleFocus() {
    if(focusScheduled)return;focusScheduled=true;
    queueMicrotask(()=>{
      focusScheduled=false;
      if(!stageVisible||!themeReady||modal||view.page!=='home'||account().role!=='elder'||document.activeElement?.matches('input,textarea,select'))return;
      const queue=R.focusCandidates(data,view.accountId).filter(e=>!dismissedFocus.has(focusKey(e))).map(e=>e.id);
      if(queue.length)openModal('focus',{queue,eventId:queue[0],position:1,total:queue.length});
    });
  }
  function locateTask(e) {
    view.planTab='history';view.historyDate=e.date;view.page='plans';closeModal(false);render();
    requestAnimationFrame(()=>app.querySelector(`[data-task-id="${CSS.escape(e.id)}"]`)?.scrollIntoView({block:'center',behavior:'instant'}));
  }
  function markFocusDismissed(context) {
    for(const taskId of context.queue||[context.eventId]) {const task=data.doseEvents.find(t=>t.id===taskId);if(task)dismissedFocus.add(focusKey(task));}
  }
  function dismissFocus() {
    const context=modal;
    markFocusDismissed(context);
    if(context?.notificationId)markFocusDismissed({queue:R.focusCandidates(data,view.accountId).map(event=>event.id)});
    closeModal(false);enterAccountHome(view.accountId,{preserveUndo:true});render();focusHome();scheduleFocus();
  }
  function viewFocusTask() {
    const context=modal,e=data.doseEvents.find(task=>task.id===context?.eventId);
    if(!e||!canAccess(e.profileId))return dismissFocus();
    markFocusDismissed(context);closeModal(false);locateTask(e);
  }
  function advanceFocus(context,eventId) {
    const event=data.doseEvents.find(e=>e.id===eventId);if(event)dismissedFocus.add(focusKey(event));
    closeModal(false);render();
    if(!context)return;
    const remaining=(context.queue||[]).filter(taskId=>{const e=data.doseEvents.find(e=>e.id===taskId);return e&&R.canDeclare(data,view.accountId,e)&&!resolved(e)&&!R.protectedAt(e,now())&&taskId!==eventId;});
    if(remaining.length)openModal('focus',{...context,queue:remaining,eventId:remaining[0],position:context.position+1});
  }
  function focusContent() {
    const e=data.doseEvents.find(e=>e.id===modal.eventId);
    if(!e||!canAccess(e.profileId))return ['无法查看','<p>任务不存在或授权已失效。</p>'];
    if(e.cancelledAt)return ['提醒已失效','<p>该次任务已取消，不能继续打卡。</p>'];
    if(resolved(e))return ['该任务已有记录',`<p>${esc(e.snapshot.name)}</p>${badge(e)}${recordDetails(e)}`];
    return [stateOf(e)==='overdue'?'这次用药还没有记录':'该吃药啦！',`<div class="focus-content"><p class="focus-progress">第 ${modal.position} / ${modal.total} 项 · 可关闭后再处理</p><div class="focus-clock">${icon('clock')}</div><p>${e.date} · ${e.slot} · 提醒 ${e.scheduledTime}</p><h3>${esc(e.snapshot.name)}</h3><p class="focus-dose">计划 ${esc(e.snapshot.doseValue)} ${esc(e.snapshot.doseUnit)} ${mealTag(e)}</p>${e.snapshot.note?`<p>${esc(e.snapshot.note)}</p>`:''}${badge(e)}${doseActions(e)}${button(`${icon('calendar')}查看对应任务`,'view-focus-task','button-secondary')}<p class="helper-text">仅记录本人声明，不提供用药建议。</p></div>`];
  }
  function openNotification(ref) {
    if(modal?.type==='reset')return {message:'请先完成或关闭恢复确认，再打开关联通知'};
    const n=data.notificationLogs.find(n=>n.id===ref.notificationId&&n.legacy!==true&&n.kind);
    const reject=message=>{preserveDraft();closeModal(false);enterAccountHome(view.accountId,{preserveUndo:true});render();focusHome();toast(message,'warning');throw Error(message);};
    if(!n||n.eventId!==ref.eventId||n.profileId!==ref.profileId||n.date!==ref.date||n.recipientId!==ref.recipientId||n.recipientId!==view.accountId||!canAccess(n.profileId))return reject('通知已失效或当前账号无权查看');
    const e=data.doseEvents.find(e=>e.id===n.eventId);if(!e)return reject('原任务已不存在');
    preserveDraft();
    if(account().role==='child') {
      if(profile()?.id!==e.profileId)switchProfile(e.profileId,false);
      locateTask(e);toast(resolved(e)?'已显示最新记录。':'请查看该次用药记录，子女不能代替打卡。');
    } else if(e.cancelledAt)return reject('该次任务已取消，原提醒已失效。');
    else if(resolved(e))openModal('task-detail',{eventId:e.id});
    else openModal('focus',{queue:[e.id],eventId:e.id,position:1,total:1,notificationId:n.id});
    publishState();return {message:'已按最新状态打开通知'};
  }
  function applyDemoOptions(options) {
    if(!commit(next=>{Object.assign(next,options);} ))throw Error('模拟设置未保存');
    render();return {message:'模拟设置已更新'};
  }
  function handleDemoMessage(type,p) {
    if(type==='HELLO') {Bridge.send('READY',bridgeState());return {};}
    if(type==='THEME') {
      if(!commit(next=>{next.notificationStyle=p.os;}))throw Error('主题未保存');
      themeReady=true;document.documentElement.dataset.os=p.os;app.style.visibility='visible';publishState();return {theme:p.os};
    }
    if(type==='VISIBILITY') {
      if(!p.visible)preserveDraft();
      const resumed=p.visible&&!stageVisible;stageVisible=p.visible;if(resumed){visitId=p.visitId;dismissedFocus.clear();}
      app.inert=!p.visible;document.activeElement?.blur?.();if(resumed){render();scheduleFocus();}return {};
    }
    if(type==='CLOCK') {if(!commit(next=>R.setClock(next,p.dateOffset,p.time)))throw Error('演示时间未保存');render();return {message:`已调整至 ${today()} ${data.demoTime}`};}
    if(type==='SWITCH_ACCOUNT') {switchAccount(p.accountId);return {};}
    if(type==='SWITCH_PROFILE') {switchProfile(p.profileId);return {};}
    if(type==='OPTIONS')return applyDemoOptions(p);
    if(type==='OPEN_NOTIFICATION')return openNotification(p);
    if(type==='SCENE') {
      if(p.kind==='N3') {if(account().role!=='child')throw Error('N3需由已授权子女发起');preserveDraft();navigate('home');return {message:'请在应用中对符合资格的任务点击“提醒 TA”'};}
      if(p.kind==='N1'&&account().role!=='elder')throw Error('请显式切换长辈接收账号');
      if(!commit(()=>{}))throw Error('通知检查未完成');
      const notice=notificationList().filter(n=>n.kind===p.kind&&R.notificationEligible(data,n.kind,data.doseEvents.find(e=>e.id===n.eventId),n.warningRound||null)).at(-1);
      if(!data.notificationsEnabled)throw Error('模拟通知已关闭，仍可手动记录');
      if(!notice)throw Error('当前无符合资格的任务：请检查时刻、记录或延后保护');
      if(notice.deliveryState==='delivered')Bridge.send('BANNER',{notification:notice,privatePreview:data.privatePreview});
      return {message:notice.deliveryState==='failed'?'模拟发送失败，可重试':notice.deliveryState==='pending'?'模拟待同步':'已展示本轮提醒，重复触发不新增记录'};
    }
    if(type==='SYNC') {if(!commit(next=>R.syncSimulation(next)))throw Error('模拟同步未完成');render();return {message:'模拟接收完成，保留原确认时间'};}
    if(type==='RETRY') {if(!commit(next=>R.retryNotifications(next)))throw Error('重试未完成');render();return {message:'已按最新资格重试原通知'};}
    if(type==='RESET_REQUEST') {preserveDraft();openModal('reset');return {message:'请在应用内确认恢复初始数据'};}
    throw Error('不支持的演示动作');
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
    const notTaken = R.notTakenEligibility(data, view.accountId, event);
    if (!R.canDeclare(data, view.accountId, event)) return `<p class="helper-text" data-not-taken-reason>${esc(notTaken.reason||'尚未到此时段或任务已取消')}</p>`;
    if (resolved(event)) return button('更正记录', 'correct-dose', 'text-button', `data-id="${event.id}"`);
    const reason = R.snoozeReason(data, view.accountId, event);
    const delayPreview=chatSession()&&!reason?`<p class="helper-text">5分钟后：${displayTime(R.plusMinutes(now(),5))}<br>30分钟后：${displayTime(R.plusMinutes(now(),30))}</p>`:'';
    return `<div class="dose-actions">${button(`${icon('check')}已服用`, 'take', 'button-primary', `data-id="${event.id}"`)}${button('未服用', 'declare', 'button-secondary', `data-id="${event.id}" data-status="not_taken" ${notTaken.allowed ? '' : 'disabled aria-disabled="true"'}`)}${button('本次无需服用', 'dose-confirm', 'button-secondary', `data-id="${event.id}" data-status="skipped"`)}</div>${notTaken.allowed?'':`<p class="helper-text" data-not-taken-reason>${esc(notTaken.reason)}</p>`}${delayPreview}<div class="snooze-actions">${[5, 30].map(n => button(`延后 ${n} 分钟`, 'snooze', 'button-secondary button-small', `data-id="${event.id}" data-minutes="${n}" ${reason ? 'disabled aria-disabled="true"' : ''}`)).join('')}</div><p class="helper-text">${esc(reason ? (event.snoozeUsed ? '* 延后机会已用完，请按实际情况记录' : reason) : '* 本次任务仅有 1 次延后机会')}</p>`;
  }

  function recordDetails(event) {
    const last=event.changes.at(-1);
    return `${event.recordedAt ? `<p class="helper-text">${event.recordedAt >= event.deadlineAt ? '补记 · ' : ''}${esc(displayTime(event.recordedAt))}记录 · ${esc(author(event))}</p>` : ''}${event.snoozeUntil && !resolved(event) ? `<p class="helper-text">再次提醒：${esc(displayTime(event.snoozeUntil))}</p>` : ''}${last?.syncState==='pending'||event.snoozeSyncState==='pending'?'<p class="sync-caption">本机已保存 · 待同步（模拟）。模拟远端可能仍提示暂未收到记录。</p>':''}${last?.syncState==='synced'?`<p class="helper-text">模拟接收：${esc(displayTime(last.receivedAt))} · 保留原本机确认时间</p>`:''}${event.legacy ? '<p class="helper-text">旧版来源保留；餐时待本人核对，记录时间不代表服药时间。</p>' : ''}`;
  }

  const mealTag = event => planFor(event).meal ? `<span class="meal-tag">${esc(planFor(event).meal)}</span>` : '';

  function overdueCard(events) {
    const late = events.filter(e => stateOf(e) === 'overdue');
    if (!late.length) return '';
    return `<section class="card overdue-card ${overdueOpen ? 'is-open' : ''}">${button(`<span class="overdue-dot" aria-hidden="true"></span><span>未按时打卡提醒（${late.length}）</span>${icon('down')}`, 'overdue', 'overdue-toggle', `aria-expanded="${overdueOpen}" aria-controls="overdue-items"`)}<div class="overdue-items" id="overdue-items"><p class="microcopy">未打卡不等于未服药。仅记录实际情况，请勿因提醒自行补服。</p>${late.map(e => `<article class="overdue-item"><div class="overdue-item-main"><div><strong>${esc(planFor(e).name)} ${mealTag(e)}</strong><span>${e.date} ${e.slot} · ${e.scheduledTime} · 计划 ${esc(planFor(e).doseValue)} ${esc(planFor(e).doseUnit)}</span></div>${badge(e)}</div>${doseActions(e)}</article>`).join('')}</div></section>`;
  }

  function medCard(event) {
    const plan = planFor(event);
    return `<article class="card med-card color-${esc(plan.color || 'blue')}" id="task-${esc(event.id)}" data-event="${esc(event.id)}" data-task-id="${esc(event.id)}"><div class="med-card-top"><div class="med-card-title-wrap"><h3>${esc(plan.name)} ${mealTag(event)}</h3><div class="med-meta"><span>${icon('pill')}计划 ${esc(plan.doseValue)} ${esc(plan.doseUnit)}/次</span><span>${icon('clock')}${event.slot} ${event.scheduledTime}</span></div></div>${badge(event)}</div>${recordDetails(event)}${doseActions(event)}${button('查看记录详情', 'task-detail', 'text-button', `data-id="${event.id}"`)}</article>`;
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
    return `<div class="schedule-list">${Object.entries(SLOTS).filter(([slot]) => events.some(e => e.slot === slot)).map(([slot]) => `<section class="schedule-group"><div class="schedule-group-title">${icon('clock')}${slot}</div>${events.filter(e => e.slot === slot).map(e => `<div class="schedule-row" data-task-id="${esc(e.id)}"><div class="schedule-name"><strong>${esc(planFor(e).name)} ${mealTag(e)}</strong><span>计划 ${esc(planFor(e).doseValue)} ${esc(planFor(e).doseUnit)}/次 · 提醒 ${e.scheduledTime}</span>${recordDetails(e)}</div><div class="schedule-status">${badge(e)}${button('查看当次', 'task-detail', 'text-button', `data-id="${e.id}"`)}${remind && account().role === 'child' ? reminderButton(e) : ''}</div></div>`).join('')}</section>`).join('')}</div>`;
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
    return `${header('我的')}<section class="profile-card"><span class="avatar">${esc(a.avatar)}</span><div class="profile-info"><h2>${esc(a.name)}</h2><p>${a.age} 岁 · ${a.role === 'elder' ? '长辈账号' : '子女账号'}</p></div><span class="pill pill-green">演示账号</span></section>${section('显示设置', `<div class="settings-list"><div class="setting-row"><span class="setting-leading">${icon('settings')}</span><div class="setting-content"><strong>字号模式</strong></div><div class="font-segmented" role="group" aria-label="字号模式">${[['normal', '标准'], ['elder', '大字']].map(([key, label]) => button(label, 'font', a.fontMode === key ? 'is-active' : '', `data-value="${key}" aria-pressed="${a.fontMode === key}"`)).join('')}</div></div></div>`)}${section('家庭与账号', `<div class="settings-list">${button(`<span class="setting-leading">${icon('users')}</span><span class="setting-content"><strong>${esc(family().name)}</strong><span>${profiles().map(p => esc(p.name)).join('、')}</span></span>${icon('chevron')}`, 'family', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('user')}</span><span class="setting-content"><strong>首次使用引导</strong><span>新建本地演示账号</span></span>${icon('chevron')}`, 'onboarding', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('bell')}</span><span class="setting-content"><strong>模拟提醒记录</strong></span>${icon('chevron')}`, 'notifications', 'setting-row setting-button')}</div>`)}${section('切换演示账号', accountOptions())}${section('演示设置', `<div class="settings-list">${button(`<span class="setting-leading">${icon('bell')}</span><span class="setting-content"><strong>模拟通知设置</strong><span>${data.notificationsEnabled?'已开启':'未开启'} · ${data.privatePreview?'简洁预览':'详细预览'}</span></span>${icon('chevron')}`,'notification-settings','setting-row setting-button')}${button(`<span class="setting-leading">${icon('clock')}</span><span class="setting-content"><strong>演示时间</strong><span>${today()} ${data.demoTime}</span></span>${icon('chevron')}`, 'clock', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('info')}</span><span class="setting-content"><strong>演示与隐私说明</strong></span>${icon('chevron')}`, 'about', 'setting-row setting-button')}${button(`<span class="setting-leading">${icon('back')}</span><span class="setting-content"><strong>恢复初始演示数据</strong></span>${icon('chevron')}`, 'reset', 'setting-row setting-button')}</div>`)}${safety()}`;
  }

  function render() {
    document.documentElement.dataset.os=data.notificationStyle;
    const scroll = document.querySelector('.app-main')?.scrollTop || 0;
    const pages = { home: homePage, plans: plansPage, health: healthPage, me: mePage };
    app.innerHTML = `<div class="app-shell font-${account().fontMode}"><div class="app-main" id="page-region"><div class="demo-strip"><span>${Bridge.embedded?'本地演示':`本地演示 · ${today()} ${data.demoTime}`}</span><span>${esc(account().name)} · ${account().role === 'elder' ? '长辈' : '子女'}</span></div>${storageWarning ? `<div class="storage-warning" role="alert">${esc(storageWarning)}</div>` : ''}${drafts.has(sessionKey())?`<div class="draft-resume">${button('继续未完成的输入','resume-draft','text-button')}</div>`:''}${data.simulationMode!=='online'?`<div class="simulation-note">${data.simulationMode==='offline'?'离线／待同步模拟：所有操作仍保存在本机，无真实远端连接。':'通知发送失败模拟：记录可正常保存。'}</div>`:''}<div class="page-content">${pages[view.page]()}</div><footer class="page-footer">药安心 · 家庭协同</footer></div>${['plans', 'health'].includes(view.page) ? button(icon('plus'), 'quick-add', 'fab', `aria-label="${view.page === 'plans' ? '添加药品打卡计划' : '添加身体数据'}"`) : view.page==='home'?button(icon('chat'),'assistant','fab assistant-fab','aria-label="AI 助手，点击文字或长按模拟语音"'):''}<nav class="bottom-nav" aria-label="主导航">${[['home', 'heartbeat', account().role === 'child' ? '首页看板' : '服药打卡'], ['plans', 'pill', '用药信息'], ['health', 'chart', '身体数据'], ['me', 'user', '我的']].map(([key, symbol, label]) => button(`<span class="nav-icon-wrap">${icon(symbol)}</span><span>${label}</span>`, 'navigate', `nav-item ${view.page === key ? 'is-active' : ''}`, `data-page="${key}" ${view.page === key ? 'aria-current="page"' : ''}`)).join('')}</nav><div id="modal-root"></div><div class="toast-stack" id="toast-root" role="status" aria-live="polite"></div></div>`;
    document.querySelector('.app-main').scrollTop = scroll;
    renderModal();
    rememberView();
    publishState();
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
    scheduleFocus();
  }

  function toast(message, type = 'success', allowUndo = false) {
    clearTimeout(toastTimer);
    const root = document.getElementById('toast-root');
    if (!root) return;
    root.innerHTML = `<div class="toast ${type}">${icon(type === 'warning' ? 'warning' : 'check')}<span>${esc(message)}</span>${allowUndo ? button(`${icon('back')}撤销`, 'undo', 'toast-undo', 'aria-label="撤销本次打卡"') : ''}</div>`;
    toastTimer = setTimeout(() => { root.innerHTML = ''; }, allowUndo ? 5000 : 3800);
  }

  function openModal(type, fields = {}) {
    document.querySelectorAll('.modal-exit-copy').forEach(element=>{element.remove();});
    if(modal?.type==='chat'){const c=chatSession();if(c)c.scrollTop=app.querySelector('.chat-sheet > .sheet-content')?.scrollTop||0;}
    if (!modal) {
      const active = document.activeElement;
      modalReturnFocus = active?.dataset.action ? { action: active.dataset.action, id: active.dataset.id, page: active.dataset.page } : null;
    }
    modal = { type, ...fields };
    renderModal();
    publishState();
  }

  function closeModal(restore = true) {
    if (restore && modal?.picker) { modal.picker = null; renderModal(); return; }
    if (restore && modal?.errorLayer) { dismissErrors(); return; }
    if(restore&&modal)animateModalExit();
    if (restore && modal?.type==='focus') { dismissFocus();return; }
    if (restore && modal?.focusContext) {modal=modal.focusContext;renderModal();return;}
    if(restore&&modal?.chatKey&&modal.type!=='chat'){returnChat(modal.chatKey);return;}
    const hasDraft=restore&&workModal(modal);if(hasDraft)preserveDraft();
    modal = null;
    document.getElementById('modal-root')?.replaceChildren();
    document.getElementById('page-region')?.removeAttribute('inert');
    document.querySelector('.bottom-nav')?.removeAttribute('inert');
    document.querySelector('.fab')?.removeAttribute('inert');
    document.body.classList.remove('modal-open');
    if(hasDraft)render();
    if (restore && modalReturnFocus) {
      const target = [...app.querySelectorAll('[data-action]')].find(e => e.dataset.action === modalReturnFocus.action && e.dataset.id === modalReturnFocus.id && e.dataset.page === modalReturnFocus.page);
      (target || app.querySelector('.nav-item.is-active'))?.focus({ preventScroll: true });
    }
  }
  function animateModalExit() {
    if(!stageVisible||document.documentElement.dataset.input==='keyboard'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const sheet=app.querySelector('.modal-sheet');if(!sheet)return;
    const rect=sheet.getBoundingClientRect(),ghost=sheet.cloneNode(true);ghost.inert=true;ghost.setAttribute('aria-hidden','true');ghost.removeAttribute('role');
    ghost.querySelectorAll('[id],[data-action],[name]').forEach(el=>{el.removeAttribute('id');el.removeAttribute('data-action');el.removeAttribute('name');});ghost.classList.add('modal-exit-copy');
    Object.assign(ghost.style,{position:'fixed',top:`${rect.top}px`,left:`${rect.left}px`,width:`${rect.width}px`,height:`${rect.height}px`,maxHeight:'none',margin:'0',zIndex:'300',pointerEvents:'none',animation:'none',transition:'none'});
    document.body.append(ghost);ghost.scrollTop=sheet.scrollTop;
    ghost.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(24px)',opacity:0}],{duration:200,easing:'cubic-bezier(0.23,1,0.32,1)'}).finished.finally(()=>ghost.remove());
  }

  function modalFrame(title, content) {
    return `<div class="modal-backdrop"><section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="sheet-handle"></div><div class="modal-header"><h2 id="modal-title">${title}</h2>${button(icon('close'), 'close-modal', 'close-button', 'aria-label="关闭弹窗" title="关闭"')}</div><div class="sheet-content">${content}</div></section></div>`;
  }

  function renderModal() {
    const root = document.getElementById('modal-root');
    if (!root) return;
    if (!modal) { closeModal(false); return; }
    const oldChatContent=root.querySelector('.chat-sheet > .sheet-content');if(oldChatContent&&chatSession())chatSession().scrollTop=oldChatContent.scrollTop;
    modal.scrollPositions ||= {};
    if(root.dataset.contentKey) modal.scrollPositions[root.dataset.contentKey]=root.querySelector('.modal-sheet')?.scrollTop || 0;
    const contentKey=modal.picker?'picker':modal.type;
    root.dataset.contentKey=contentKey;
    const [title, content] = modal.picker ? ['设置提醒时间', timePicker()] : modalContent();
    root.innerHTML = modalFrame(title, content);
    if(modal.type==='focus') {
      root.querySelector('.modal-sheet').classList.add('focus-sheet');
      root.querySelector('.close-button').setAttribute('aria-label','关闭提醒，返回服药打卡首页');
    }
    if(modal.type==='chat'&&!modal.picker) {
      root.querySelector('.modal-sheet').classList.add('chat-sheet');
      const context=root.querySelector('.chat-context');if(context)root.querySelector('.modal-sheet').insertBefore(context,root.querySelector('.sheet-content'));
      const composer=root.querySelector('.chat-composer');if(composer)root.querySelector('.modal-sheet').append(composer);
      const c=chatSession(),content=root.querySelector('.sheet-content');
      if(c){content.scrollTop=c.scrollTop||0;if(c.scrollToLatest){const last=root.querySelector('.chat-message:last-child');if(last)content.scrollTop=last.offsetTop-content.offsetTop;c.scrollToLatest=false;}}
    }
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
      root.querySelector('.chat-composer')?.setAttribute('inert','');
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
    if(m.type==='chat')return chatContent();
    if(m.type==='focus')return focusContent();
    if(m.type==='notice-invalid')return ['提醒已失效',`<p>${esc(m.message)}</p>`];
    if(m.type==='notification-settings')return ['模拟通知设置',`<p>只控制网页内模拟通知，不请求系统权限。</p><label class="consent-row"><input type="checkbox" data-notice-option="notificationsEnabled" ${data.notificationsEnabled?'checked':''}>启用模拟通知</label><label class="consent-row"><input type="checkbox" data-notice-option="privatePreview" ${data.privatePreview?'checked':''}>模拟锁屏使用简洁预览</label><p class="helper-text">关闭后仍可查看和手动记录。${data.notificationsEnabled?'模拟横幅已开启':'系统通知未开启（模拟）'}</p>`];
    if (m.type === 'accounts') return ['切换演示账号', accountOptions()];
    if (m.type === 'profiles') return ['查看哪位长辈', targetOptions('select-profile')];
    if (m.type === 'target') return ['为哪位长辈添加', targetOptions('select-target')];
    if (m.type === 'medicine') return [m.planId?'编辑药品打卡计划':'添加药品打卡计划', medicineForm()];
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
      if(!event||!canAccess(event.profileId))return ['无法记录','<p>任务不存在或无权访问。</p>'];
      const eligibility=m.correction?R.correctionEligibility(data,view.accountId,event):m.status==='not_taken'?R.notTakenEligibility(data,view.accountId,event):{allowed:true,reason:''};
      return [m.correction ? '确认更正' : '确认本次记录', `<p><strong>${esc(planFor(event).name)}</strong> · ${event.date} ${event.slot} ${event.scheduledTime}</p><p>将记录为：<strong>${STATUS[m.status]}</strong></p><div class="confirm-banner">${icon('info')}仅记录您本次的实际安排，不代表系统建议停药。</div>${eligibility.allowed?'':`<p class="helper-text" data-not-taken-reason>${esc(eligibility.reason)}</p>`}<div class="form-footer">${button('取消', 'close-modal', 'button-secondary')}${button(m.correction ? '确认更正' : '确认记录', 'confirm-dose', 'button-primary', eligibility.allowed?'':'disabled aria-disabled="true"')}</div>`];
    }
    if (m.type === 'plan-detail') {
      const p = data.medicationPlans.find(p => p.id === m.planId);
      return [esc(p.name), `<dl class="review-list"><dt>所属长辈</dt><dd>${esc(targetName())}</dd><dt>计划单次量</dt><dd>${esc(p.doseValue)} ${esc(p.doseUnit)}</dd><dt>服用时段</dt><dd>${p.slots.map(slot => `${slot} ${p.slotSettings[slot].time} ${esc(p.slotSettings[slot].meal || '')}`).join('<br>')}</dd><dt>开始日期</dt><dd>${p.startDate}</dd><dt>服用周期</dt><dd>${p.endDate ? `截至 ${p.endDate}` : '长期服用'}</dd><dt>来源</dt><dd>${esc(p.source)} · ${esc(author(p))}</dd><dt>备注</dt><dd>${esc(p.note || '无')}</dd><dt>状态</dt><dd>${p.status === 'active' ? '启用中' : '已停用'}</dd></dl><p class="helper-text">编辑或停用仅影响未开始时段，已开始任务保留原快照。</p>${p.status === 'active' ? `<div class="form-footer">${button('编辑计划', 'edit-plan', 'button-secondary')}${button('停用此计划', 'stop-plan', 'button-danger')}</div>` : ''}`];
    }
    if (m.type === 'stop-confirm') return ['停用用药计划？', `<p>${esc(data.medicationPlans.find(p => p.id === m.planId).name)}</p><p>仅取消未开始时段及未来任务；已开始任务保留原药名、剂量和安排，仍可补记。此操作不是医疗停药建议。</p><div class="form-footer">${button('取消', 'close-modal', 'button-secondary')}${button('确认停用计划', 'confirm-stop', 'button-danger')}</div>`];
    if (m.type === 'import') return ['模拟设备导入', `<p>记录对象：<strong>${esc(targetName())}</strong></p><p>将新增 3 条${TYPES[m.healthType].name}演示记录，来源标为“模拟设备导入”。</p><div class="confirm-banner">${icon('info')}预设数据，不连接设备，不用于健康判断。同一档案的同类示例不会重复导入。</div><div class="form-footer">${button('确认模拟导入', 'confirm-import')}</div>`];
    if (m.type === 'family') return ['我的家庭组', `<h3>${esc(family().name)}</h3><p>本地演示邀请码：<strong>${esc(family().inviteCode)}</strong></p><div class="target-list">${profiles().map(p => `<div class="setting-row"><span class="avatar">${esc(p.avatar)}</span><span>${esc(p.name)} · ${esc(account().role === 'elder' ? '本人' : p.relation)}</span></div>`).join('')}</div><div class="confirm-banner">${icon('lock')}本机模拟授权。子女可协助录入，不能代打卡；未接入真实身份验证。</div>`];
    if (m.type === 'notifications') {
      const logs = data.notificationLogs.filter(n => canAccess(n.profileId)&&(n.legacy||n.recipientId===view.accountId||n.fromAccountId===view.accountId)).slice().reverse();
      return ['模拟提醒记录', logs.length ? `<div class="record-list">${logs.map(n => `<article class="record-row"><div><strong>${esc(n.title||'历史模拟提醒')}</strong><span>${esc(n.text)}</span><span>${esc(displayTime(n.createdAt||n.sentAt))} · ${esc({delivered:'已展示（模拟）',pending:'待同步（模拟）',failed:'发送失败（模拟）',suppressed:'已抑制'}[n.deliveryState]||'历史模拟记录')}</span>${n.recipientId===view.accountId?button('查看最新记录','open-notice','text-button',`data-id="${esc(n.id)}"`):''}</div></article>`).join('')}</div>` : '<p>暂无模拟提醒记录</p>'];
    }
    if (m.type === 'about') return ['演示与隐私说明', '<p>本版本仅用于复客松演示，不提供医疗建议，不用于真实用药决策。</p><p>数据保存在此浏览器内，切换本地演示账号可查看同一份家庭记录。跨手机同步、微信登录、推送、设备连接均未接入真实服务。请勿录入真实患者信息或处方。</p><p>本地角色限制用于演示产品分工，不是生产环境的安全访问控制；共享此浏览器的人可以切换账号查看演示数据。</p>'];
    if (m.type === 'reset') return ['恢复初始演示数据？', '<p>将清除本原型中新增的账号、计划、打卡和身体数据，恢复张阿姨和小李的初始样例。其他网站的数据不受影响。</p><div class="form-footer">' + button('取消', 'close-modal', 'button-secondary') + button('确认恢复', 'confirm-reset', 'button-danger') + '</div>'];
    return ['提示', '<p>无法打开此内容。</p>'];
  }

  // 表单保留草稿，只有预览页的确认操作会写入共享数据。
  function hasPlanInput(d) {return !!(d.name||d.doseValue||d.doseUnit||d.slots.length||d.note||d.endDate);}
  function newMedicine(targetId) {
    const c=chatSession(`${view.accountId}|${targetId}`);
    if(c&&(hasPlanInput(c.plan)||c.planId)){c.intent='plan';openModal('medicine',{targetId,mode:'manual',draft:c.plan,chatKey:c.key,planId:c.planId});return;}
    openModal('medicine', { targetId, mode: 'manual', draft: emptyPlan() });
  }

  function medicineForm() {
    const d = modal.draft;
    return `${targetCaption()}<div class="mode-tabs" role="tablist" aria-label="药物录入方式">${button('手动输入','med-mode','mode-tab is-active','role="tab" aria-selected="true" data-value="manual"')}${button('AI语音输入','med-mode','mode-tab','role="tab" aria-selected="false" data-value="voice"')}</div><form data-form="medicine" novalidate>${medicineFields(d)}${errorBox()}<div class="form-footer">${submit('核对用药计划')}</div></form>`;
  }

  const required = label => `${label} <span class="required-star" aria-hidden="true">*</span>`;
  function targetCaption() {
    return `<p class="target-caption">记录对象：<strong>${esc(targetName())}</strong>${account().role==='child'&&!modal.planId&&!modal.chatKey?button('改选','change-target','text-button'):''}</p>`;
  }
  function medicineFields(d) {
    return `${input('name',required('药品名称'),d.name,'text','required maxlength="80" autocomplete="off"')}${input('doseValue',required('单次用量（请输入数字）'),d.doseValue,'number','required min="0.000001" step="any" inputmode="decimal"')}${input('doseUnit',required('用量单位'),d.doseUnit,'text','required maxlength="12" list="dose-units"')}<datalist id="dose-units">${['片','粒','包','袋','支','毫升','滴','喷','瓶'].map(u=>`<option value="${u}">`).join('')}</datalist>${slotFields(d)}${input('startDate',required('开始日期'),d.startDate,'date','required')}${select('duration',required('服用周期'),['长期服用','截至某日期'],d.duration)}${d.duration==='截至某日期'?input('endDate',required('结束日期'),d.endDate,'date','required'):''}${input('note','服用备注（选填）',d.note,'text','maxlength="240"')}<label class="consent-row"><input name="assisted" type="checkbox" ${d.assisted?'checked':''}><span>本次由家属协助录入</span></label>`;
  }
  function slotFields(d) {
    return `<fieldset class="slot-fieldset" data-field="slots"><legend>${required('服用时段')}</legend><div class="slot-grid"><div class="slot-head"><span>选择</span><span>时段</span><span>提醒推送</span><span>餐时<br><small>（选填）</small></span></div>${Object.entries(SLOTS).map(([slot,time])=>{const selected=d.slots.includes(slot);const setting=d.slotSettings[slot]||{time,meal:''};return `<div class="slot-line ${selected?'is-selected':''}"><label class="slot-checkbox"><input type="checkbox" name="slots" value="${slot}" aria-label="选择${slot}" ${selected?'checked':''}></label><span class="slot-name">${slot}<small>${{早餐:'05:00–11:00',午餐:'11:00–16:00',晚餐:'16:00–20:00',睡前:'20:00–24:00'}[slot]}</small></span><div class="slot-time" data-field="time-${slot}">${button(`${setting.time.slice(0,2)}<span>时</span>`,'time-picker','time-part',`data-slot="${slot}" data-part="hour" aria-label="${slot}提醒小时"`)}${button(`${setting.time.slice(3)}<span>分</span>`,'time-picker','time-part',`data-slot="${slot}" data-part="minute" aria-label="${slot}提醒分钟"`)}<span class="required-star" aria-hidden="true">${selected?'*':''}</span></div><div class="meal-segment" role="group" aria-label="${slot}餐时">${['餐前','餐后'].map(meal=>button(meal,'meal',setting.meal===meal?'is-selected':'',`data-slot="${slot}" data-meal="${meal}" aria-pressed="${setting.meal===meal}" ${selected?'':'disabled'}`)).join('')}</div></div>`;}).join('')}</div><p id="frequency" class="helper-text">每天 ${d.slots.length} 次，各时段单次用量相同</p></fieldset>`;
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
    openModal('health-form',{targetId,healthType:type,draft:emptyHealth()});
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
    if(modal?.type==='chat'&&field.name==='message'){const c=chatSession();if(c)c.input=field.value;return;}
    if(modal?.picker && ['hour','minute'].includes(field.name)) {
      modal.picker[field.name]=Number(field.value);
      const wheel=app.querySelector(`[data-wheel="${field.name}"]`);wheel.dataset.userScrolling='false';
      if(field.validity.valid)wheel.scrollTop=(Number(field.value)-Number(wheel.dataset.first))*44;
      return;
    }
    if((modal?.type==='medicine'||modal?.type==='chat') && field.closest('[data-form="medicine"],[data-form="chat-plan"]')) {
      modal.draft=collectMedicine(field.closest('form'));
      const c=chatSession();if(c){c.plan=modal.draft;c.sources[field.name]='手动修改';c.plan.source=withSource(c.plan.source,'手动修改');if(['doseValue','doseUnit'].includes(field.name))delete c.planIssues?.dose;}
      if(modal.errors) { reconcileMedicineErrors();paintErrors(); }
    }
    if(modal?.type==='health-form' && field.closest('[data-form="health"]') && field.name!=='healthType'){
      modal.draft=collectHealth(field.closest('form'));
      const c=chatSession();if(c){
        modal.draft.source=withSource(modal.draft.source,'手动修改');
        // 只有本人在标明单位的对应字段作出有效修改，才解除该字段的解析冲突。
        if(c.healthConflicts?.[field.name]&&TYPES[modal.healthType].fields.some(([key])=>key===field.name)&&field.value!==''&&field.validity.valid&&Number.isFinite(Number(field.value))){
          delete c.healthConflicts[field.name];c.healthIssues=Object.values(c.healthConflicts);
          const error=document.getElementById('form-error');if(error?.textContent.includes('单位无法确认'))error.textContent=c.healthIssues.join(' ');
        }
      }
      syncChatDraft();
    }
  });

  function collectHealth(form) {
    const fd = new FormData(form);
    const values = {};
    TYPES[modal.healthType].fields.forEach(([key]) => { if (fd.get(key) !== '') values[key] = fd.get(key); });
    return { ...modal.draft,values, measuredAt: fd.get('measuredAt'), note: String(fd.get('note') || '').trim(), assisted: fd.has('assisted'), extras: modal.draft.extras.map((_, i) => ({ name: String(fd.get(`extraName${i}`) || '').trim(), value: fd.get(`extraValue${i}`), unit: String(fd.get(`extraUnit${i}`) || '').trim() })) };
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
    const context=modal?.type==='focus'?clone(modal):modal?.focusContext;
    const chatKey=chatSession()?.key;
    if(chatKey&&!options.inputSource)options={...options,inputSource:'助手卡片本人确认'};
    let operation;
    if (!commit(next => { operation = R.recordDose(next, view.accountId, eventId, status, options); })) return false;
    clearTimeout(undoTimer);
    undo = { ...operation, accountId: view.accountId, expires: Date.now() + 5000 };
    undoTimer = setTimeout(() => { undo = null; }, 5000);
    if(chatKey)chatSaved(chatKey,`已将这次记录为“${STATUS[status]}”，可以在5秒内撤销。`,eventId);else advanceFocus(context,eventId);
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
    if(form.dataset.form==='chat'){sendChat();return;}
    if (!['medicine','chat-plan'].includes(form.dataset.form) && !form.reportValidity()) return;
    const fd = new FormData(form);
    if (form.dataset.form === 'time-picker' && modal?.picker) {
      const hour=Number(fd.get('hour')),minute=Number(fd.get('minute'));
      const time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
      const [start,end]=R.RANGES[modal.picker.slot];
      if (!Number.isInteger(hour)||!Number.isInteger(minute)||!R.validTime(time)||R.minute(time)<start||R.minute(time)>=end) return formError('提醒时间必须在当前自然时段内。');
      const slot=modal.picker.slot;modal.draft.slotSettings[slot].time=time;modal.draft.slotSettings[slot].reminderTime=time;const c=chatSession();if(c)delete c.planIssues?.[`time-${slot}`];modal.picker=null;reconcileMedicineErrors();renderModal();return;
    }
    if (form.dataset.form === 'clock') {
      const time = fd.get('time');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return formError('请输入有效时间。');
      if (!commit(next => { R.setClock(next, Number(fd.get('dateOffset')), time); })) return;
      closeModal(false); render(); return;
    }
    if (['medicine','chat-plan'].includes(form.dataset.form)) {
      const draft = collectMedicine(form);
      modal.draft = draft;
      const c=chatSession();if(c)c.plan=draft;
      modal.errors=c?chatPlanProblems(c):R.planErrors(draft);
      if (Object.keys(modal.errors).length) { modal.errorLayer=true;renderModal();return; }
      modal.type = 'medicine-confirm'; renderModal(); return;
    }
    if (form.dataset.form === 'health') {
      const draft = collectHealth(form);
      if(chatSession()?.healthIssues?.length)return formError(`${chatSession().healthIssues.join(' ')}请按表单标注单位修正对应指标，或回到对话补充明确单位。`);
      if (!Object.keys(draft.values).length && !draft.extras.length) return formError('请至少填写一项测量值。');
      if ([...Object.values(draft.values), ...draft.extras.map(e => e.value)].some(v => v === '' || !Number.isFinite(Number(v)) || Number(v) < 0)) return formError('测量值必须是非负数字。');
      if (modal.healthType==='body' && ['height','weight'].some(k=>draft.values[k]!=null && !(Number(draft.values[k])>0))) return formError('身高和体重必须大于 0，并按标注单位填写。');
      if (modal.healthType === 'blood_pressure' && !(Number(draft.values.systolic) > Number(draft.values.diastolic))) return formError('请核对：收缩压需要大于舒张压。');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.measuredAt) || draft.measuredAt > `${today()}T${data.demoTime}`) return formError('测量时间不能晚于当前演示时间。');
      if (draft.extras.some(e => !e.name || !e.unit)) return formError('请填写附加指标的名称和单位。');
      const names = [...TYPES[modal.healthType].fields.map(([, label]) => label), ...draft.extras.map(e => e.name)];
      if (new Set(names).size !== names.length) return formError('指标名称不能重复。');
      modal.draft = draft;syncChatDraft();modal.type = 'health-confirm'; renderModal(); return;
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
    if(field.dataset.noticeOption)return applyDemoOptions({[field.dataset.noticeOption]:field.checked});
    if (field.id === 'history-date' && field.value) { view.historyDate = field.value; render(); return; }
    if (!modal) return;
    if(field.hasAttribute('data-chat-example')){const c=chatSession();if(c)c.example=field.value;return;}
    if (modal.picker) return;
    if (['medicine','chat'].includes(modal.type) && field.closest('[data-form="medicine"],[data-form="chat-plan"]')) {
      modal.draft = collectMedicine(field.closest('form'));
      const c=chatSession();if(c){c.plan=modal.draft;c.sources[field.name]='点选／手动';c.plan.source=withSource(c.plan.source,'手动修改');if(field.name==='slots')c.pendingSlots=null;}
      reconcileMedicineErrors();paintErrors();
      if (field.name === 'slots') {
        const slot=field.value;renderModal();app.querySelector(`[name="slots"][value="${slot}"]`)?.focus({preventScroll:true});
      }
      if (field.name === 'duration') renderModal();
    }
    if (modal.type === 'health-form' && field.name === 'healthType') {
      modal.healthType = Object.keys(TYPES).find(key => TYPES[key].name === field.value);
      modal.draft = { ...emptyHealth(),source:modal.draft.source };syncChatDraft();renderModal();
    }
    if (modal.type === 'onboarding' && field.name === 'familyMode') { modal.draft.familyMode = field.value; renderModal(); }
  });

  app.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const value = target.dataset.value;
    const itemId = target.dataset.id;
    if(['assistant','voice-experience'].includes(action)&&suppressLongClick){suppressLongClick=false;event.preventDefault();return;}
    if(action==='assistant')return openChat('home','text');
    if(action==='chat-mode'){const c=chatSession();if(c){c.mode=target.dataset.mode;renderModal();}return;}
    if(action==='chat-profile'){preserveDraft();return openModal('profiles');}
    if(action==='chat-intent'){const c=chatSession();if(c){chatIntent(c,target.dataset.intent);renderModal();}return;}
    if(action==='chat-task'){const c=chatSession(),e=data.doseEvents.find(e=>e.id===itemId);if(c&&e&&e.profileId===c.targetId&&canAccess(e.profileId)){c.selectedId=itemId;c.cards=[];c.ambiguous=false;chatMessage(c,`已选择 ${e.snapshot.name} · ${e.date} ${e.slot}，计划 ${e.snapshot.doseValue} ${e.snapshot.doseUnit}，提醒 ${e.scheduledTime}。请按实际情况操作。`);renderModal();}return;}
    if(action==='chat-confirm-slots'){const c=chatSession();if(c){c.plan.slots=['早餐','晚餐'];c.pendingSlots=null;c.sources.slots='用户点选确认';chatMessage(c,chatPlanQuestion(c));renderModal();}return;}
    if(action==='chat-form-plan')return chatOpenForm('plan');
    if(action==='chat-form-health')return chatOpenForm('health');
    if(action==='chat-view'){preserveDraft();return navigate(target.dataset.page);}
    if(action==='chat-dismiss-followup'){const c=chatSession();if(c){c.selectedId=null;c.followup=false;chatMessage(c,'这项暂不处理，刚保存的记录不受影响。');renderModal();}return;}
    if(action==='voice-experience')return previewVoice();
    if(action==='voice-cancel'){const c=chatSession();if(c){c.input=c.beforePreview||'';c.preview=null;c.status='已取消';renderModal();}return;}
    if(action==='chat-clear'){const c=chatSession();if(c){c.input='';c.preview=null;c.status='等待输入';renderModal();app.querySelector('#chat-input')?.focus();}return;}
    if (action === 'navigate') return navigate(target.dataset.page);
    if(action==='resume-draft')return resumeDraft();
    if(action==='view-focus-task'&&modal?.type==='focus')return viewFocusTask();
    if(action==='open-notice') {
      const n=data.notificationLogs.find(n=>n.id===itemId);if(!n)return;
      try {openNotification({notificationId:n.id,eventId:n.eventId,profileId:n.profileId,date:n.date,recipientId:n.recipientId});}catch(error){toast(error.message,'warning');}return;
    }
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
      const slot=target.dataset.slot,setting=modal.draft.slotSettings[slot];setting.meal=setting.meal===target.dataset.meal?'':target.dataset.meal;const c=chatSession();if(c){delete c.planIssues?.[`meal-${slot}`];delete c.planIssues?.meal;}reconcileMedicineErrors();renderModal();return;
    }
    if (action === 'close-modal') return closeModal();
    if (['accounts', 'clock', 'family', 'about', 'notifications', 'notification-settings', 'reset'].includes(action)) {preserveDraft();return openModal(action);}
    if (action === 'profiles' && account().role === 'child') return openModal('profiles');
    if (action === 'switch-account' && data.accounts.some(a => a.id === itemId)) return switchAccount(itemId);
    if (action === 'select-profile' && account().role === 'child' && canAccess(itemId)) return switchProfile(itemId);
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
    if (action==='select-target' && canAccess(itemId) && modal?.returnModal) { const previous=modal.returnModal;selectTargetForChild(itemId);openModal(previous.type,{...previous,targetId:itemId});return; }
    if (action === 'med-mode' && modal?.type === 'medicine' && value==='manual') { modal.mode = value; renderModal(); return; }
    if (action === 'med-mode' && modal?.type === 'medicine' && value==='voice') return openChat('plan','voice');
    if (action === 'edit-med' && modal?.type === 'medicine-confirm') { modal.type = 'medicine'; renderModal(); return; }
    if (action === 'save-med' && modal?.type === 'medicine-confirm' && canAccess(modal.targetId)) {
      const d = modal.draft; const pid = modal.targetId;
      const editing = chatSession()?.planId||modal.planId;
      const c=chatSession();if(c&&Object.keys(chatPlanProblems(c)).length)return toast('草稿仍有未解决的信息，请返回修改。','warning');
      if (commit(next => { R.savePlan(next, view.accountId, { ...d, source: `${d.source||'手动输入'}${d.assisted?' · 家属协助':''}` }, pid, editing); })) { clearSavedDraft();view.planTab = 'active';selectTargetForChild(pid);if(c){c.plan=emptyPlan();c.planId=null;c.expectedTimes=null;c.pendingSlots=null;c.planIssues={};chatSaved(c.key,`${d.name}计划已${editing?'修改':'创建'}，仅生成适用任务，尚未声明服药。`);}else navigate('plans');toast(editing ? '未来计划已更新，已开始任务保留。' : '用药计划已创建。'); } return;
    }
    if (action === 'edit-health' && modal?.type === 'health-confirm') { modal.type = 'health-form'; renderModal(); return; }
    if (action === 'save-health' && modal?.type === 'health-confirm' && canAccess(modal.targetId)) {
      const d = modal.draft; const pid = modal.targetId; const type = modal.healthType;
      const c=chatSession();
      if (commit(next => next.healthRecords.push({ id: id('health'), profileId: pid, type, values: Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, Number(v)])), extras: d.extras.map(e => ({ ...e, value: Number(e.value) })), measuredAt: d.measuredAt.replace('T', ' '), note: d.note, source: `${d.source||'手动输入'}${d.assisted?' · 家属协助':''}`, assisted: d.assisted, createdBy: view.accountId, createdAt: now() }))) { clearSavedDraft();view.healthType = type;selectTargetForChild(pid);if(c){c.health=emptyHealth();chatSaved(c.key,`${TYPES[type].name}测量记录已保存，首页和身体数据已更新。`);}else navigate('health');toast('测量记录已保存。'); } return;
    }
    if (['add-extra', 'remove-extra'].includes(action) && modal?.type === 'health-form') {
      modal.draft = collectHealth(document.querySelector('[data-form="health"]'));
      if (action === 'add-extra' && modal.draft.extras.length < 8) modal.draft.extras.push({ name: '', value: '', unit: '' });
      if (action === 'remove-extra') modal.draft.extras.splice(Number(target.dataset.index), 1);
      syncChatDraft();renderModal(); return;
    }
    if (action === 'take') return recordDose(itemId, 'taken');
    if (action === 'declare' && target.dataset.status === 'not_taken') {
      const e=data.doseEvents.find(e=>e.id===itemId),eligibility=R.notTakenEligibility(data,view.accountId,e);
      if(!eligibility.allowed){toast(eligibility.reason,'warning');return;}
      return openModal('dose-confirm',{eventId:itemId,status:'not_taken',focusContext:modal?.type==='focus'?clone(modal):null,chatKey:chatSession()?.key});
    }
    if (['task-detail', 'correct-dose'].includes(action)) {
      const e = data.doseEvents.find(e => e.id === itemId);
      if (e && canAccess(e.profileId) && (action !== 'correct-dose' || account().role === 'elder')) openModal(action, { eventId: itemId,chatKey:chatSession()?.key,targetId:e.profileId });
      return;
    }
    if (action === 'choose-correction' && modal?.type === 'correct-dose' && account().role === 'elder') return openModal('dose-confirm', { eventId: modal.eventId, status: target.dataset.status, correction: true,chatKey:modal.chatKey });
    if (action === 'snooze') {
      const context=modal?.type==='focus'?clone(modal):null;
      const c=chatSession();if (commit(next => { R.snooze(next, view.accountId, itemId, Number(target.dataset.minutes)); })) {if(c){chatMessage(c,`已设置稍后提醒至 ${displayTime(data.doseEvents.find(e=>e.id===itemId).snoozeUntil)}。原时段和服药事实不变。${data.simulationMode==='offline'?'本机已保存，家属侧待同步（模拟）。':''}`);render();}else advanceFocus(context,itemId);toast('已设置稍后提醒，原任务与服药事实不变。'); }
      return;
    }
    if (action === 'dose-confirm') {
      const e = data.doseEvents.find(e => e.id === itemId);
      if (e && R.canDeclare(data, view.accountId, e) && !resolved(e) && target.dataset.status === 'skipped') openModal('dose-confirm', { eventId: itemId, status: 'skipped',focusContext:modal?.type==='focus'?clone(modal):null,chatKey:chatSession()?.key });
      return;
    }
    if (action === 'confirm-dose' && modal?.type === 'dose-confirm') return recordDose(modal.eventId, modal.status, { correction: !!modal.correction,actual:modal.actual||null,inputSource:chatSession()?'助手内本人确认':'手动' });
    if (action === 'undo' && undo && Date.now() <= undo.expires && undo.accountId === view.accountId) {
      const saved = undo;
      if (commit(next => { R.undoDose(next, view.accountId, saved); })) { undo = null; render(); toast('本次打卡已撤销，延后次数和提醒冷却不变。'); } return;
    }
    if (action === 'remind' && account().role === 'child') {
      const e = data.doseEvents.find(e => e.id === itemId);
      const reason = R.reminderReason(data, view.accountId, e);
      if (reason) { toast(reason, 'warning'); return; }
      if(commit(next=>R.sendN3(next,view.accountId,e.id,id('request')))) {render();toast('已生成模拟提醒，未发送真实消息。');} return;
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
      drafts.clear();sessionViews.clear();conversations.clear();dismissedFocus.clear();shownBanners.clear();visitId=id('visit');
      data = seed(); view = { accountId: 'elder-zhang', page: 'home', healthType: 'blood_pressure', planTab: 'active', historyDate: DAY }; undo = null; overdueOpen = false;commit(()=>{});navigate('home');publishState();toast('已恢复初始演示数据。');
    }
  });

  function selectTargetForChild(pid) {
    if (account().role === 'child') commit(next => { next.accounts.find(a => a.id === view.accountId).selectedProfileId = pid; });
  }

  document.addEventListener('keydown', event => {
    document.documentElement.dataset.input='keyboard';
    if (!modal) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...document.querySelectorAll('.modal-sheet button:not([disabled]), .modal-sheet input:not([disabled]), .modal-sheet select, .modal-sheet textarea')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('modal-sheet'))) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.addEventListener('pointerdown',()=>{document.documentElement.dataset.input='pointer';});

  window.addEventListener('storage', event => {
    if (event.key !== DATA_KEY) return;
    // 保存工作草稿；恢复后仍在最终确认时检查权限和计划版本。
    preserveDraft();
    data = load();
    if (!data.accounts.some(a => a.id === view.accountId)) view.accountId = data.accounts[0].id;
    undo = null;
    closeModal(false);
    render();
    toast('本地演示数据已更新。');
  });

  document.body.classList.toggle('is-embedded',Bridge.embedded);
  if(Bridge.embedded){app.style.visibility='hidden';app.inert=true;}
  render();
  Bridge.start(handleDemoMessage,bridgeState());
  commit(()=>{});
  window.addEventListener('beforeunload',event=>{if(workModal(modal)||drafts.size){event.preventDefault();event.returnValue='';}});
})();
