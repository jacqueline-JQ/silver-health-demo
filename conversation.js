/* 有限输入解析只返回候选，不读写存档、不代替确认、不提供用药建议。 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Conversation=factory();})(typeof window==='undefined'?globalThis:window,()=>{
  const clone=x=>JSON.parse(JSON.stringify(x));
  const numerals={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,半:.5};
  const number=s=>s in numerals?numerals[s]:/^十[一二三四五六七八九]$/.test(s)?10+numerals[s[1]]:Number(s);
  const NUM='(?:\\d+(?:\\.\\d+)?|半|[一二两三四五六七八九十])',UNIT='(?:小包|毫升|片|粒|包|袋|支|滴|喷|瓶|丸)';
  const SLOTS=['早餐','午餐','晚餐','睡前'];
  const SLOT_RANGES={早餐:[300,660],午餐:[660,960],晚餐:[960,1200],睡前:[1200,1440]};
  const timeMinutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
  const examples=[
    ['完整计划','药名是示例药，每次1片，每天2次，早餐和晚餐，长期服用'],
    ['补齐与改口','那个，示例药，每次一片，早晚吃'],
    ['缺少用量','药名是另一示例药'],
    ['改为半片','不是一片，是半片'],
    ['修改餐时','早餐饭前改饭后'],
    ['本人声明','这次已经吃过了'],
    ['明确否定','还没吃'],
    ['需要澄清','没有按时服用'],
    ['记录血压','高压125，低压75，脉搏72，今天08:30测量'],
    ['记录血脂','总胆固醇4.8 mmol/L，甘油三酯1.2 mmol/L，今天08:30测量'],
    ['身体指标','身高160厘米，体重60公斤，今天08:30测量'],
    ['不支持的方案','药名是示例药，早一片晚两片'],
  ];
  function intent(text,current='home') {
    if(/推荐.*药|应该.*(吃|服)|加量|减量|补吃|换药|停药|吃什么药好|危险吗|正常吗|诊断|治疗/.test(text))return 'medical';
    if(/今天.*(什么药|吃什么)|(?:今晚|晚上|晚间).*(吃什么|什么药)|用药安排|几点|吃多少|提醒时间|计划用量|查询/.test(text))return 'query';
    if(/添加.*药|建.*计划|药名|每次/.test(text))return 'plan';
    if(/血压|高压|低压|收缩压|舒张压|血脂|胆固醇|甘油三酯|HDL|LDL|身高|体重|体脂/i.test(text))return 'health';
    if(/提醒.*(妈妈|爸爸|家人|长辈|TA)|主动提醒/.test(text))return 'remind';
    if(/延后|稍后|过一会|分钟后/.test(text))return 'snooze';
    if(/更正|改打卡/.test(text))return 'correct';
    if(/补记|补打卡/.test(text))return 'makeup';
    if(/吃过|吃了|没吃|服用|不用吃|不需要吃|无需|可能吃|好像吃/.test(text)&&current!=='plan')return 'record';
    return current;
  }
  function planModification(text) {
    return /(?:改为|改成|调整为|设为|换成|取消|去掉|清除|不设)/.test(text)&&/(?:药名|名称|每次|用量|单位|时段|早餐|午餐|晚餐|睡前|提醒|餐前|饭前|餐后|饭后|开始|日期|周期|长期|截至|备注)/.test(text);
  }
  function declaration(text,taskName='') {
    // 只接受完整支持陈述；未知后缀、问句和条件句均交给本人确认。
    const clauses=text.trim().replace(/[。！!]$/,'').replace(/\s/g,'').split(/[，,；;]/),statement=clauses.shift();
    const name=taskName?`(?:${taskName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})?`:'';
    const prefix=`(?:这次药|这一次药|这个药|我|这次|这一次|本次|刚才|后来|现在)*${name}`,dose=`(?:只)?(?:吃了|服用了)?${NUM}${UNIT}`;
    const facts={taken:`(?:已经(?:吃过|吃|服用)了?|已服用|吃过了?|吃了|服用了|(?:只)?(?:吃了|服用了)${NUM}${UNIT})`,not_taken:'(?:还没有吃过?|还没吃过?|没有吃过?|没吃过?|未服用|尚未服用)',skipped:'(?:无需服用|不用吃|不需要吃|不服)'};
    for(const [fact,pattern] of Object.entries(facts)){
      const match=new RegExp(`^${prefix}(${pattern})$`).exec(statement);if(!match)continue;
      if(clauses.length&&(fact!=='taken'||!clauses.every(part=>new RegExp(`^(?:${dose}|(?:实际时间[为是]?)?\\d{1,2}[:：]\\d{2})$`).test(part))))return {ambiguous:true};
      // 只从已通过整句白名单的事实正文和后缀提取，不扫描药名里的数字。
      const details=fact==='taken'?[match[1],...clauses].flatMap(part=>{
        const amount=part.match(new RegExp(`^(?:只)?(?:吃了|服用了)?(${NUM})(${UNIT})$`));
        if(amount)return [{kind:'dose',value:number(amount[1]),unit:amount[2]}];
        const time=part.match(/^(?:实际时间[为是]?)?(\d{1,2}[:：]\d{2})$/);
        return time?[{kind:'time',text:time[1]}]:[];
      }):[];
      return details.length?{fact,details}:{fact};
    }
    return {ambiguous:true};
  }
  function doseUpdate(text) {
    const mentions=[...text.matchAll(new RegExp(`(${NUM})\\s*(${UNIT})`,'g'))].map(match=>{
      const prefix=text.slice(Math.max(0,match.index-16),match.index).replace(/\s/g,'');
      const negated=/(?:不是|并非|不要|不为|并不是)$/.test(prefix);
      const replacement=!negated&&/(?:改成|改为|调整为|设为|而是|是)$/.test(prefix);
      const standalone=new RegExp(`^${NUM}${UNIT}[。！ ]*$`).test(text);
      const base=!negated&&(/每次(?:吃|服用)?$/.test(prefix)||replacement||standalone);
      return {value:number(match[1]),unit:match[2],negated,replacement,base};
    });
    if(!mentions.length)return null;
    const candidates=mentions.filter(item=>item.base),replacements=candidates.filter(item=>item.replacement);
    const pool=replacements.length?replacements:candidates;
    if(!pool.length&&mentions.every(item=>item.negated))return {unresolved:true};
    if(!pool.length)return null;
    const unique=new Map(pool.map(item=>[`${item.value}|${item.unit}`,item]));
    if(unique.size>1)return {conflict:true,candidates:[...unique.values()]};
    const candidate=[...unique.values()][0],negated=new Set(mentions.filter(item=>item.negated).map(item=>`${item.value}|${item.unit}`));
    if(negated.has(`${candidate.value}|${candidate.unit}`))return {conflict:true,candidates:[candidate]};
    return {candidate};
  }
  function parsePlan(text,old) {
    const d=clone(old),changed=[],issues=[],resolvedKinds=[];let expectedTimes,pendingSlots;
    const set=(key,value)=>{d[key]=value;changed.push(key);};
    const clean=text.replace(/^(?:嗯[，,、 ]*|那个[，,、 ]*|我想[，, ]*)+/,'');
    const nameMatch=clean.match(/(?:药名|名称)(?:改为|改成|调整为|设为|是|叫|为)?[：: ]?([^，,。；;]+)/),noteMatch=clean.match(/备注(?:改为|改成|调整为|设为|是|为|：|:| )?(.+)/);
    const scoped=clean.replace(nameMatch?.[0]||'','').replace(noteMatch?.[0]||'','');
    const doses=[...scoped.matchAll(new RegExp(`(?:早(?:餐|上)?|午(?:餐)?|晚(?:餐|上)?|睡前)(?:吃|服用)?(${NUM})(${UNIT})`,'g'))];
    if(/隔日|隔天|每周|每星期|按需|必要时|每隔/.test(scoped)||(doses.length>1&&new Set(doses.map(m=>`${number(m[1])}|${m[2]}`)).size>1)) {
      return {draft:clone(old),changed:[],issues:['当前计划只支持每日各时段相同用量，无法表达这段安排。原文已保留，请转手动核对；明确新的受支持安排前不会创建。'],blocked:true,blockKind:'schedule'};
    }
    const explicit=SLOTS.filter(slot=>scoped.includes(slot)),mentions=[...scoped.matchAll(/早餐|午餐|晚餐|睡前/g)],segments=mentions.map((m,i)=>({slot:m[0],text:scoped.slice(m.index,mentions[i+1]?.index??scoped.length)}));
    const negativeMeal=/(?:不要|不是|不选|不在|取消|不)(?:餐前|饭前|餐后|饭后)/,replacementMeal=/(?:改(?:为|成)?|调整为|设为|而是|(?<!不)是)(餐前|饭前|餐后|饭后)/,mealUpdates=new Map();
    const mealGroups=explicit.length?[...new Set(explicit)].map(slot=>({slot,text:segments.filter(segment=>segment.slot===slot).map(segment=>segment.text).join('，')})):[{slot:'',text:scoped}];
    for(const group of mealGroups){
      const replacements=[...group.text.matchAll(new RegExp(replacementMeal.source,'g'))].map(match=>/前/.test(match[1])?'餐前':'餐后');
      const plain=[...group.text.matchAll(/餐前|饭前|餐后|饭后/g)].map(match=>/前/.test(match[0])?'餐前':'餐后');
      const kind=group.slot?`meal-${group.slot}`:'meal';
      if(negativeMeal.test(group.text)&&!replacements.length)return {draft:clone(old),changed:[],issues:['未确定新的餐时，原草稿保持不变。请明确改为餐前／餐后，或说“清除餐时”。'],blocked:true,blockKind:kind};
      const finalMeals=replacements.length?replacements:plain;
      if(new Set(finalMeals).size>1)return {draft:clone(old),changed:[],issues:['餐时出现多个互相冲突的最终值，原草稿保持不变。请只明确一个餐时。'],blocked:true,blockKind:kind,conflicts:finalMeals};
      if(finalMeals.length)mealUpdates.set(group.slot,finalMeals.at(-1));
    }
    const doseResult=doseUpdate(scoped);
    if(doseResult?.unresolved)return {draft:clone(old),changed:[],issues:['未确定新的单次用量，原草稿保持不变。请明确改为多少以及单位。'],blocked:true,blockKind:'dose'};
    if(doseResult?.conflict)return {draft:clone(old),changed:[],issues:['单次用量出现多个互相冲突的最终值，原草稿保持不变。请只明确一个用量和单位。'],blocked:true,blockKind:'dose',conflicts:doseResult.candidates};
    const timeUpdates=new Map();
    for(const slot of explicit){
      const values=segments.filter(segment=>segment.slot===slot).flatMap(segment=>[...segment.text.matchAll(/(\d{1,2})[:：](\d{2})/g)].map(match=>`${match[1].padStart(2,'0')}:${match[2]}`));
      if(new Set(values).size>1)return {draft:clone(old),changed:[],issues:[`${slot}提醒时间出现多个互相冲突的最终值，原草稿保持不变。`],blocked:true,blockKind:`time-${slot}`};
      if(values.length){const value=values[0],minute=timeMinutes(value),[start,end]=SLOT_RANGES[slot];if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)||minute<start||minute>=end)return {draft:clone(old),changed:[],issues:[`${slot}提醒时间必须位于对应自然时段内，原草稿保持不变。`],blocked:true,blockKind:`time-${slot}`};timeUpdates.set(slot,value);}
    }
    let name=nameMatch?.[1];
    if(!name&&/每次/.test(scoped)){const prefix=scoped.split(/[，,]/)[0].replace(/^(?:添加药品|添加药|添加|创建计划)[：: ]*/,'');if(prefix&&!/每次|早餐|晚餐|睡前|不是|改为|改成/.test(prefix))name=prefix;}
    if(name&&name.length<=80)set('name',name.trim());
    const dose=doseResult?.candidate;
    if(dose){set('doseValue',dose.value);set('doseUnit',dose.unit);resolvedKinds.push('dose');}
    const unit=scoped.match(new RegExp(`(?:用量)?单位(?:改为|改成|调整为|设为|换成)[：: ]?(${UNIT})`));if(unit){set('doseUnit',unit[1]);resolvedKinds.push('dose');}
    const freq=scoped.match(new RegExp(`(?:每天|一天)(${NUM})次`));if(freq)expectedTimes=number(freq[1]);
    if(/早晚/.test(scoped)){pendingSlots=['早餐','晚餐'];issues.push('“早晚”是指早餐和晚餐吗？请点选确认；餐时可以不设。');}
    else if(explicit.length){set('slots',/(?:改为|改成|时段为|仅|只在)(?:早餐|午餐|晚餐|睡前)/.test(scoped)?explicit:[...new Set([...d.slots,...explicit])]);}
    const removed=explicit.filter(slot=>new RegExp(`(?:取消|去掉|不选|不要)(?:${slot})(?:时段|这次|这一顿|服用|吃药)?(?:[，,。；;]|$)|${slot}(?:时段)?(?:取消|去掉|不选|不要吃药)(?:[，,。；;]|$)`).test(scoped));
    if(removed.length)set('slots',d.slots.filter(s=>!removed.includes(s)));
    for(const [slot,value] of timeUpdates){d.slotSettings[slot].time=value;d.slotSettings[slot].reminderTime=value;changed.push(`time-${slot}`);resolvedKinds.push(`time-${slot}`);}
    const meals=[...scoped.matchAll(/餐前|饭前|餐后|饭后/g)];if(meals.length){
      if(explicit.length){for(const [slot,meal] of mealUpdates){if(!slot)continue;d.slotSettings[slot].meal=meal;changed.push(`meal-${slot}`);resolvedKinds.push(`meal-${slot}`);}}
      else {const meal=mealUpdates.get(''),oldMeal=/前/.test(meals[0][0])?'餐前':'餐后';const target=/改/.test(scoped)?d.slots.filter(s=>d.slotSettings[s].meal===oldMeal):d.slots;if(!target.length)issues.push('请先选择餐时对应的时段。');else for(const slot of target){d.slotSettings[slot].meal=meal;changed.push(`meal-${slot}`);resolvedKinds.push(`meal-${slot}`);}}
    }
    if(/不设餐时|清除餐时|没有餐时/.test(scoped)){for(const slot of explicit.length?explicit:d.slots){d.slotSettings[slot].meal='';changed.push(`meal-${slot}`);resolvedKinds.push(`meal-${slot}`);}}
    const start=scoped.match(/(?:从|开始日期(?:改为|改成|调整为|设为|为|是|：|:)?)(\d{4}-\d{2}-\d{2})/);if(start)set('startDate',start[1]);
    const end=scoped.match(/(?:截至|到)(\d{4}-\d{2}-\d{2})/);if(end){set('endDate',end[1]);set('duration','截至某日期');}else if(/长期/.test(scoped)){set('duration','长期服用');set('endDate','');}
    if(noteMatch)set('note',noteMatch[1]);
    return {draft:d,changed,issues,expectedTimes,pendingSlots,resolvedKinds,resolveBlocked:/改为每天|改成每天/.test(scoped)&&!!dose&&explicit.length>0};
  }
  function parseHealth(text,old,oldType,date,time) {
    let type=oldType;if(/血压|高压|低压|收缩压|舒张压/.test(text))type='blood_pressure';else if(/血脂|胆固醇|甘油三酯|HDL|LDL/i.test(text))type='blood_lipid';else if(/身体|身高|体重|体脂/.test(text))type='body';
    const d=type===oldType?clone(old):{values:{},extras:[],measuredAt:`${date}T${time}`,note:'',assisted:old.assisted,source:old.source},changed=[],issues=[],uncertain={};
    const fields={blood_pressure:[['systolic','高压|收缩压','mmHg'],['diastolic','低压|舒张压','mmHg'],['pulse','脉搏|心率','次/分']],blood_lipid:[['tc','总胆固醇','mmol/L'],['tg','甘油三酯','mmol/L'],['hdl','HDL(?:-C)?|高密度脂蛋白','mmol/L'],['ldl','LDL(?:-C)?|低密度脂蛋白','mmol/L']],body:[['height','身高','厘米|cm'],['weight','体重','公斤|千克|kg'],['fat','体脂率?|体脂','%|％']]}[type]||[];
    for(const[key,aliases,unit]of fields){const match=text.match(new RegExp(`(?:${aliases})[为是：: ]*(\\d+(?:\\.\\d+)?)\\s*([^，,。；;\\d ]*)`,'i'));if(match){const supplied=match[2];if(supplied&&!new RegExp(`^(?:${unit})$`,'i').test(supplied)){uncertain[key]=`${match[0]} 的单位无法确认，请按原报告核对，不自动换算。`;issues.push(uncertain[key]);continue;}d.values[key]=match[1];changed.push(key);}}
    const stamp=text.match(/(\d{4}-\d{2}-\d{2}|今天|昨天)[ T]*(\d{1,2})[:：](\d{2})/);if(stamp){const day=stamp[1]==='今天'?date:stamp[1]==='昨天'?new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10):stamp[1];d.measuredAt=`${day}T${stamp[2].padStart(2,'0')}:${stamp[3]}`;changed.push('measuredAt');}
    const note=text.match(/(?:备注[：:是 ]?|医生说|大夫说)(.+)/);if(note){d.note=`用户转述：${note[1]}`;changed.push('note');}
    return {type,draft:d,changed,issues,uncertain};
  }
  function taskFilter(text,events,date) {
    let selected=events;const explicitDate=text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if(explicitDate)selected=selected.filter(e=>e.date===explicitDate);else if(/昨天/.test(text)){const d=new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10);selected=selected.filter(e=>e.date===d);}else if(/今天|今晚|晚上|早上|这次/.test(text))selected=selected.filter(e=>e.date===date);
    const slots=SLOTS.filter(s=>text.includes(s));if(slots.length)selected=selected.filter(e=>slots.includes(e.slot));else if(/晚上|今晚|晚间/.test(text))selected=selected.filter(e=>['晚餐','睡前'].includes(e.slot));
    const names=[...new Set(events.map(e=>e.snapshot.name))].filter(n=>text.includes(n));if(names.length)selected=selected.filter(e=>names.includes(e.snapshot.name));
    return selected;
  }
  return {examples,number,intent,planModification,declaration,parsePlan,parseHealth,taskFilter};
});
