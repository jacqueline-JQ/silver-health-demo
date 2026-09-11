async(page,{artifactDir='output/playwright/mvp-v3-stage-01'}={})=>{
  const BASE_URL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
  const checks=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  const ok=(value,label)=>{if(!value)throw Error(`${label}；最后通过 ${checks.at(-1)}`);checks.push(label);};
  await page.goto(`${BASE_URL}/index.html`);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.goto(`${BASE_URL}/demo.html`);await page.waitForFunction(()=>document.querySelector('#ready-status').textContent.includes('已就绪'));
  let frame=page.frames().find(candidate=>candidate.url().includes('index.html?demo=1'));
  await frame.evaluate(()=>{const data=MedRules.prepareSeed(SILVER_SEED_DATA),event=data.doseEvents.find(item=>item.id==='event-metformin-breakfast'),plan=data.medicationPlans.find(item=>item.id===event.planId);data.medicationPlans=[plan];Object.assign(event,{status:'pending',recordedAt:null,recordedBy:null,actual:null,changes:[],changeToken:null,cancelledAt:null,snoozeUsed:0,snoozedAt:null,snoozeUntil:null,n3LastAt:null,started:true});delete event.snoozeSyncState;delete event.snoozeReceivedAt;data.doseEvents=[event];data.notificationLogs=[];data.demoTime='08:59';data.dateOffset=0;data.simulationMode='online';if(!MedRules.validData(data))throw Error('P0-08 fixture invalid');localStorage.setItem('silver-health-data-v1',JSON.stringify(data));sessionStorage.setItem('silver-health-view-v1',JSON.stringify({accountId:'elder-zhang'}));});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#ready-status').textContent.includes('已就绪'));frame=page.frames().find(candidate=>candidate.url().includes('index.html?demo=1'));
  await page.locator('details.advanced-controls summary').click();
  const state=()=>frame.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')));
  const setMode=async mode=>{await page.locator('#simulation-mode').selectOption(mode);await frame.waitForFunction(expected=>JSON.parse(localStorage.getItem('silver-health-data-v1')).simulationMode===expected,mode);};
  const setClock=async(offset,time)=>{const date=new Date(Date.UTC(2026,8,13+offset)).toISOString().slice(0,10);await page.locator('#day-offset').fill(String(offset));await page.locator('#clock-time').fill(time);await page.locator('#apply-clock').click();await page.waitForFunction(({date,time})=>document.querySelector('#control-feedback').textContent.includes(`${date} ${time}`),{date,time});await frame.waitForFunction(({offset,time})=>{const data=JSON.parse(localStorage.getItem('silver-health-data-v1'));return data.dateOffset===offset&&data.demoTime===time;},{offset,time});};
  const eventFor=date=>state().then(data=>data.doseEvents.find(event=>event.date===date));
  const noticesFor=async(eventId,round)=>{const data=await state();return data.notificationLogs.filter(notice=>notice.kind==='N2'&&notice.eventId===eventId&&notice.warningRound===round);};

  const first=await eventFor('2026-09-13');await setMode('offline');await setClock(0,'09:00');
  let early=await noticesFor(first.id,'early');const earlyIds=early.map(notice=>notice.id).sort();ok(early.length===2&&early.every(notice=>notice.deliveryState==='pending'&&notice.deliveryAttempts===0&&notice.sentAt===null),'离线提前轮仅排队且没有伪造发送证据');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#ready-status').textContent.includes('已就绪'));frame=page.frames().find(candidate=>candidate.url().includes('index.html?demo=1'));await page.locator('details.advanced-controls summary').click();early=await noticesFor(first.id,'early');ok(JSON.stringify(early.map(notice=>notice.id).sort())===JSON.stringify(earlyIds)&&early.every(notice=>notice.deliveryState==='pending'&&notice.deliveryAttempts===0)&&await frame.evaluate(()=>MedRules.validData(JSON.parse(localStorage.getItem('silver-health-data-v1')))),'刷新保留排队 ID、送达元数据与 canonical 唯一性');
  await setClock(0,'11:00');early=await noticesFor(first.id,'early');let deadline=await noticesFor(first.id,'deadline'),deadlineIds=deadline.map(notice=>notice.id).sort();
  ok(early.every(notice=>notice.deliveryState==='suppressed')&&deadline.length===2&&deadline.every(notice=>notice.deliveryState==='pending'),'跨过截止后提前轮终止且只排队截止轮');
  await setMode('online');deadline=await noticesFor(first.id,'deadline');ok(deadline.every(notice=>notice.deliveryState==='delivered'&&notice.deliveryAttempts===1)&&JSON.stringify(deadline.map(notice=>notice.id).sort())===JSON.stringify(deadlineIds),'恢复在线按原 ID 送达截止轮');
  const firstCount=(await state()).notificationLogs.length;await page.locator('#retry-notices').click();await page.locator('#retry-notices').click();ok((await state()).notificationLogs.length===firstCount,'重复重试不新增通知记录');

  await setClock(1,'08:59');await setMode('failure');await setClock(1,'09:00');const second=await eventFor('2026-09-14');
  let failed=(await noticesFor(second.id,'early')).find(notice=>notice.recipientId==='elder-zhang');const failedId=failed.id;
  ok(failed.deliveryState==='failed'&&failed.deliveryAttempts===1&&failed.sentAt===null,'失败轮保留失败状态且不伪造送达时间');
  await setMode('online');failed=(await noticesFor(second.id,'early')).find(notice=>notice.id===failedId);ok(failed.deliveryState==='failed','仅切换在线状态不把失败轮伪装成已送达');
  await page.locator('#retry-notices').click();await frame.waitForFunction(id=>JSON.parse(localStorage.getItem('silver-health-data-v1')).notificationLogs.find(notice=>notice.id===id)?.deliveryState==='delivered',failedId);failed=(await noticesFor(second.id,'early')).find(notice=>notice.id===failedId);
  ok(failed.deliveryAttempts===2&&failed.sentAt&&failed.deliveredAt&&failed.id===failedId,'显式重试复用失败通知 ID 并补充送达元数据');

  await setMode('offline');await setClock(2,'08:50');await page.locator('#open-app').click();await frame.waitForFunction(()=>!document.getElementById('app').inert);await frame.locator('#modal-root .focus-sheet').waitFor();const third=await eventFor('2026-09-15');await frame.locator('#modal-root [data-action="snooze"][data-minutes="30"]').click();
  await setMode('online');ok((await noticesFor(third.id,'early')).length===0,'恢复在线时尚未到提前轮且不预建通知');
  await setClock(2,'09:00');let queued=(await noticesFor(third.id,'early')).find(notice=>notice.recipientId==='elder-zhang');const queuedId=queued.id;ok(queued.deliveryState==='pending'&&queued.deliveryAttempts===0,'未同步延后使在线初次生成的提前轮仍不送达');
  await setClock(2,'09:19');queued=(await noticesFor(third.id,'early')).find(notice=>notice.id===queuedId);ok(queued.deliveryState==='pending','保护结束前一分钟仍保持排队');
  await setClock(2,'09:20');queued=(await noticesFor(third.id,'early')).find(notice=>notice.id===queuedId);ok(queued.deliveryState==='delivered'&&queued.deliveryAttempts===1&&queued.id===queuedId,'保护结束精确时刻以原 ID 送达提前轮');
  const beforeSync=(await state()).notificationLogs.length;await page.locator('#sync-records').click();await frame.waitForFunction(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')).doseEvents.find(event=>event.date==='2026-09-15').snoozeSyncState==='synced');ok((await state()).notificationLogs.length===beforeSync,'同步延后元数据不重复通知');
  await page.screenshot({path:`${artifactDir}/p0-08-delivery-lifecycle.png`,animations:'disabled',fullPage:true});
  ok(errors.length===0,'P0-08 演示控制流程无脚本错误');return{passed:checks.length,checks,errors};
}
