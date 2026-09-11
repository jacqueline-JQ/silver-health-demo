async(page,{artifactDir='output/playwright/mvp-v3-stage-01/migration'}={})=>{
  const BASE_URL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
  const checks=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  const ok=(value,label)=>{if(!value)throw Error(`${label}；最后通过 ${checks.at(-1)}`);checks.push(label);};
  const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
  const closeFocus=async()=>{if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');};
  const loadFixture=async name=>{const raw=await (await fetch(`${BASE_URL}/tests/fixtures/${name}`)).text();await page.evaluate(raw=>{localStorage.setItem('silver-health-data-v1',raw);sessionStorage.clear();},raw);await page.reload();await closeFocus();return raw;};
  const persistCurrent=async()=>{await page.locator('[data-action="navigate"][data-page="me"]').click();await page.locator('[data-action="font"][data-value="normal"]').click();return page.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')));};

  await page.goto(`${BASE_URL}/index.html`);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();await closeFocus();
  let stored=await persistCurrent();ok(stored.version===3&&stored.medicationPlans.every(plan=>Object.values(plan.slotSettings).every(setting=>setting.time===setting.reminderTime&&Object.hasOwn(setting,'missedAlertTime'))),'恢复初始数据原生保存 version 3 核心计划字段');
  ok(stored.doseEvents.every(event=>event.reminderTime===event.scheduledTime&&Object.hasOwn(event,'missedAlertTime')&&event.snapshot.reminderTime===event.reminderTime),'默认任务含 N1、N2 与快照追溯字段');

  await loadFixture('mvp-v3-v1-minimal.json');stored=await persistCurrent();
  ok(stored.version===3&&stored.medicationPlans[0].legacy.slots[0]==='早餐后','固定 v1 fixture 经真实 load/commit 升级并保留旧枚举');
  ok(stored.doseEvents.find(event=>event.id==='fixture-history').reminderTime==='08:30'&&stored.doseEvents.find(event=>event.id==='fixture-history').missedAlertTime===null,'v1 历史任务保留原提醒且不加入新 N2');
  const v1Once=JSON.stringify(stored);await page.reload();await closeFocus();stored=await persistCurrent();ok(JSON.stringify(stored)===v1Once,'v1 升级后重复载入幂等');

  await loadFixture('mvp-v3-v2-minimal.json');stored=await persistCurrent();const history=stored.doseEvents.find(event=>event.id==='fixture-history'),notice=stored.notificationLogs.find(item=>item.id==='fixture-old-n2');
  ok(stored.version===3&&history.snapshot.name==='Fixture 历史快照'&&history.snapshot.doseValue===0.5&&history.snapshot.meal==='餐前','固定 v2 fixture 升级不按父计划改写历史快照');
  ok(notice.warningRound==='deadline'&&notice.receiverId==='fixture-child'&&notice.notificationId===notice.id&&notice.sentAt===notice.deliveredAt,'旧 N2 可靠记录标记截止轮并保留原 ID 与时间');

  const rawBroken='{broken-v3-archive';await page.evaluate(raw=>{localStorage.setItem('silver-health-data-v1',raw);sessionStorage.clear();},rawBroken);await page.reload();await closeFocus();ok(await page.locator('.storage-warning').count()===1,'无效 JSON 存档进入临时演示降级');
  await page.locator('[data-action="navigate"][data-page="me"]').click();await page.locator('[data-action="font"][data-value="normal"]').click();ok(await page.evaluate(()=>localStorage.getItem('silver-health-data-v1'))===rawBroken,'降级后的普通操作不覆盖无效原存档');
  await click('reset');await click('confirm-reset');await closeFocus();stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')));ok(stored.version===3&&stored.doseEvents.filter(event=>/^history-/.test(event.id)).length===2,'恢复初始数据覆盖为完整 version 3 且历史样例不重复');
  ok(await page.locator('.nav-item.is-active[data-page="home"]').count()===1,'恢复初始数据回到已模拟登录首页');
  const planCount=stored.medicationPlans.length;await page.locator('[data-action="home-add-med"]').click();await page.locator('[name="name"]').fill('N1 N2 边界测试');await page.locator('[name="doseValue"]').fill('1');await page.locator('[name="doseUnit"]').fill('片');await page.locator('[name="slots"][value="早餐"]').check();await page.locator('[data-action="time-picker"][data-slot="早餐"][data-part="hour"]').click();await page.locator('[name="hour"]').fill('9');await page.locator('[name="minute"]').fill('17');await page.getByRole('button',{name:'确认提醒时间',exact:true}).click();await page.locator('[data-form="medicine"] button[type="submit"]').click();
  ok(await page.getByRole('alertdialog').count()===1&&await page.locator('[data-field="time-早餐"].field-invalid').count()===1&&await page.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')).medicationPlans.length)===planCount,'新计划 N1 不早于固定 N2 时阻止保存且不写数据');await click('dismiss-errors');ok((await page.locator('[data-slot="早餐"][data-part="minute"]').innerText()).includes('17'),'冲突提示后保留用户 N1 草稿');await click('close-modal');
  await page.screenshot({path:`${artifactDir}/migration-reset-v3.png`,animations:'disabled',fullPage:true});
  ok(errors.length===0,'P0-09 迁移与恢复流程无脚本错误');
  return{passed:checks.length,checks,errors};
}
