/* 有限同源协议。演示参数只决定展示方式，不授予账号或业务权限。 */
(() => {
  const CHANNEL='yaoanxin-demo',VERSION=1;
  const types=new Set(['HELLO','THEME','VISIBILITY','CLOCK','SCENE','OPEN_NOTIFICATION','SWITCH_ACCOUNT','SWITCH_PROFILE','OPTIONS','SYNC','RETRY','RESET_REQUEST']);
  const embedded=new URLSearchParams(location.search).get('demo')==='1'&&window.parent!==window&&location.protocol!=='file:';
  const cache=new Map();let handler;
  const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const string=value=>typeof value==='string'&&value.length>0&&value.length<200;
  function validPayload(type,p) {
    if(!plain(p))return false;
    if(type==='THEME')return ['ios','harmonyos','android'].includes(p.os);
    if(type==='VISIBILITY')return typeof p.visible==='boolean'&&string(p.visitId);
    if(type==='CLOCK')return Number.isInteger(p.dateOffset)&&p.dateOffset>=0&&p.dateOffset<=31&&/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time);
    if(type==='SCENE')return ['N1','N2','N3'].includes(p.kind);
    if(type==='OPEN_NOTIFICATION')return ['notificationId','eventId','profileId','date','recipientId'].every(k=>string(p[k]));
    if(type==='SWITCH_ACCOUNT')return string(p.accountId);
    if(type==='SWITCH_PROFILE')return string(p.profileId);
    if(type==='OPTIONS')return Object.keys(p).length>0&&Object.entries(p).every(([k,v])=>['notificationsEnabled','privatePreview'].includes(k)?typeof v==='boolean':k==='simulationMode'&&['online','offline','failure'].includes(v));
    return Object.keys(p).length===0;
  }
  function send(type,payload={},requestId=`app-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
    if(embedded)window.parent.postMessage({channel:CHANNEL,version:VERSION,type,payload,requestId},location.origin);
  }
  window.addEventListener('message',event=>{
    if(!embedded||event.source!==window.parent||event.origin!==location.origin||!handler)return;
    const m=event.data;
    if(!plain(m)||m.channel!==CHANNEL||m.version!==VERSION||!types.has(m.type)||!string(m.requestId)||!validPayload(m.type,m.payload))return;
    if(cache.has(m.requestId)) { const c=cache.get(m.requestId);if(c.signature===JSON.stringify([m.type,m.payload]))send('ACK',c.result,m.requestId);return; }
    let result;
    try { result={ok:true,...handler(m.type,m.payload,m.requestId)}; }
    catch(error) { result={ok:false,message:error.message||'演示动作未完成'}; }
    cache.set(m.requestId,{signature:JSON.stringify([m.type,m.payload]),result});
    if(cache.size>512)cache.delete(cache.keys().next().value);
    send('ACK',result,m.requestId);
  });
  window.DemoBridge={embedded,send,start(fn,snapshot){handler=fn;send('READY',snapshot);}};
})();
