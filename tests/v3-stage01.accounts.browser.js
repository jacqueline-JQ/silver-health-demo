async(page,{artifactDir='output/playwright/mvp-v3-stage-01'}={})=>{
  const BASE_URL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765',checks=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const ok=(value,label)=>{if(!value)throw Error(`${label}；最后通过 ${checks.at(-1)}`);checks.push(label);};
  await page.goto(`${BASE_URL}/index.html`);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();
  await page.evaluate(()=>{const data=MedRules.prepareSeed(SILVER_SEED_DATA);data.demoTime='06:00';data.notificationLogs=[];localStorage.setItem('silver-health-data-v1',JSON.stringify(data));sessionStorage.setItem('silver-health-view-v1',JSON.stringify({accountId:'elder-zhang'}));});await page.reload();
  const assertHome=async(accountId,label)=>{
    await page.waitForFunction(id=>JSON.parse(sessionStorage.getItem('silver-health-view-v1')).accountId===id,accountId);
    const view=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('silver-health-view-v1')));
    ok(view.accountId===accountId&&view.page==='home'&&view.planTab==='active'&&view.historyDate==='2026-09-13'&&await page.locator('.nav-item.is-active[data-page="home"]').count()===1&&await page.locator('#modal-root [role="dialog"]').count()===0,label);
  };
  const headerSwitch=async accountId=>{await page.locator('[data-action="accounts"]').click();await page.locator(`#modal-root [data-action="switch-account"][data-id="${accountId}"]`).click();};
  for(let round=1;round<=5;round++){
    await headerSwitch('child-li');await assertHome('child-li',`顶部账号入口第 ${round} 次切到子女回首页`);
    await headerSwitch('elder-zhang');await assertHome('elder-zhang',`顶部账号入口第 ${round} 次切回长辈回首页`);
  }
  const meSwitch=async accountId=>{await page.locator('[data-action="navigate"][data-page="me"]').click();await page.locator(`.account-switcher [data-action="switch-account"][data-id="${accountId}"]`).click();};
  for(let round=1;round<=5;round++){
    await meSwitch('child-li');await assertHome('child-li',`我的页账号入口第 ${round} 次切到子女回首页`);
    await meSwitch('elder-zhang');await assertHome('elder-zhang',`我的页账号入口第 ${round} 次切回长辈回首页`);
  }

  await page.goto(`${BASE_URL}/demo.html`);await page.waitForFunction(()=>document.querySelector('#ready-status').textContent.includes('已就绪'));const frame=page.frames().find(candidate=>candidate.url().includes('index.html?demo=1'));
  const demoSwitch=async accountId=>{await page.locator('#account-select').selectOption(accountId);await frame.waitForFunction(id=>JSON.parse(sessionStorage.getItem('silver-health-view-v1')).accountId===id,accountId);};
  const assertDemoHome=async(accountId,label)=>{const view=await frame.evaluate(()=>JSON.parse(sessionStorage.getItem('silver-health-view-v1')));ok(view.accountId===accountId&&view.page==='home'&&view.planTab==='active'&&view.historyDate==='2026-09-13'&&await frame.locator('.nav-item.is-active[data-page="home"]').count()===1&&await frame.locator('#modal-root [role="dialog"]').count()===0,label);};
  for(let round=1;round<=5;round++){
    await demoSwitch('child-li');await assertDemoHome('child-li',`demo 账号入口第 ${round} 次切到子女回首页`);
    await demoSwitch('elder-zhang');await assertDemoHome('elder-zhang',`demo 账号入口第 ${round} 次切回长辈回首页`);
  }
  await demoSwitch('child-li');await page.locator('#open-app').click();await frame.waitForFunction(()=>!document.getElementById('app').inert);await frame.locator('[data-action="profiles"]').click();await frame.locator('[data-action="select-profile"][data-id="profile-wang"]').click();
  ok((await frame.locator('.profile-switcher').innerText()).includes('王叔叔'),'子女可先选择另一位已授权长辈');
  await demoSwitch('elder-zhang');await assertDemoHome('elder-zhang','子女切回长辈账号仍统一落首页');
  const normalized=await frame.evaluate(()=>JSON.parse(localStorage.getItem('silver-health-data-v1')).accounts.find(account=>account.id==='elder-zhang').profileId);
  ok(normalized==='profile-zhang'&&(await frame.locator('.hero-name').innerText()).includes('张阿姨')&&await page.locator('#profile-select').inputValue()==='profile-zhang','长辈账号把当前档案归一为本人');
  await page.screenshot({path:`${artifactDir}/three-account-entry-roundtrips.png`,animations:'disabled',fullPage:true});
  ok(errors.length===0,'三个账号入口往返无脚本错误');return{passed:checks.length,checks,errors};
}
