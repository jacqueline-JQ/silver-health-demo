async(page,{artifactDir,theme='ios'}={})=>{
  const BASE_URL=process.env.TEST_BASE_URL||'http://127.0.0.1:8765',checks=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const ok=(value,label)=>{if(!value)throw Error(`${theme} ${label}；最后通过 ${checks.at(-1)}`);checks.push(`${theme}：${label}`);};
  await page.goto(`${BASE_URL}/index.html`);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  const click=async action=>page.locator(`#modal-root [data-action="${action}"]:visible`).first().click();
  const noHorizontalOverflow=async label=>{
    const result=await page.locator('#modal-root .modal-sheet').evaluate(sheet=>{
      const visible=[...sheet.querySelectorAll('button,input,select,textarea')].filter(element=>element.getClientRects().length);
      const bounds=sheet.getBoundingClientRect();
      return {page:document.documentElement.scrollWidth<=innerWidth+1,sheet:sheet.scrollWidth<=sheet.clientWidth+1,content:[...sheet.querySelectorAll('.sheet-content,.medicine-plan-form,.medicine-form-fields,.slot-grid,.slot-line,.slot-control,.time-wheels,.wheel-column')].every(element=>element.scrollWidth<=element.clientWidth+1),controls:visible.every(element=>{const rect=element.getBoundingClientRect();return rect.left>=bounds.left-1&&rect.right<=bounds.right+1;})};
    });
    ok(Object.values(result).every(Boolean),`${label}无水平滚动、右侧裁切或控件越界`);
  };
  for(const width of [320,360,390,1280])for(const font of ['normal','elder']){
    await page.setViewportSize({width,height:900});
    await page.evaluate(({theme,font})=>{const data=MedRules.prepareSeed(SILVER_SEED_DATA);data.demoTime='06:00';data.notificationStyle=theme;data.notificationLogs=[];data.accounts.find(account=>account.id==='child-li').fontMode=font;localStorage.setItem('silver-health-data-v1',JSON.stringify(data));sessionStorage.setItem('silver-health-view-v1',JSON.stringify({accountId:'child-li'}));},{theme,font});
    await page.reload();await page.waitForFunction(({theme,font})=>document.documentElement.dataset.os===theme&&document.querySelector('.app-shell').classList.contains(`font-${font}`),{theme,font});await page.waitForTimeout(80);
    await page.locator('[data-action="home-add-med"]').click();await page.locator('[data-form="medicine"]').waitFor();
    await noHorizontalOverflow(`新增计划空表单 ${width}/${font}`);
    await page.locator('[data-form="medicine"] button[type="submit"]').click();const alert=page.locator('#modal-root [role="alertdialog"]');await alert.waitFor();
    ok(await alert.evaluate(element=>{const rect=element.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&element.scrollWidth<=element.clientWidth+1;}),`错误总览位于视口内 ${width}/${font}`);
    await click('dismiss-errors');ok(await page.locator('#modal-root [aria-invalid="true"]:focus').count()===1&&await page.locator('#modal-root .field-error').count()>=4,`错误关闭后聚焦首项且逐字段提示 ${width}/${font}`);
    await noHorizontalOverflow(`新增计划错误提示 ${width}/${font}`);
    const name=`超长药品名称用于验证换行与右侧边界-${theme}-${width}-${font}-重复文字重复文字重复文字重复文字重复文字`.slice(0,80),unit='自定义长单位';
    await page.locator('[name="name"]').fill(name);await page.locator('[name="doseValue"]').fill('0.5');await page.locator('[name="doseUnit"]').fill(unit);await page.locator('[name="slots"][value="早餐"]').check();await page.locator('[name="slots"][value="睡前"]').check();
    await page.waitForFunction(()=>[...document.querySelectorAll('#modal-root .slot-line.is-selected .time-part,#modal-root .slot-line.is-selected .meal-segment button')].every(button=>button.getBoundingClientRect().height>=44));
    const heights=await page.locator('#modal-root .slot-line.is-selected').evaluateAll(lines=>lines.map(line=>({time:[...line.querySelectorAll('.time-part')].map(button=>button.getBoundingClientRect().height),meal:[...line.querySelectorAll('.meal-segment button')].map(button=>button.getBoundingClientRect().height)})));
    ok(heights.every(item=>[...item.time,...item.meal].every(height=>height>=44)),`时间与餐时按钮触控高度达标 ${width}/${font} ${JSON.stringify(heights)}`);await noHorizontalOverflow(`新增计划长字段 ${width}/${font}`);
    await page.screenshot({path:`${artifactDir}/${theme}-form-${width}-${font}.png`,animations:'disabled'});
    await page.locator('#modal-root .slot-reminder-control [data-action="time-picker"][data-slot="早餐"]').first().click();await page.locator('[data-form="time-picker"]').waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('#modal-root .wheel-list button')].every(button=>button.getBoundingClientRect().height>=44));
    const wheelHeights=await page.locator('.wheel-list button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().height));ok(await page.locator('.wheel-list').count()===2&&wheelHeights.every(height=>height>=44),`时间滚轮保持双列且可点击 ${width}/${font} ${JSON.stringify([...new Set(wheelHeights)])}`);await noHorizontalOverflow(`时间滚轮 ${width}/${font}`);if(width===320&&font==='elder')await page.screenshot({path:`${artifactDir}/${theme}-wheel-320-elder.png`,animations:'disabled'});await click('cancel-picker');
    await page.locator('[data-form="medicine"] button[type="submit"]').click();await page.locator('[data-action="save-med"]').waitFor();await noHorizontalOverflow(`核对页长字段 ${width}/${font}`);ok((await page.getByRole('dialog').innerText()).includes(name)&&await page.locator('[data-action="save-med"]').isVisible(),`核对内容完整且保存操作可达 ${width}/${font}`);if(width===320&&font==='elder')await page.screenshot({path:`${artifactDir}/${theme}-review-320-elder.png`,animations:'disabled'});await click('save-med');
    await page.locator('[data-action="navigate"][data-page="plans"]').click();const card=page.locator('.plan-card').filter({hasText:name});await card.locator('.plan-more').click();await click('edit-plan');await page.locator('[data-form="medicine"]').waitFor();
    ok(await page.locator('[name="name"]').inputValue()===name&&await page.locator('[name="doseUnit"]').inputValue()===unit,`编辑计划保留长字段 ${width}/${font}`);await noHorizontalOverflow(`编辑计划表单 ${width}/${font}`);await click('close-modal');
  }
  ok(errors.length===0,'布局矩阵无脚本错误');return{passed:checks.length,checks,errors,theme};
}
