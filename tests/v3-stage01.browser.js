async(page,{artifactDir='output/playwright/mvp-v3-stage-01'}={})=>{
  const BASE_URL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
  const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ok=(value,label)=>{if(!value)throw Error(`${label}；最后通过 ${checks.at(-1)}`);checks.push(label);};
  const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
  const nav=pageName=>page.locator(`[data-action="navigate"][data-page="${pageName}"]`).click();
  const closeFocus=async()=>{if(await page.locator('#modal-root .focus-sheet').count())await click('close-modal');};
  const switchTo=async accountId=>{await click('accounts');await page.locator(`[data-action="switch-account"][data-id="${accountId}"]`).click();await closeFocus();};
  const assertHome=async label=>ok(await page.locator('.nav-item.is-active[data-page="home"]').count()===1&&await page.locator('#modal-root [role="dialog"]').count()===0,label);

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
  await page.screenshot({path:`${artifactDir}/p0-01-account-home.png`,animations:'disabled',fullPage:true});
  ok(errors.length===0,'P0-01 页面无脚本错误');return{passed:checks.length,checks,errors};
}
