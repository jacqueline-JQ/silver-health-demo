async (page, {artifactDir='output/playwright/step-01'}={}) => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
  const checks = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ok = (condition, label) => { if (!condition) throw Error(label); checks.push(label); };
  const click = async action => {const inside=page.locator(`#modal-root [data-action="${action}"]:visible`);return(await inside.count()?inside:page.locator(`[data-action="${action}"]:visible`)).first().click();};
  const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('silver-health-data-v1')));
  const clock = async (time, offset = 0) => {
    await page.waitForTimeout(50);if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');
    if(!await page.locator('[data-action="clock"]:visible').count())await page.locator('[data-action="navigate"][data-page="me"]').click();
    await click('clock'); await page.locator('[name="time"]').fill(time); await page.locator('[name="dateOffset"]').fill(String(offset)); await page.getByRole('button', {name:'确认时间',exact:true}).click();
    await page.locator('[data-action="navigate"][data-page="home"]').click();
    await page.waitForTimeout(50);if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');
  };
  const switchTo = async id => { await click('accounts'); await page.locator(`[data-action="switch-account"][data-id="${id}"]`).click();if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal'); };
  await page.goto(`${BASE_URL}/index.html`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload();
  ok(await page.getByRole('heading',{name:'张阿姨，您好'}).count() === 1, '首页渲染');
  await click('snooze');
  let saved = await data(); const bedtime = saved.doseEvents.find(e=>e.id==='event-atorvastatin-bedtime');
  ok(bedtime.snoozeUsed === 1 && bedtime.snoozeUntil.includes('21:20'), '本人延后5分钟');
  await page.reload(); ok(await page.getByText('* 延后机会已用完，请按实际情况记录').count()>0,'刷新保留延后次数');
  await page.locator('[data-action="take"][data-id="event-atorvastatin-bedtime"]').click();
  ok((await data()).doseEvents.find(e=>e.id===bedtime.id).status==='taken','一键声明已服用');
  await click('undo');
  saved=await data(); ok(saved.doseEvents.find(e=>e.id===bedtime.id).status==='pending' && saved.doseEvents.find(e=>e.id===bedtime.id).snoozeUsed===1,'撤销不恢复延后机会');
  await page.locator('[data-action="declare"][data-id="event-atorvastatin-bedtime"]').click();
  await page.locator('[data-action="correct-dose"][data-id="event-atorvastatin-bedtime"]').click();
  await page.locator('[data-action="choose-correction"][data-status="skipped"]').click(); await click('confirm-dose');
  saved=await data(); ok(saved.doseEvents.find(e=>e.id===bedtime.id).status==='skipped' && saved.doseEvents.find(e=>e.id===bedtime.id).changes.length===4,'更正保留前后记录');
  await switchTo('child-li');
  ok(await page.locator('[data-action="take"], [data-action="snooze"], [data-action="correct-dose"]').count()===0,'子女无代打更正延后按钮');
  await page.locator('[data-action="task-detail"][data-id="event-atorvastatin-bedtime"]').click();
  ok(await page.locator('.modal-sheet [data-action="take"], .modal-sheet [data-action="snooze"]').count()===0,'子女详情权限');
  await click('close-modal'); await page.reload(); ok(await page.getByText('本次无需服用',{exact:true}).count()>0,'双端共享且刷新保留');
  await click('overdue'); await click('remind'); saved=await data(); ok(saved.notificationLogs.at(-1).eventId==='event-metformin-dinner','子女模拟提醒不改变事实');
  await switchTo('elder-zhang'); await clock('18:00');
  await click('home-add-med');
  await page.locator('[name="name"]').fill('浏览器半片测试药'); await page.locator('[name="doseValue"]').fill('0.5');await page.locator('[name="doseUnit"]').fill('片');
  await page.locator('[name="slots"][value="早餐"]').check(); await page.locator('[name="slots"][value="晚餐"]').check();
  await page.getByRole('button',{name:'核对用药计划',exact:true}).click(); await click('save-med');
  saved=await data(); const plan=saved.medicationPlans.find(p=>p.name==='浏览器半片测试药'); ok(plan && saved.doseEvents.filter(e=>e.planId===plan.id).length===1,'18点建计划不追造早餐');
  await page.locator(`[data-action="plan-detail"][data-id="${plan.id}"]`).click(); await click('edit-plan'); await page.locator('[name="name"]').fill('编辑后的名字');
  await page.getByRole('button',{name:'核对用药计划',exact:true}).click(); await click('save-med');
  saved=await data(); ok(saved.doseEvents.find(e=>e.planId===plan.id).snapshot.name==='浏览器半片测试药','编辑不改已开始任务快照');
  await page.locator(`[data-action="plan-detail"][data-id="${plan.id}"]`).click(); await click('stop-plan'); await click('confirm-stop');
  await page.locator('[data-action="plan-tab"][data-value="history"]').click(); const taskId=saved.doseEvents.find(e=>e.planId===plan.id).id;
  await page.locator(`[data-action="take"][data-id="${taskId}"]`).click(); ok((await data()).doseEvents.find(e=>e.id===taskId).status==='taken','停用后已开始任务仍可记录');
  await clock('00:10',1); ok(await page.getByText('本地演示 · 2026-09-14 00:10').count()===1,'受控跨日日期正确');
  for (const width of [360,1280]) for(const font of ['normal','elder']) {
    await page.setViewportSize({width,height:900}); await page.locator('[data-action="navigate"][data-page="me"]').click(); await page.locator(`[data-action="font"][data-value="${font}"]`).click();
    await page.locator('[data-action="navigate"][data-page="home"]').click();
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`首页无横向溢出 ${width}/${font}`);
    await page.screenshot({path:`${artifactDir}/home-${width}-${font}.png`,fullPage:true,animations:'disabled'});
  }
  await page.locator('[data-action="navigate"][data-page="me"]').click();await click('clock'); await page.keyboard.press('Escape'); ok(await page.locator('[role="dialog"]').count()===0 && await page.evaluate(()=>document.activeElement.dataset.action)==='clock','键盘退出且焦点回到时钟按钮');
  // 独立测试上下文中注入异常存档，验证保留原文及明确降级。
  await page.evaluate(()=>localStorage.setItem('silver-health-data-v1','{"broken":true}')); await page.reload();
  ok(await page.getByRole('alert').count()===1,'无效存档降级提示'); await click('take'); ok(await page.evaluate(()=>localStorage.getItem('silver-health-data-v1'))==='{"broken":true}','操作不覆盖无效存档原文');
  await page.locator('[data-action="navigate"][data-page="me"]').click(); await click('reset'); await click('confirm-reset');await page.waitForTimeout(50);if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');
  await clock('21:15'); saved=await data(); ok(saved.version===3 && saved.dateOffset===0 && saved.doseEvents.every(e=>e.snoozeUsed===0),'完整恢复初始数据');
  const fixtureV1=await (await fetch(`${BASE_URL}/tests/fixtures/mvp-v3-v1-minimal.json`)).text();const migration=await page.evaluate(raw=>{localStorage.setItem('silver-health-data-v1',raw);return JSON.parse(raw).version;},fixtureV1);
  await page.reload();if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');ok(migration===1&&await page.getByRole('heading',{name:'长辈甲，您好'}).count()===1&&await page.getByText('Fixture 旧计划',{exact:true}).count()>0,'load固定v1存档并呈现迁移内容');
  await clock('21:16'); await page.reload(); saved=await data(); ok(saved.version===3 && saved.doseEvents.find(e=>e.id==='fixture-history').legacy.status==='taken_on_time','迁移后的存档提交刷新仍保留来源');
  const malformed=await page.evaluate(raw=> { const d=JSON.parse(raw);d.accounts=[null];const broken=JSON.stringify(d);localStorage.setItem('silver-health-data-v1',broken);return broken; },fixtureV1);await page.reload();await click('take');
  ok(await page.evaluate(()=>localStorage.getItem('silver-health-data-v1'))===malformed,'迁移TypeError不覆盖损坏旧存档');
  await page.locator('[data-action="navigate"][data-page="me"]').click(); await click('reset'); await click('confirm-reset');await page.waitForTimeout(50);if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');
  await click('home-add-health'); await page.locator('[name="systolic"]').fill('125');await page.locator('[name="diastolic"]').fill('75');
  await page.getByRole('button',{name:'核对测量记录',exact:true}).click();ok(await page.getByRole('dialog').getByText('125 mmHg',{exact:true}).count()===1,'血压测量核对页'); await click('save-health'); await page.reload();
  await page.waitForTimeout(50);if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');ok((await data()).healthRecords.some(r=>r.values.systolic===125&&r.values.diastolic===75),'测量确认保存刷新');await page.locator('[data-action="navigate"][data-page="health"]').click();
  await click('import');await click('confirm-import');const imported=(await data()).healthRecords.length;await click('import');await click('confirm-import');ok((await data()).healthRecords.length===imported,'模拟设备导入与重复导入去重');
  for (const width of [360,1280]) for (const font of ['normal','elder']) {
    await page.setViewportSize({width,height:900}); await page.locator('[data-action="navigate"][data-page="me"]').click();await page.locator(`[data-action="font"][data-value="${font}"]`).click();await page.locator('[data-action="navigate"][data-page="home"]').click();
    await click('home-add-med');await page.locator('[name="name"]').fill('布局检查药');await page.locator('[name="doseValue"]').fill('0.5');await page.locator('[name="doseUnit"]').fill('片');await page.locator('[name="slots"][value="睡前"]').check();
    ok(await page.evaluate(()=>{const el=document.querySelector('.modal-sheet');return el.scrollWidth<=el.clientWidth+1}),`表单布局 ${width}/${font}`);await page.screenshot({path:`${artifactDir}/form-${width}-${font}.png`,animations:'disabled'});
    await page.getByRole('button',{name:'核对用药计划',exact:true}).click();ok(await page.evaluate(()=>{const el=document.querySelector('.modal-sheet');return el.scrollWidth<=el.clientWidth+1}),`核对布局 ${width}/${font}`);await click('close-modal');
    await page.locator('[data-action="navigate"][data-page="plans"]').click();await page.locator('[data-action="plan-tab"][data-value="history"]').click();
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`历史布局 ${width}/${font}`);
    await page.locator('[data-action="task-detail"][data-id="event-atorvastatin-bedtime"]').click();ok(await page.evaluate(()=>{const el=document.querySelector('.modal-sheet');return el.scrollWidth<=el.clientWidth+1}),`任务详情布局 ${width}/${font}`);await page.screenshot({path:`${artifactDir}/detail-${width}-${font}.png`,animations:'disabled'});await click('close-modal');
  }
  await page.locator('[data-action="navigate"][data-page="home"]').click();
  await page.evaluate(()=> { const d=MedRules.prepareSeed(SILVER_SEED_DATA); d.medicationPlans=[];d.doseEvents=[];d.healthRecords=[];d.notificationLogs=[];localStorage.setItem('silver-health-data-v1',JSON.stringify(d)); }); await page.reload();
  ok(await page.getByRole('heading',{name:'今天已记录 0/0'}).count()===1,'空任务页面可用');
  ok(errors.length===0,`控制台脚本错误 ${errors.length}`);
  return {passed:checks.length,checks,errors};
}
