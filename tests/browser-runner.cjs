// 使用已安装的Playwright包和独立浏览器，不增加应用运行依赖。
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
function playwright(){try{return require('playwright');}catch{}const cache=path.join(os.homedir(),'.npm/_npx');for(const name of fs.readdirSync(cache)){const modulePath=path.join(cache,name,'node_modules/playwright');if(fs.existsSync(path.join(modulePath,'package.json')))return require(modulePath);}throw Error('未找到已安装的Playwright，请指定现有安装环境');}
(async()=>{
  const [script,destination]=process.argv.slice(2);if(!script||!destination)throw Error('用法：node tests/browser-runner.cjs tests/xxx.browser.js output/.../result.json');
  if(fs.existsSync(destination))fs.unlinkSync(destination);
  const artifactDir=path.join(path.dirname(destination),path.basename(script,'.browser.js'));fs.mkdirSync(artifactDir,{recursive:true});
  const browser=await playwright().chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||'chrome'}),context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage();
  page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);const dialogErrors=[];
  page.on('dialog',async dialog=>{console.log('dialog:',dialog.type());try{await dialog.accept();console.log('dialog accepted');}catch(e){dialogErrors.push(e.message);}});
  try{const test=vm.runInThisContext(fs.readFileSync(script,'utf8'),{filename:script});const result=await test(page,{artifactDir,handleDialogs:false});if(!result||!result.passed||result.errors?.length||dialogErrors.length)throw Error('检查函数未返回完整通过结果');fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');console.log(`PASS ${result.passed} checks → ${destination}`);}
  catch(error){await page.screenshot({path:path.join(artifactDir,'failure.png')}).catch(()=>{});const contextInfo=await page.evaluate(()=>({url:location.href,dialog:document.querySelector('#modal-root')?.innerText})).catch(()=>({url:page.url()}));fs.writeFileSync(path.join(artifactDir,'failure.json'),JSON.stringify({error:error.stack,...contextInfo},null,2));console.error(error.stack,contextInfo);process.exitCode=1;}
  finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
