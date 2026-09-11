async(page,{artifactDir='output/playwright/mvp-v3-stage-01'}={})=>{
  const BASE_URL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
  const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ok=(value,label)=>{if(!value)throw Error(`${label}；最后通过 ${checks.at(-1)}`);checks.push(label);};
  const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
  const nav=pageName=>page.locator(`[data-action="navigate"][data-page="${pageName}"]`).click();
  const closeFocus=async()=>{if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');};
  const switchTo=async accountId=>{await click('accounts');await page.locator(`[data-action="switch-account"][data-id="${accountId}"]`).click();await closeFocus();};
  const assertHome=async label=>ok(await page.locator('.nav-item.is-active[data-page="home"]').count()===1&&await page.locator('#modal-root [role="dialog"]').count()===0,label);
  const send=async text=>{await page.locator('#chat-input').fill(text);await page.locator('[data-form="chat"] button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('.chat-status')?.textContent.includes('处理中'));};

  await page.goto(`${BASE_URL}/index.html`);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();await closeFocus();
  await nav('me');await click('clock');await page.locator('[name="time"]').fill('06:00');await page.getByRole('button',{name:'确认时间',exact:true}).click();await nav('home');

  await click('home-add-health');await page.locator('[name="healthType"]').selectOption('血压');await page.locator('[name="systolic"]').fill('123');await click('close-modal');
  await nav('plans');await switchTo('child-li');await assertHome('从旧页面切到子女账号先落首页');
  await click('profiles');await page.locator('[data-action="select-profile"][data-id="profile-wang"]').click();await click('home-add-med');await page.locator('[name="name"]').fill('王叔叔未保存草稿');await click('close-modal');
  await nav('health');await switchTo('elder-zhang');await assertHome('从健康页切到长辈账号先落首页');
  ok(await page.locator('[data-action="resume-draft"]').count()===1,'长辈首页只显示继续输入入口');await click('resume-draft');ok(await page.locator('[name="systolic"]').inputValue()==='123','显式继续恢复长辈血压草稿');await click('close-modal');
  await switchTo('child-li');await assertHome('返回子女账号仍先落首页');ok(await page.locator('[data-action="resume-draft"]').count()===1,'子女首页显示当前档案继续入口');await click('resume-draft');ok(await page.locator('[name="name"]').inputValue()==='王叔叔未保存草稿','显式继续恢复子女当前档案草稿');await click('close-modal');
  for(const accountId of ['elder-zhang','child-li','elder-zhang','child-li','elder-zhang']){await switchTo(accountId);await assertHome(`连续切换 ${accountId} 保持首页落点`);}

  for(const accountId of ['child-li','elder-zhang']){
    await page.evaluate(({accountId})=>sessionStorage.setItem('silver-health-view-v1',JSON.stringify({accountId,page:'plans',planTab:'inactive',historyDate:'2026-09-01',healthType:'body'})),{accountId});
    await page.reload();await closeFocus();await assertHome(`${accountId} 整页刷新不恢复旧页面或弹窗`);
    const savedView=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('silver-health-view-v1')));
    ok(savedView.accountId===accountId&&savedView.page==='home'&&savedView.planTab==='active'&&savedView.historyDate==='2026-09-13',`${accountId} 刷新后会话路由归一`);
  }
  await nav('me');await click('clock');await page.locator('[name="time"]').fill('21:15');await page.getByRole('button',{name:'确认时间',exact:true}).click();await nav('home');await page.locator('#modal-root .focus-sheet').waitFor();
  const focusedId=await page.locator('#modal-root [data-action="take"]').getAttribute('data-id');
  const beforeClose=await page.evaluate(id=>{const d=JSON.parse(localStorage.getItem('silver-health-data-v1'));return JSON.stringify({event:d.doseEvents.find(e=>e.id===id),logs:d.notificationLogs});},focusedId);
  await click('close-modal');await assertHome('关闭该吃药啦提醒返回长辈首页');
  const afterClose=await page.evaluate(id=>{const d=JSON.parse(localStorage.getItem('silver-health-data-v1'));return JSON.stringify({event:d.doseEvents.find(e=>e.id===id),logs:d.notificationLogs});},focusedId);
  ok(afterClose===beforeClose,'关闭提醒不写事实、不消耗延后且不新增通知');
  await page.reload();await page.locator('#modal-root .focus-sheet').waitFor();await page.locator('#modal-root [data-action="view-focus-task"]').click();
  ok(await page.locator('.nav-item.is-active[data-page="plans"]').count()===1&&await page.locator(`[data-task-id="${focusedId}"]`).count()===1,'只有查看对应任务命令定位记录列表');
  await nav('home');await click('assistant');await page.locator('[data-action="chat-intent"][data-intent="plan"]').click();
  await send('药名是作用域测试药，每次1片，早餐，早餐餐后');ok(await page.locator('[name="doseValue"]').inputValue()==='1','助手建立剂量与餐时草稿');
  await send('每次1片，不是2片');ok(await page.locator('[name="doseValue"]').inputValue()==='1','肯定剂量后的否定值不覆盖草稿');
  await send('不是一片，是半片');ok(await page.locator('[name="doseValue"]').inputValue()==='0.5','否定后明确改口解析为半片');
  await send('早餐不是饭后');ok(await page.locator('[data-action="meal"][data-slot="早餐"][data-meal="餐后"]').getAttribute('aria-pressed')==='true'&&await page.locator('.chat-conflict').count()===1,'孤立餐时否定保留原值并阻止核对');
  await send('早餐改为餐前');ok(await page.locator('[data-action="meal"][data-slot="早餐"][data-meal="餐前"]').getAttribute('aria-pressed')==='true'&&await page.locator('.chat-conflict').count()===0,'明确餐时替换解除对应阻止');
  await send('每次1片，每次2片');ok(await page.locator('[name="doseValue"]').inputValue()==='0.5'&&await page.locator('.chat-conflict').count()===1,'冲突最终剂量不污染原草稿');
  await page.locator('[data-form="chat-plan"] button[type="submit"]').click();ok(await page.getByRole('alertdialog').count()===1,'剂量冲突保持核对阻止状态');await click('dismiss-errors');
  await page.locator('[name="doseValue"]').fill('1');await page.locator('[data-form="chat-plan"] button[type="submit"]').click();ok(await page.getByRole('dialog').getByRole('heading',{name:'确认用药计划'}).count()===1,'手动明确剂量后可以进入核对');
  await click('close-modal');await send('药名改为草稿修改药，单位换成粒，早餐提醒时间改为09:05');
  await send('时段改为早餐和晚餐');await send('晚餐提醒时间改为19:10，晚餐改为餐后');await send('开始日期改为2026-09-14，周期改为截至2026-09-20，备注改为晚饭后核对');
  const summary=await page.locator('.chat-message.assistant').last().innerText();
  ok(summary.includes('草稿修改药')&&summary.includes('每次 1 粒')&&summary.includes('早餐 09:05')&&summary.includes('晚餐 19:10 餐后')&&summary.includes('截至 2026-09-20')&&summary.includes('备注 晚饭后核对'),'聊天摘要同步全部草稿修改');
  ok(await page.locator('[name="name"]').inputValue()==='草稿修改药'&&await page.locator('[name="doseUnit"]').inputValue()==='粒'&&await page.locator('[name="slots"][value="晚餐"]').isChecked(),'聊天配置卡同步名称、单位与时段');
  ok((await page.locator('[data-slot="早餐"][data-part="hour"]').innerText()).includes('09')&&(await page.locator('[data-slot="晚餐"][data-part="minute"]').innerText()).includes('10'),'聊天配置卡同步两处 N1 时间');
  const planCountBeforeQuery=await page.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')).medicationPlans.length);await send('今天几点吃药');
  ok(await page.locator('.chat-tasks').count()===1&&await page.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')).medicationPlans.length)===planCountBeforeQuery,'查询已保存计划不修改或保存当前草稿');
  await page.locator('[data-action="chat-intent"][data-intent="plan"]').click();ok(await page.locator('[name="name"]').inputValue()==='草稿修改药','查询后返回计划仍保留当前草稿');
  await click('chat-form-plan');ok(await page.locator('[data-form="medicine"] [name="name"]').inputValue()==='草稿修改药'&&await page.locator('[data-form="medicine"] [name="note"]').inputValue()==='晚饭后核对','手动表单与聊天草稿一致');
  await page.locator('[data-form="medicine"] button[type="submit"]').click();const review=await page.getByRole('dialog').innerText();ok(review.includes('草稿修改药')&&review.includes('1 粒')&&review.includes('09:05')&&review.includes('19:10')&&review.includes('餐后')&&review.includes('2026-09-20')&&review.includes('晚饭后核对'),'最终核对页与聊天和手动表单一致');
  await page.screenshot({path:`${artifactDir}/p0-04-draft-edit.png`,animations:'disabled',fullPage:true});
  ok(errors.length===0,'P0-01 至 P0-04 页面无脚本错误');return{passed:checks.length,checks,errors};
}
