/* 演示舞台只持有展示快照；业务、身份检查与家庭存档均在原应用中。 */
(() => {
  const $=id=>document.getElementById(id),frame=$('app-frame'),container=$('app-container'),phone=$('phone');
  const CHANNEL='yaoanxin-demo',VERSION=1,ORIGIN=location.origin;
  const pending=new Map(),queue=[],dirtyControls=new Set();let ready=false,connected=false,themePending='',os='ios',snapshot=null,currentNotice=null,desiredVisible=false,sequence=0;
  const rid=()=>`demo-${Date.now().toString(36)}-${++sequence}`;
  const feedback=(text,error=false)=>{$('control-feedback').textContent=text;$('control-feedback').classList.toggle('is-error',error);};
  function request(type,payload={}) {
    const requestId=rid();
    const promise=new Promise((resolve,reject)=>pending.set(requestId,{resolve,reject,type,payload}));
    const message={channel:CHANNEL,version:VERSION,requestId,type,payload};
    if(!connected&&type!=='HELLO')queue.push(message);else frame.contentWindow.postMessage(message,ORIGIN);
    return {requestId,promise};
  }
  function send(type,payload={}) {return request(type,payload).promise.then(result=>{if(result.message)feedback(result.message);return result;}).catch(error=>{feedback(error.message,true);return {ok:false};});}
  function iconTransform() {
    const icon=$('launch-app').querySelector('svg').getBoundingClientRect(),screen=$('screen').getBoundingClientRect();
    const width=container.offsetWidth,height=container.offsetHeight;
    return `translate(${icon.left-screen.left}px, ${icon.top-screen.top-container.offsetTop}px) scale(${Math.max(.05,icon.width/width)},${Math.max(.05,icon.height/height)})`;
  }
  function showApp(visible,announce=true) {
    desiredVisible=visible;if(!ready)return;
    if(visible&&snapshot?.modalActive)hideBanner();
    if(visible&&phone.dataset.view==='desktop'&&Number(getComputedStyle(container).opacity)===0) { container.style.transition='none';container.style.transform=iconTransform();container.getBoundingClientRect();container.style.transition=''; }
    if(!visible)container.style.transform=iconTransform();else container.style.transform='translate(0,0) scale(1,1)';
    phone.dataset.view=visible?'app':'desktop';container.inert=!visible;container.setAttribute('aria-hidden',String(!visible));frame.inert=!visible;frame.tabIndex=visible?0:-1;$('desktop').inert=visible;
    if(!visible&&document.activeElement===frame)$('launch-app').focus({preventScroll:true});
    if(visible)phone.scrollIntoView({block:'start',behavior:'instant'});
    if(announce)send('VISIBILITY',{visible,visitId:rid()});
  }
  function applyTheme(next) {
    if(!['ios','harmonyos','android'].includes(next))return;
    os=next;ready=false;container.style.visibility='hidden';
    const call=request('THEME',{os});themePending=call.requestId;
    call.promise.then(result=>{
      if(call.requestId!==themePending)return;
      if(!result.ok||result.theme!==os)throw Error('主题确认未完成，请重试连接');
      themePending='';phone.dataset.os=os;document.documentElement.dataset.os=os;$('system-reference').textContent={ios:'iOS 18',harmonyos:'HarmonyOS 5',android:'Android 15 / Material 3'}[os];paintDesktopTime();document.querySelectorAll('.system-picker button').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.os===os));});
      ready=true;container.style.visibility='visible';$('recovery').hidden=true;showApp(desiredVisible);updateStatus();
    }).catch(error=>{feedback(error.message,true);$('recovery').hidden=false;});
  }
  function updateStatus() {if(snapshot)$('ready-status').textContent=`${ready?'已就绪':'同步主题中'} · ${snapshot.account.name} · ${snapshot.account.role==='elder'?'长辈端':'子女端'}`;}
  function paintDesktopTime(){if(!snapshot)return;$('desktop-time').textContent=os==='android'?snapshot.time.replace(':','\n'):snapshot.time;$('desktop-time').setAttribute('aria-label',`演示时间 ${snapshot.time}`);}
  function setValue(id,value) {if(document.activeElement!==$(id)&&!dirtyControls.has(id))$(id).value=value;}
  function options(id,items,selected) {
    const select=$(id),signature=JSON.stringify(items);
    if(select.dataset.signature!==signature) {select.replaceChildren(...items.map(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));select.dataset.signature=signature;}
    setValue(id,selected||'');
  }
  function receiveState(next) {
    if(!next||!next.account||!Array.isArray(next.accounts)||!Array.isArray(next.profiles)||!Array.isArray(next.notifications))return;
    const previous=snapshot;snapshot=next;
    $('status-time').textContent=next.time;paintDesktopTime();
    const date=new Date(`${next.date}T00:00:00Z`);$('desktop-date').textContent=`${date.getUTCMonth()+1}月${date.getUTCDate()}日 星期${'日一二三四五六'[date.getUTCDay()]}`;
    options('account-select',next.accounts.map(a=>[a.id,`${a.name} · ${a.role==='elder'?'长辈':'子女'}`]),next.account.id);
    options('profile-select',next.profiles.map(p=>[p.id,p.name]),next.profileId);$('profile-select').disabled=next.account.role==='elder';
    setValue('day-offset',next.dateOffset);setValue('clock-time',next.time);setValue('simulation-mode',next.simulationMode);
    $('notifications-enabled').checked=next.notificationsEnabled;$('private-preview').checked=next.privatePreview;
    const selection=$('notice-select').value,notices=next.notifications;
    options('notice-select',notices.map(n=>[n.id,`${n.kind} · ${n.date} · ${n.title}`]),notices.some(n=>n.id===selection)?selection:notices.at(-1)?.id);
    const selected=selectedNotice();$('delivery-status').textContent=selected?`${{delivered:'已展示',failed:'发送失败',pending:'待同步',suppressed:'已抑制'}[selected.deliveryState]}（模拟） · ${notices.length} 条逻辑通知`:'当前接收账号暂无模拟通知';
    if(currentNotice) {
      const latest=notices.find(n=>n.id===currentNotice.id);
      if(!latest||!next.notificationsEnabled||previous?.account.id!==next.account.id||(next.modalActive&&desiredVisible)||['taken','not_taken','skipped','cancelled','snoozed'].includes(latest.currentState))hideBanner();
      else {currentNotice=latest;paintBanner();}
    }
    if(ready&&!themePending&&next.theme!==os)applyTheme(next.theme);
    updateStatus();
  }
  const selectedNotice=()=>snapshot?.notifications.find(n=>n.id===$('notice-select').value);
  function paintBanner() {
    if(!currentNotice)return;
    $('banner-title').textContent=snapshot?.privatePreview?'用药记录提醒':currentNotice.title;
    $('banner-body').textContent=snapshot?.privatePreview?currentNotice.shortText:currentNotice.text;
  }
  function showBanner(notice) {
    if(!snapshot?.notificationsEnabled||notice.recipientId!==snapshot.account.id)return feedback('当前账号不是此通知接收方，或模拟通知已关闭',true);
    if(notice.deliveryState!=='delivered')return feedback('该通知尚未模拟送达，不能重播',true);
    if(desiredVisible&&snapshot.modalActive)return feedback('有新的模拟提醒；当前输入已保留，可从控制区打开关联记录');
    currentNotice=notice;paintBanner();$('banner').classList.add('is-visible');$('banner').inert=false;$('banner').setAttribute('aria-hidden','false');
  }
  function hideBanner() {$('banner').classList.remove('is-visible');$('banner').inert=true;$('banner').setAttribute('aria-hidden','true');currentNotice=null;}
  async function openNotice(notice) {
    if(!notice)return feedback('当前没有可打开的通知',true);
    if(!ready)return feedback('请等待主题确认',true);
    showApp(true,false);
    await send('VISIBILITY',{visible:true,visitId:rid()});
    await send('OPEN_NOTIFICATION',{notificationId:notice.id,eventId:notice.eventId,profileId:notice.profileId,date:notice.date,recipientId:notice.recipientId});hideBanner();
  }
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!==ORIGIN)return;
    const m=event.data;if(!m||m.channel!==CHANNEL||m.version!==VERSION||typeof m.requestId!=='string'||!m.payload||typeof m.payload!=='object'||!['READY','STATE','ACK','BANNER'].includes(m.type))return;
    if(m.type==='ACK') {const call=pending.get(m.requestId);if(!call)return;pending.delete(m.requestId);if(m.payload.ok)call.resolve(m.payload);else call.reject(Error(m.payload.message||'演示请求未完成'));return;}
    if(m.type==='READY') {receiveState(m.payload);if(!connected){connected=true;while(queue.length)frame.contentWindow.postMessage(queue.shift(),ORIGIN);os=m.payload.theme||'ios';}applyTheme(os);return;}
    if(m.type==='STATE')return receiveState(m.payload);
    if(m.type==='BANNER'&&m.payload.notification)return showBanner(m.payload.notification);
  });
  $('launch-app').addEventListener('click',()=>showApp(true));$('open-app').addEventListener('click',()=>showApp(true));$('show-desktop').addEventListener('click',()=>showApp(false));$('home-indicator').addEventListener('click',()=>showApp(false));
  $('launch-service').addEventListener('click',()=>showApp(true));
  $('banner-close').addEventListener('click',hideBanner);$('banner-open').addEventListener('click',()=>openNotice(currentNotice));
  $('account-select').addEventListener('change',event=>send('SWITCH_ACCOUNT',{accountId:event.target.value}));$('profile-select').addEventListener('change',event=>send('SWITCH_PROFILE',{profileId:event.target.value}));
  for(const id of ['day-offset','clock-time'])$(id).addEventListener('input',()=>dirtyControls.add(id));
  $('apply-clock').addEventListener('click',async()=>{if(!$('day-offset').reportValidity()||!$('clock-time').reportValidity())return;const result=await send('CLOCK',{dateOffset:Number($('day-offset').value),time:$('clock-time').value});if(result.ok)for(const id of ['day-offset','clock-time'])dirtyControls.delete(id);});
  document.querySelectorAll('[data-clock]').forEach(button=>{button.addEventListener('click',()=>{dirtyControls.delete('day-offset');dirtyControls.delete('clock-time');send('CLOCK',{dateOffset:Number(button.dataset.offset||0),time:button.dataset.clock});});});
  document.querySelectorAll('[data-scene]').forEach(button=>{button.addEventListener('click',async()=>{const result=await send('SCENE',{kind:button.dataset.scene});if(result.ok&&button.dataset.scene==='N3')showApp(true);});});
  document.querySelectorAll('.system-picker [data-os]').forEach(button=>{button.addEventListener('click',()=>applyTheme(button.dataset.os));});
  $('replay-notice').addEventListener('click',()=>{const n=selectedNotice();if(n){showBanner(n);feedback('仅重播横幅外观，不新增逻辑通知');}else feedback('当前账号暂无通知',true);});$('open-notice').addEventListener('click',()=>openNotice(selectedNotice()));
  $('notifications-enabled').addEventListener('change',event=>{if(!event.target.checked)hideBanner();send('OPTIONS',{notificationsEnabled:event.target.checked});});$('private-preview').addEventListener('change',event=>send('OPTIONS',{privatePreview:event.target.checked}));$('simulation-mode').addEventListener('change',event=>send('OPTIONS',{simulationMode:event.target.value}));
  $('sync-records').addEventListener('click',()=>send('SYNC'));$('retry-notices').addEventListener('click',()=>send('RETRY'));$('reset-demo').addEventListener('click',()=>{showApp(true);send('RESET_REQUEST');});
  $('retry-ready').addEventListener('click',()=>send('HELLO'));frame.addEventListener('load',()=>send('HELLO'));
  document.addEventListener('keydown',event=>{document.documentElement.dataset.input='keyboard';if(event.key==='Escape'&&currentNotice)hideBanner();});document.addEventListener('pointerdown',()=>{document.documentElement.dataset.input='pointer';});
  window.addEventListener('resize',()=>{if(ready&&!desiredVisible)container.style.transform=iconTransform();});
  setTimeout(()=>{if(!ready){$('recovery').hidden=false;$('ready-status').textContent='应用尚未就绪';}},5000);
})();
