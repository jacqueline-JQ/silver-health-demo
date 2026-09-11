async (page,{handleDialogs=true,artifactDir='output/playwright/step-03'}={}) => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
  const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));if(handleDialogs)page.on('dialog',dialog=>dialog.accept());
  const ok=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
  try {
  await page.goto(`${BASE_URL}/index.html`);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(`${BASE_URL}/demo.html`);
  await page.waitForFunction(()=>document.querySelector('#ready-status').textContent.includes('已就绪'));
  const frame=page.frames().find(f=>f.url().includes('index.html?demo=1'));
  const click=a=>frame.locator(`[data-action="${a}"]:visible`).first().click();
  const nav=p=>frame.locator(`[data-action="navigate"][data-page="${p}"]`).click();
  const state=()=>frame.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')));
  const control=async(type,payload={})=>page.evaluate(({type,payload})=>new Promise((resolve,reject)=>{
    const requestId=`test-${Date.now()}-${Math.random()}`,iframe=document.getElementById('app-frame');
    const timer=setTimeout(()=>{window.removeEventListener('message',handler);reject(Error(`ACK timeout ${type}`));},5000);
    function handler(e){if(e.source===iframe.contentWindow&&e.data?.type==='ACK'&&e.data.requestId===requestId){clearTimeout(timer);window.removeEventListener('message',handler);resolve(e.data.payload);}}
    window.addEventListener('message',handler);iframe.contentWindow.postMessage({channel:'yaoanxin-demo',version:1,type,payload,requestId},location.origin);
  }),{type,payload});
  const clock=(time,dateOffset=0)=>control('CLOCK',{time,dateOffset});
  const switchTo=async accountId=>{const response=await control('SWITCH_ACCOUNT',{accountId});ok(response.ok,`显式切换 ${accountId}`);};
  const show=async()=>{await page.locator('#open-app').click();await frame.waitForFunction(()=>!document.getElementById('app').inert);};const desktop=async()=>{await page.locator('#show-desktop').click();await frame.waitForFunction(()=>document.getElementById('app').inert);};
  const closeFocus=async()=>{if(await frame.locator('#modal-root .focus-sheet').count())await click('close-modal');};
  const openNotice=n=>control('OPEN_NOTIFICATION',{notificationId:n.id,eventId:n.eventId,profileId:n.profileId,date:n.date,recipientId:n.recipientId});
  await frame.evaluate(()=>{window.__instanceMarker='same-instance';});
  ok(await frame.locator('html').getAttribute('data-os')==='ios','内外iOS主题就绪');
  ok(await page.locator('#app-container').getAttribute('inert')!==null && await frame.locator('#app').getAttribute('inert')!==null,'桌面隐藏应用内外均inert');
  const seeded=await state(),sleep=seeded.doseEvents.find(e=>e.date==='2026-09-13'&&e.slot==='睡前');
  await page.locator('#banner-close').click();await show();ok(await frame.locator('#modal-root .focus-sheet').count()===1,'前台当前时段到点自动聚焦');
  await closeFocus();ok(await frame.locator('.nav-item.is-active[data-page="home"]').count()===1,'关闭提醒返回长辈首页');
  ok((await state()).doseEvents.find(e=>e.id===sleep.id).status==='pending','关闭不写入声明');
  await nav('home');ok(await frame.locator('#modal-root .focus-sheet').count()===0,'同轮关闭后导航不重弹');
  await clock('07:55');await nav('home');ok(await frame.locator('#modal-root .focus-sheet').count()===0,'提醒点之前不自动聚焦');
  await click('home-add-med');await frame.locator('[name="name"]').fill('通知打断时的草稿');await frame.locator('[name="doseValue"]').fill('0.5');await frame.locator('[name="doseUnit"]').fill('片');await frame.locator('[name="slots"][value="午餐"]').check();
  await desktop();await page.locator('[data-os="ios"]:is(button)').click();await page.waitForFunction(()=>document.querySelector('#ready-status').textContent.includes('已就绪'));await show();
  ok(await frame.evaluate(()=>window.__instanceMarker)==='same-instance' && await frame.locator('[name="name"]').inputValue()==='通知打断时的草稿','回桌面与重新确认主题不重载且保留表单');
  await clock('21:15');ok(await frame.locator('[data-form="medicine"]').count()===1,'填表中到点不抢占草稿');
  await desktop();await page.locator('[data-scene="N1"]').click();await page.locator('#banner-open').click();await frame.locator('#modal-root .focus-sheet').waitFor();
  ok(await frame.locator('#modal-root .focus-sheet').count()===1,'横幅进入任务提醒页');await closeFocus();await click('resume-draft');
  ok(await frame.locator('[name="name"]').inputValue()==='通知打断时的草稿' && await frame.locator('[name="slots"][value="午餐"]').isChecked(),'通知处理后恢复文字与点选草稿');
  await switchTo('child-li');ok(!(await frame.locator('body').innerText()).includes('通知打断时的草稿'),'不同账号不泄露草稿');await switchTo('elder-zhang');
  ok(await frame.locator('#modal-root [data-form]').count()===0&&await frame.locator('[data-action="resume-draft"]').count()===1,'返回原账号先落首页并显示继续入口');await click('resume-draft');ok(await frame.locator('[name="name"]').inputValue()==='通知打断时的草稿','显式继续后恢复原账号工作草稿');await click('close-modal');
  let n=(await state()).notificationLogs.find(n=>n.kind==='N1'&&n.eventId===sleep.id);await openNotice(n);const beforeClose=JSON.stringify((await state()).doseEvents.find(e=>e.id===sleep.id));await closeFocus();ok(await frame.locator('.nav-item.is-active[data-page="home"]').count()===1&&JSON.stringify((await state()).doseEvents.find(e=>e.id===sleep.id))===beforeClose,'关闭通知回首页且不改任务事实');
  await openNotice(n);await frame.locator('#modal-root [data-action="view-focus-task"]').click();await frame.locator(`[data-task-id="${sleep.id}"] [data-action="task-detail"]`).click();await frame.getByRole('dialog').locator('[data-action="take"]').click();
  ok((await state()).doseEvents.find(e=>e.id===sleep.id).status==='taken','查看对应任务后从列表本人打卡');await click('undo');
  await openNotice(n);ok(await frame.getByRole('dialog').locator('[data-action="declare"]').isDisabled()&&(await frame.getByRole('dialog').innerText()).includes('尚未到截止时间')&&(await state()).doseEvents.find(e=>e.id===sleep.id).status==='pending','提醒页在睡前原截止前阻止未服用且不写事实');await click('close-modal');
  await openNotice(n);ok(await frame.getByRole('dialog').locator('[data-action="take"]').count()===1 && (await frame.getByRole('dialog').innerText()).includes('待打卡'),'旧N1读取最新待打卡状态且不绕过截止规则');await click('close-modal');
  await switchTo('child-li');await nav('home');ok(await frame.locator('[data-action="take"], [data-action="snooze"], [data-action="correct-dose"]').count()===0,'子女无本人声明、延后和更正按钮');
  const overdue=(await state()).doseEvents.find(e=>e.slot==='晚餐'&&e.status==='pending'&&e.profileId==='profile-zhang');
  const n2=(await state()).notificationLogs.find(n=>n.kind==='N2'&&n.eventId===overdue.id);ok(n2&&n2.recipientId==='child-li','N2正确发给已授权子女');
  await openNotice(n2);ok(await frame.locator('#history-date').inputValue()===overdue.date,'N2打开对应对象历史');
  const row=frame.locator(`[data-task-id="${overdue.id}"]`);await row.locator('[data-action="remind"]').click();const afterN3=await state();const n3=afterN3.notificationLogs.find(n=>n.kind==='N3'&&n.eventId===overdue.id);
  ok(n3&&n3.recipientId==='elder-zhang'&&n3.text.includes('尚未记录'),'子女动作生成带任务事实的N3');ok(await row.locator('[data-action="remind"]').isDisabled(),'5分钟冷却即时禁用');
  const n3At=afterN3.doseEvents.find(e=>e.id===overdue.id).n3LastAt;await switchTo('elder-zhang');await closeFocus();if(await frame.getByRole('dialog').count())await click('close-modal');await openNotice(n3);
  await frame.getByRole('dialog').locator('[data-action="snooze"][data-minutes="5"]').click();ok((await state()).doseEvents.find(e=>e.id===overdue.id).snoozeUsed===1,'已超时任务仍可使用一次延后');
  await switchTo('child-li');await nav('home');await click('history');const protectedRow=frame.locator(`[data-task-id="${overdue.id}"]`);ok(await protectedRow.locator('[data-action="remind"]').isDisabled()&&(await protectedRow.innerText()).includes('正在延后'),'延后保护内N3被抑制并说明原因');
  const beforeRounds=(await state()).notificationLogs.filter(n=>n.kind==='N2'&&n.eventId===overdue.id).length;await clock('21:19');ok((await state()).notificationLogs.filter(n=>n.kind==='N2'&&n.eventId===overdue.id).length===beforeRounds,'保护期内不新增N2');await clock('21:20');ok((await state()).notificationLogs.filter(n=>n.kind==='N2'&&n.eventId===overdue.id).length===beforeRounds+1,'保护结束后新增超时轮次');
  const logCount=(await state()).notificationLogs.length;await control('SCENE',{kind:'N2'});await control('SCENE',{kind:'N2'});ok((await state()).notificationLogs.length===logCount,'重复触发不重复通知');
  await page.locator('#replay-notice').click();ok((await state()).notificationLogs.length===logCount&&(await state()).doseEvents.find(e=>e.id===overdue.id).n3LastAt===n3At,'重播不增记录或重置冷却');
  await control('OPTIONS',{privatePreview:true});await page.locator('#replay-notice').click();ok(await page.locator('#banner-body').innerText()==='您有一条用药记录提醒','隐私预览不显示药名剂量');
  await control('OPTIONS',{notificationsEnabled:false});ok(!(await page.locator('#banner').getAttribute('class')).includes('is-visible'),'关闭通知立即收回横幅');const beforeOff=(await state()).notificationLogs.length;await clock('21:30');ok((await state()).notificationLogs.length===beforeOff,'关通知不生成新提醒');await control('OPTIONS',{notificationsEnabled:true,privatePreview:false});
  const rawBefore=JSON.stringify(await state());await page.evaluate(()=>{const w=document.getElementById('app-frame').contentWindow;const base={channel:'yaoanxin-demo',version:1,requestId:'bad',type:'CLOCK',payload:{dateOffset:3,time:'10:00'}};w.postMessage({...base,version:2},location.origin);w.postMessage({...base,type:'EVAL',payload:{code:'x'}},location.origin);w.postMessage({...base,payload:{dateOffset:999,time:'10:00'}},location.origin);});
  await frame.evaluate(()=>{window.postMessage({channel:'yaoanxin-demo',version:1,requestId:'wrong-source',type:'CLOCK',payload:{dateOffset:3,time:'10:00'}},location.origin);window.dispatchEvent(new MessageEvent('message',{origin:'https://wrong.example',source:parent,data:{channel:'yaoanxin-demo',version:1,requestId:'wrong-origin',type:'CLOCK',payload:{dateOffset:3,time:'10:00'}}}));});await page.waitForTimeout(50);
  ok(JSON.stringify(await state())===rawBefore,'错误版本类型参数窗口与来源不修改数据');
  const forbidden=await openNotice(n3);ok(forbidden.ok===false,'非接收账号打不开长辈通知');
  await page.evaluate(()=>{const w=document.getElementById('app-frame').contentWindow,m={channel:'yaoanxin-demo',version:1,requestId:'same-clock-id',type:'CLOCK',payload:{dateOffset:0,time:'21:31'}};w.postMessage(m,location.origin);w.postMessage(m,location.origin);w.postMessage({...m,payload:{dateOffset:7,time:'10:00'}},location.origin);});await page.waitForTimeout(50);ok((await state()).demoTime==='21:31'&&(await state()).dateOffset===0,'相同请求ID重复只执行首次且拒绝改参数');
  await switchTo('elder-zhang');await closeFocus();if(await frame.getByRole('dialog').count())await click('close-modal');
  // 专门准备只剩睡前的一日，确认时间和接收时间通过真实界面控制。
  ok((await control('RESET_REQUEST')).ok,'第一次恢复请求被应用接受');await click('confirm-reset');await closeFocus();await clock('23:55');await nav('plans');await click('history');
  const todayTasks=(await state()).doseEvents.filter(e=>e.profileId==='profile-zhang'&&e.date==='2026-09-13');
  for(const e of todayTasks.filter(e=>e.slot!=='睡前'&&e.status!=='taken')){await frame.locator(`[data-task-id="${e.id}"] [data-action="task-detail"]`).click();if(await frame.getByRole('dialog').locator('[data-action="take"]').count())await frame.getByRole('dialog').locator('[data-action="take"]').click();else await click('close-modal');}
  await control('OPTIONS',{simulationMode:'offline'});const sleepNow=(await state()).doseEvents.find(e=>e.slot==='睡前'&&e.date==='2026-09-13');await frame.locator(`[data-task-id="${sleepNow.id}"] [data-action="task-detail"]`).click();await frame.getByRole('dialog').locator('[data-action="take"]').click();
  ok((await frame.locator('body').innerText()).includes('待同步（模拟）'),'离线本机确认标记待同步');await clock('00:10',1);const preSync=await state();ok(preSync.notificationLogs.some(n=>n.eventId===sleepNow.id&&n.kind==='N2'&&n.text.includes('暂未收到记录')),'跨日模拟远端未接收仍有N2说明');
  await control('SYNC');await control('SYNC');const synced=(await state()).doseEvents.find(e=>e.id===sleepNow.id);ok(synced.changes.length===1&&synced.recordedAt.includes('2026-09-13T23:55')&&synced.changes[0].receivedAt.includes('2026-09-14T00:10'),'重复跨日同步不重复声明且保留原时间');
  await switchTo('child-li');await nav('home');ok(await frame.locator('.calendar-date.has-star[data-date="2026-09-13"]').count()===1,'当日离线确认在历史日历仍点星');
  for(const width of [360,1280])for(const font of ['normal','elder']) {
    await page.setViewportSize({width,height:1000});await show();if(await frame.getByRole('dialog').count())await click('close-modal');await nav('me');await frame.locator(`[data-action="font"][data-value="${font}"]`).click();await nav('home');
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`舞台无横向溢出 ${width}/${font}`);
    ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`内层无横向溢出 ${width}/${font}`);
    await page.screenshot({path:`${artifactDir}/app-${width}-${font}.png`,animations:'disabled'});await desktop();await page.screenshot({path:`${artifactDir}/desktop-${width}-${font}.png`,animations:'disabled'});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await show();ok(await page.locator('#app-container').evaluate(el=>getComputedStyle(el).transform)==='none','减少动态效果取消空间移动');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#open-app').click();await page.locator('#show-desktop').click();await page.locator('#open-app').click();ok(await frame.evaluate(()=>window.__instanceMarker)==='same-instance','快速开关不重建iframe');
  await control('RESET_REQUEST');await click('confirm-reset');await closeFocus();const reset=await state();ok(reset && !reset.dateOffset&&!reset.notificationLogs.some(n=>n.kind==='N3')&&reset.doseEvents.every(e=>!e.snoozeUsed&&!e.n3LastAt),'恢复初始清理偏移冷却延后与通知');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#ready-status').textContent.includes('已就绪'));const resetFrame=page.frames().find(f=>f.url().includes('index.html?demo=1'));
  const reloaded=await resetFrame.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')));ok(reloaded.dateOffset===0&&reloaded.demoTime==='21:15'&&reloaded.notificationStyle==='ios'&&reloaded.accounts.length===2&&reloaded.simulationMode==='online','恢复后刷新仍是初始设置账号与已校验存档');
  ok(await resetFrame.locator('[data-action="resume-draft"]').count()===0,'恢复后清空全部工作草稿');
  ok(errors.length===0,`脚本错误 ${errors.length}`);return {passed:checks.length,checks,errors};
  }catch(error){throw Error(`最后通过：${checks.at(-1)}；${error.message}`);}
}
