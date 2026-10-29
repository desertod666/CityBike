/* Latest ESP CAN values only. Bounded RAM; no recorder, adapter I/O or uploads. */
'use strict';
(() => {
  const LIMIT=64,MAX_AGE=86400000;
  const RAW={0x03106303:['Управление · таймер выключения','Значение'],0x04f83402:['Батарея · состояние','Код состояния'],0x04ff1400:['Батарея · предупреждения','Код предупреждения']};
  const TITLES={CR_Warning:'Контроллер · ошибки',Battery_SOC_SOH_Information:'Батарея · заряд и ёмкость',Battery_Current_Voltage_Temp:'Батарея · питание',CR_Walk_Assist_Information:'Помощь при ходьбе',CR_Torque_Sensor_Information:'Контроллер · датчики и запас хода',CR_Speed_Current_Voltage_Temp:'Контроллер · движение и питание',Torque_Sensor_Signal:'Датчик момента',CR_Turn_Off_Instruction:'Контроллер · выключение',CR_Calories:'Контроллер · энергия',CR_Mode:'Контроллер · режим',Pulse_Count:'Служебный счётчик',HMI_Mode:'Органы управления',CR_Wheel_Reference_V25:'Колесо и ограничение скорости'};
  const LABELS={Error:'Код ошибки',Total_Capacity_mAh:'Полная ёмкость',Residual_Capacity_mAh:'Остаток ёмкости','Relative_Capacity %':'Относительный заряд','Absolut_Capacity %':'Абсолютный заряд',SOH:'Состояние батареи',Battery_Current_A:'Ток батареи',Battery_Voltage_V:'Напряжение батареи',Temperature:'Температура батареи',Walk_Assist_Status:'Состояние walk assist',Remaining_Capacity:'Заряд по контроллеру',Trip:'Пробег поездки',Pedal_Revolution:'Каденс по контроллеру',Torque_Sensor_Voltage:'Сигнал момента',Remaining_Distance:'Запас хода',Speed:'Скорость',Current:'Ток контроллера',CR_Voltage:'Напряжение контроллера',Motor_Temperature:'Температура мотора',Controller_Temperature:'Температура контроллера',Cadence:'Каденс',Frame_Counts:'Счётчик датчика','1 means do not turn off':'Запрет выключения',Calories:'Калории',Mode:'Режим',Pulse_Count:'Счётчик импульсов',No_of_total_Modes:'Количество уровней',Gears:'Уровень помощи',Light_Status:'Свет',Trip_Reset:'Флаг сброса поездки',Speed_Limit_kmh:'Ограничение скорости',Wheel_Code:'Код размера колеса',Wheel_Circumference_mm:'Окружность колеса'};
  const UNITS={'km/h':'км/ч',rpm:'об/мин',mV:'мВ',V:'В',A:'А',mAh:'мА·ч',mm:'мм',km:'км',code:'код'};
  const key=f=>(f.extended?'E':'S')+':'+Number.parseInt(f.id,16).toString(16)+(f.rtr?':R':':D');
  function valid(f){return !!f&&typeof f.id==='string'&&/^[0-9a-fA-F]{1,8}$/.test(f.id)&&typeof f.extended==='boolean'&&typeof f.rtr==='boolean'&&Number.isInteger(f.dlc)&&f.dlc>=0&&f.dlc<=8&&Number.parseInt(f.id,16)<(f.extended?0x20000000:0x800)&&typeof f.data==='string'&&/^(?:[0-9a-fA-F]{2})*$/.test(f.data)&&f.data.length===(f.rtr?0:f.dlc*2)&&Number.isSafeInteger(f.seq)&&f.seq>=0&&Number.isSafeInteger(f.t_us)&&f.t_us>=0;}
  const IDENTITY_KEYS=['id','extended','rtr','dlc','data','seq','t_us'];
  const IDENTITY_OBJECTS=['6000','6001','6002','6003'];
  const compact=f=>Object.fromEntries(IDENTITY_KEYS.map(k=>[k,k==='id'?f[k].toUpperCase().padStart(8,'0'):k==='data'?f[k].toUpperCase():f[k]]));
  function validateIdentity(value){
    if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='age_ms,boot,epoch,frames,object'||typeof value.boot!=='string'||!/^[A-F0-9]{8}$/.test(value.boot)||!Number.isSafeInteger(value.epoch)||value.epoch<0||!IDENTITY_OBJECTS.includes(value.object)||!Number.isSafeInteger(value.age_ms)||value.age_ms<0||value.age_ms>MAX_AGE||!Array.isArray(value.frames)||value.frames.length<2||value.frames.length>9)return null;
    let length=null,total=0,previous=null;
    for(let index=0;index<value.frames.length;index++){
      const f=value.frames[index];
      if(!f||Object.keys(f).sort().join(',')!==[...IDENTITY_KEYS].sort().join(',')||!valid(f)||f.extended!==true||f.rtr!==false||f.dlc===0||!(/^[A-F0-9]{8}$/).test(f.id)||!(/^(?:[A-F0-9]{2})*$/).test(f.data))return null;
      const id=parseInt(f.id,16),op=(id>>>16)&7,parameter=id&65535;
      if((id>>>24)!==2||((id>>>19)&31)!==3||previous&&(f.seq<=previous.seq||f.t_us<previous.t_us))return null;
      if(!index){if(op!==4||parameter!==parseInt(value.object,16)||f.dlc!==1)return null;length=parseInt(f.data,16);if(length<1||length>64)return null;}
      else{const last=index===value.frames.length-1;if(op!==(last?6:5)||parameter!==index-1||!last&&f.dlc!==8)return null;total+=f.dlc;if(total>length||!last&&total>=length)return null;}
      previous=f;
    }
    if(total!==length||previous.t_us-value.frames[0].t_us>2000000)return null;
    return {object:value.object,age_ms:value.age_ms,frames:value.frames.map(compact),boot:value.boot,epoch:value.epoch};
  }
  function interpretIdentity(value){
    const r=validateIdentity(value);if(!r)return null;const raw=r.frames.slice(1).map(f=>f.data).join(''),bytes=raw.match(/../g).map(x=>parseInt(x,16));
    return {object:r.object,raw_hex:raw,text:bytes.every(x=>x>=32&&x<=126)?String.fromCharCode(...bytes):null,source:2,destination:3,reference:'Bafang GYE-1--02 V2.5 p25; observed controller framing',compatibility:'reference_not_vehicle_identification'};
  }
  class IdentityAssembler{
    constructor(now=()=>performance.now()){this.now=now;this.reset();}
    reset(boot=null,epoch=null){this.boot=boot;this.epoch=epoch;this.pending=null;this.latest=new Map();this.lastSeq=null;this.lastUs=null;}
    feed(f){
      if(!valid(f)||typeof f.boot!=='string'||!/^[A-F0-9]{8}$/.test(f.boot)||!Number.isSafeInteger(f.epoch)||f.epoch<0){this.pending=null;return null;}
      if(this.boot!==f.boot||this.epoch!==f.epoch)this.reset(f.boot,f.epoch);
      if(this.lastUs!==null&&f.t_us<this.lastUs){this.pending=null;this.latest.clear();}
      if(this.lastSeq!==null&&f.seq!==this.lastSeq+1)this.pending=null;
      this.lastSeq=f.seq;this.lastUs=f.t_us;
      if(this.pending&&f.t_us-this.pending.frames[0].t_us>2000000)this.pending=null;
      const id=parseInt(f.id,16),op=(id>>>16)&7,parameter=id&65535;
      if(!f.extended||f.rtr||(id>>>24)!==2||((id>>>19)&31)!==3)return null;
      if(op===4){this.pending=null;const object=parameter.toString(16).toUpperCase().padStart(4,'0'),length=parseInt(f.data,16);if(IDENTITY_OBJECTS.includes(object)&&f.dlc===1&&length>0&&length<=64)this.pending={object,length,frames:[compact(f)],next:0,total:0};return null;}
      if(op===3){this.pending=null;return null;}
      if(op!==5&&op!==6||!this.pending)return null;
      const p=this.pending,total=p.total+f.dlc;
      if(parameter!==p.next||!f.dlc||total>p.length||op===5&&(f.dlc!==8||total>=p.length)||op===6&&total!==p.length){this.pending=null;return null;}
      p.frames.push(compact(f));p.next++;p.total=total;
      if(op===6){this.pending=null;const record=validateIdentity({object:p.object,age_ms:0,frames:p.frames,boot:this.boot,epoch:this.epoch});if(record){this.latest.set(record.object,{record,seen:this.now()});return record;}}
      return null;
    }
    snapshot(boot,epoch){if(boot!==this.boot||epoch!==this.epoch)return [];return [...this.latest.values()].map(x=>({...x.record,frames:x.record.frames.map(compact),age_ms:Math.min(MAX_AGE,Math.max(0,Math.round(this.now()-x.seen)))}));}
  }
  // One-byte canonical warning broadcasts. Other frames remain in the raw view.
  const WARNING_LIMIT=8;
  function warningFrame(f){
    if(!valid(f)||!f.extended||f.rtr||f.dlc!==1)return false;
    const id=parseInt(f.id,16),source=id>>>24;
    return source>=1&&source<=15&&((id>>>19)&31)===31&&((id>>>16)&7)===7&&(id&65535)===(0x10+source)*256;
  }
  function validateWarningJournal(value){
    if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='events,evicted,schema'||value.schema!==1||!Number.isSafeInteger(value.evicted)||value.evicted<0||!Array.isArray(value.events)||value.events.length>WARNING_LIMIT)return null;
    let prior=null;const events=[];
    for(const e of value.events){
      if(!e||Object.keys(e).sort().join(',')!=='count,first,first_age_ms,last,last_age_ms,next,next_age_ms'||!Number.isSafeInteger(e.count)||e.count<1)return null;
      const fs=[e.first,e.last,...(e.next?[e.next]:[])];
      if(fs.some(f=>!f||Object.keys(f).sort().join(',')!==[...IDENTITY_KEYS].sort().join(',')||!warningFrame(f)||!(/^[A-F0-9]{8}$/).test(f.id)||!(/^[A-F0-9]{2}$/).test(f.data)))return null;
      const a=e.first,b=e.last,c=e.next;
      if(a.data==='00'||a.id!==b.id||a.data!==b.data||b.seq<a.seq||b.t_us<a.t_us||e.count>b.seq-a.seq+1||prior&&a.seq<=prior.first.seq)return null;
      if(c&&(c.id!==a.id||c.data===a.data||c.seq<=b.seq||c.t_us<b.t_us))return null;
      if(!c&&e.next!==null)return null;
      for(const age of [e.first_age_ms,e.last_age_ms,...(c?[e.next_age_ms]:[])])if(!Number.isSafeInteger(age)||age<0||age>MAX_AGE)return null;
      if(e.first_age_ms<e.last_age_ms||c&&e.last_age_ms<e.next_age_ms||!c&&e.next_age_ms!==null)return null;
      events.push({first:compact(a),last:compact(b),next:c?compact(c):null,count:e.count,first_age_ms:e.first_age_ms,last_age_ms:e.last_age_ms,next_age_ms:e.next_age_ms});prior=e;
    }
    return {schema:1,events,evicted:value.evicted};
  }
  class WarningJournal{
    constructor(now=()=>performance.now()){this.now=now;this.reset();}
    reset(){this.events=[];this.nodes=new Map();this.evicted=0;this.lastSeq=-1;this.lastTime=-1;}
    feed(f){
      if(!warningFrame(f)||f.seq<=this.lastSeq||f.t_us<this.lastTime)return;
      this.lastSeq=f.seq;this.lastTime=f.t_us;
      const frame=compact(f),previous=this.nodes.get(frame.id),now=this.now();
      if(previous&&(frame.seq<=previous.frame.seq||frame.t_us<previous.frame.t_us))return;
      if(previous?.frame.data===frame.data){
        if(previous.event){previous.event.last=frame;previous.event.last_seen=now;previous.event.count=Math.min(Number.MAX_SAFE_INTEGER,previous.event.count+1);}
        previous.frame=frame;return;
      }
      if(previous?.event){previous.event.next=frame;previous.event.next_seen=now;}
      let event=null;
      if(frame.data!=='00'){
        event={first:frame,last:frame,next:null,count:1,first_seen:now,last_seen:now,next_seen:null};this.events.push(event);
        if(this.events.length>WARNING_LIMIT){this.events.shift();this.evicted++;}
      }
      this.nodes.set(frame.id,{frame,event});
    }
    snapshot(){const now=this.now(),age=at=>Math.min(MAX_AGE,Math.max(0,Math.round(now-at)));
      return {schema:1,evicted:this.evicted,events:this.events.map(e=>({first:compact(e.first),last:compact(e.last),next:e.next?compact(e.next):null,count:e.count,first_age_ms:age(e.first_seen),last_age_ms:age(e.last_seen),next_age_ms:e.next?age(e.next_seen):null}))};
    }
  }
  class Cache {
    constructor(schema,now=()=>performance.now()){this.warnings=new WarningJournal(now);this.identity=new IdentityAssembler(now);this.schema=schema;this.now=now;this.frames=new Map();this.boot=null;this.epoch=null;this.count=0;this.evicted=0;}
    reset(boot,epoch){this.warnings.reset();this.identity.reset(boot,epoch);this.frames.clear();this.boot=boot;this.epoch=epoch;this.count=0;this.evicted=0;}
    ingest(f){
      if(!valid(f)||typeof f.boot!=='string'||!/^[A-F0-9]{8}$/.test(f.boot)||!Number.isSafeInteger(f.epoch)||f.epoch<0)return false;
      if(this.boot!==f.boot||this.epoch!==f.epoch)this.reset(f.boot,f.epoch);
      const k=key(f),previous=this.frames.get(k);if(previous&&f.seq<=previous.seq)return false;
      this.identity.feed(f);this.warnings.feed(f);
      const known=id=>!!RAW[id]||id===0x02f83203||globalThis.ByBafangBattery?.known(id)||this.schema?.messages?.some(m=>parseInt(m.id,16)===id);
      if(!this.frames.has(k)&&this.frames.size>=LIMIT){const entries=[...this.frames];const old=entries.filter(([,v])=>!known(parseInt(v.id,16))).sort((a,b)=>a[1].seen-b[1].seen)[0]||entries.sort((a,b)=>a[1].seen-b[1].seen)[0];this.frames.delete(old[0]);this.evicted++;}
      this.frames.set(k,{id:f.id.toUpperCase().padStart(8,'0'),extended:f.extended,rtr:f.rtr,dlc:f.dlc,data:f.data.toUpperCase(),seq:f.seq,t_us:f.t_us,seen:this.now()});this.count++;return true;
    }
    snapshot(device={},connected=false){
      const same=this.boot===device.boot&&this.epoch===device.epoch;
      return {schema:1,boot:device.boot||null,epoch:device.epoch??null,stream_active:!!connected&&device.can==='running',
        ...(same?{warning_journal:this.warnings.snapshot()}:{}),
        ...(same&&this.identity.latest.size?{controller_identity:this.identity.snapshot(device.boot,device.epoch)}:{}),
        frames:same?[...this.frames.values()].map(({seen,...f})=>({...f,age_ms:Math.min(MAX_AGE,Math.max(0,Math.round(this.now()-seen)))})):[],evicted_ids:this.evicted};
    }
  }
  const WARNING_TEXT={"No current warning reported":{"ru":"В текущем сообщении нет предупреждения","en":"No current warning reported","nb":"Ingen aktuell advarsel rapportert"},"Brake already applied":{"ru":"Тормоз уже нажат","en":"Brake already applied","nb":"Bremsen er aktivert"},"Throttle fault":{"ru":"Ошибка ручки газа","en":"Throttle fault","nb":"Feil på gasshendel"},"Throttle not returned to zero":{"ru":"Ручка газа не вернулась в ноль","en":"Throttle not returned to zero","nb":"Gasshendelen er ikke tilbake i nullstilling"},"Undervoltage":{"ru":"Пониженное напряжение","en":"Undervoltage","nb":"Underspenning"},"Overvoltage":{"ru":"Повышенное напряжение","en":"Overvoltage","nb":"Overspenning"},"Motor Hall signal wiring fault":{"ru":"Ошибка сигнальных проводов датчиков Холла мотора","en":"Motor Hall signal wiring fault","nb":"Feil på ledninger til motorens Hall-sensorer"},"Motor phase wiring fault":{"ru":"Ошибка фазных проводов мотора","en":"Motor phase wiring fault","nb":"Feil på motorens faseledninger"},"Motor overtemperature protection":{"ru":"Защита от перегрева мотора","en":"Motor overtemperature protection","nb":"Motorvern mot overtemperatur"},"Motor temperature sensor fault":{"ru":"Ошибка датчика температуры мотора","en":"Motor temperature sensor fault","nb":"Feil på motorens temperatursensor"},"Current sensor fault":{"ru":"Ошибка датчика тока","en":"Current sensor fault","nb":"Feil på strømsensor"},"Controller overtemperature protection":{"ru":"Защита от перегрева контроллера","en":"Controller overtemperature protection","nb":"Kontrollervern mot overtemperatur"},"Controller temperature sensor fault":{"ru":"Ошибка датчика температуры контроллера","en":"Controller temperature sensor fault","nb":"Feil på kontrollerens temperatursensor"},"Speed sensor fault":{"ru":"Ошибка датчика скорости","en":"Speed sensor fault","nb":"Feil på hastighetssensor"},"Headlight fault":{"ru":"Ошибка переднего света","en":"Headlight fault","nb":"Feil på frontlys"},"Torque sensor signal fault":{"ru":"Ошибка сигнала датчика момента","en":"Torque sensor signal fault","nb":"Feil på signal fra momentsensor"},"Overcurrent":{"ru":"Превышен ток","en":"Overcurrent","nb":"Overstrøm"},"HMI/controller communication fault":{"ru":"Ошибка связи HMI и контроллера","en":"HMI/controller communication fault","nb":"Kommunikasjonsfeil mellom HMI og kontroller"},"Low voltage protection":{"ru":"Защита от низкого напряжения","en":"Low voltage protection","nb":"Vern mot underspenning"},"Overvoltage protection":{"ru":"Защита от повышенного напряжения","en":"Overvoltage protection","nb":"Vern mot overspenning"},"Brake detection circuit fault":{"ru":"Ошибка цепи определения тормоза","en":"Brake detection circuit fault","nb":"Feil i krets for bremseregistrering"},"15 V supply detection fault":{"ru":"Ошибка контроля питания 15 В","en":"15 V supply detection fault","nb":"Feil i overvåking av 15 V forsyning"},"Key detection circuit fault":{"ru":"Ошибка цепи определения кнопки","en":"Key detection circuit fault","nb":"Feil i krets for knapperegistrering"},"Battery total voltage too high":{"ru":"Напряжение батареи слишком высокое","en":"Battery total voltage too high","nb":"Batterispenningen er for høy"},"Battery total voltage too low":{"ru":"Напряжение батареи слишком низкое","en":"Battery total voltage too low","nb":"Batterispenningen er for lav"},"Battery cell current too high":{"ru":"Ток ячеек батареи слишком большой","en":"Battery cell current too high","nb":"Battericellenes strøm er for høy"},"Battery temperature too high":{"ru":"Температура батареи слишком высокая","en":"Battery temperature too high","nb":"Batteritemperaturen er for høy"},"Battery temperature too low":{"ru":"Температура батареи слишком низкая","en":"Battery temperature too low","nb":"Batteritemperaturen er for lav"},"Battery SOC too high":{"ru":"SOC батареи слишком высокий","en":"Battery SOC too high","nb":"Batteriets SOC er for høy"},"Battery SOC too low":{"ru":"SOC батареи слишком низкий","en":"Battery SOC too low","nb":"Batteriets SOC er for lav"},"Transmission stuck":{"ru":"Трансмиссия заклинила","en":"Transmission stuck","nb":"Giret sitter fast"},"Transmission cannot reset":{"ru":"Трансмиссия не сбрасывается","en":"Transmission cannot reset","nb":"Giret kan ikke tilbakestilles"},"Electronic lock stuck":{"ru":"Электронный замок заклинил","en":"Electronic lock stuck","nb":"Den elektroniske låsen sitter fast"},"Bluetooth module fault":{"ru":"Ошибка модуля Bluetooth","en":"Bluetooth module fault","nb":"Feil på Bluetooth-modul"}};
  const warningText=value=>WARNING_TEXT[value]?.[globalThis.ByI18n?.language?.()||"en"]||value;
  function identityCard(snapshot,extraAge=0){
    const records=snapshot?.controller_identity;if(!snapshot||snapshot.schema!==1||typeof snapshot.boot!=='string'||!/^[A-F0-9]{8}$/.test(snapshot.boot)||!Number.isSafeInteger(snapshot.epoch)||snapshot.epoch<0||typeof snapshot.stream_active!=='boolean'||!Number.isFinite(extraAge)||extraAge<0||!Array.isArray(records)||!records.length||records.length>4||new Set(records.map(r=>r?.object)).size!==records.length)return [];
    const checked=records.map(validateIdentity);if(checked.some(r=>!r||r.boot!==snapshot.boot||r.epoch!==snapshot.epoch))return [];
    const labels={'6000':'Аппаратная версия','6001':'Версия ПО','6002':'Модель контроллера','6003':'Серийный номер контроллера'},ids=[],consumed=[];
    const fields=IDENTITY_OBJECTS.map(object=>{const record=checked.find(r=>r.object===object),decoded=record?interpretIdentity(record):null;if(record){ids.push(record.frames[0].id);consumed.push(...record.frames.map(f=>f.id));}return {key:'Identity_'+object,name:labels[object],value:decoded?decoded.text??'0x'+decoded.raw_hex:'—'};});
    const age=Math.max(...checked.map(r=>r.age_ms))+Math.max(0,extraAge);
    return [{id:'021C6000',title:'Контроллер · идентификаторы',fields,age_ms:age,stale:snapshot.stream_active!==true||age>60000,observed:true,invalid:false,source_ids:ids,consumed_ids:consumed}];
  }
  function cards(snapshot,schema,extraAge=0){
    const latest=new Map((snapshot?.frames||[]).filter(valid).map(f=>[key(f),f]));
    const catalog=(schema?.messages||[]).map(m=>({id:parseInt(m.id,16),name:m.name.replace(/\s+/g,''),signals:m.signals}));
    catalog.push({id:0x02f83203,name:'CR_Wheel_Reference_V25',signals:[{name:'Speed_Limit_kmh'},{name:'Wheel_Code'},{name:'Wheel_Circumference_mm'}]});
    for(const [id,[title,label]]of Object.entries(RAW))catalog.push({id:Number(id),title,rawLabel:label});
    const order=[0x04f83401,0x04f83400,0x02f83201,0x02f83200,0x03106300,0x01f83100,0x02f83203,0x02f83206,0x02f83202,0x02f83204,0x02f83205,0x02f83000,0x02ff1200,0x04f83402,0x04ff1400,0x03106303];catalog.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    const number=new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3});
    const base=catalog.map(m=>{
      const frame=latest.get('E:'+m.id.toString(16)+':D'),decoded=frame?globalThis.BafangDecoder.decode(frame,schema):null;
      const age=frame?Math.max(0,frame.age_ms||0)+Math.max(0,extraAge):null;
      const stale=!snapshot?.stream_active||age===null||age>(m.id===0x02f83000?30000:5000);
      const fields=m.rawLabel?[{key:'raw',name:m.rawLabel,value:frame?'0x'+frame.data:'—',raw:true}]:m.signals.map(s=>{
        const f=decoded?.fields?.[s.name],unavailable=f?.validity==='suspected_unavailable'||(s.name==='Motor_Temperature'&&[0,190].includes(f?.raw));
        return {key:s.name,name:LABELS[s.name]||s.name.replaceAll('_',' '),value:!f||unavailable||!Number.isFinite(f.value)?'—':s.name==='Error'?'0x'+frame.data:number.format(f.value),unit:UNITS[f?.unit]||f?.unit||({Temperature:'°C',SOH:'%','Relative_Capacity %':'%','Absolut_Capacity %':'%'}[s.name])||'',note:unavailable?'raw 0x'+Math.trunc(f.raw).toString(16).toUpperCase()+' · значение не подтверждено':null};
      });
      if(m.id===0x02ff1200){
        const ref=decoded?.fields?.Error?.reference_warning;
        fields.push({key:'error_reference',name:'Bafang V2.5 · справочно',value:!ref?'—':ref.v25?warningText(ref.v25):'Неизвестный код'});
        if(ref?.legacy_sym?.length&&ref.source_agreement!==true)fields.push({key:'error_legacy',name:'Старый SYM · другая нумерация',value:ref.legacy_sym.map(warningText).join(' / ')});
        fields.push({key:'error_scope',name:'Область показания',value:ref?'Текущее сообщение CAN; сохранённые ошибки PCB не прочитаны':'—'});
      }
      if(m.id===0x04f83401){const f=decoded?.fields;fields.push({key:'calculated_power',name:'Электрическая мощность · расчёт',value:f?number.format(f.Battery_Current_A.value*f.Battery_Voltage_V.value):'—',unit:'Вт'});}
      return {id:m.id.toString(16).toUpperCase().padStart(8,'0'),title:m.title||TITLES[m.name]||m.name,fields,age_ms:age,stale,observed:!!frame,invalid:!!frame&&decoded?.status==='invalid'};
    });
    return base.concat(globalThis.ByBafangBattery?.cards(snapshot,extraAge)||[],identityCard(snapshot,extraAge));
  }
  function paintWarnings(snapshot,extraAge=0){
    if(!dom?.warnings)return;
    const journal=validateWarningJournal(snapshot?.warning_journal),root=dom.warnings;root.replaceChildren();
    const info=document.createElement('p');info.className='subtle';
    if(!journal){info.textContent=tr('Журнал начнётся после подключения обновлённой страницы USB-ПК.');root.append(info);return;}
    if(!journal.events.length){info.textContent=tr('Ненулевые коды пока не получены. Это не проверка под нагрузкой.');root.append(info);return;}
    for(const event of [...journal.events].reverse()){
      const row=document.createElement('article'),title=document.createElement('strong'),state=document.createElement('span'),raw=document.createElement('small');
      row.className='fault-event';const code=event.first.data,source=parseInt(event.first.id,16)>>>24,ref=globalThis.BafangDecoder?.warningReference(parseInt(code,16));
      const name=source===2?'Контроллер':source===4?'Батарея':'Узел';
      title.textContent=tr(name)+' · 0x'+code+' · '+(ref?.v25?warningText(ref.v25):tr('Неизвестный код'));
      state.textContent=event.next?(event.next.data==='00'?tr('После ошибки получен код 00'):tr('Следующий код')+': 0x'+event.next.data):tr('Последний полученный код');
      const age=Math.max(0,event.last_age_ms+extraAge);raw.textContent='CAN '+event.first.id+' · '+tr('Повторов')+': '+event.count+' · '+Math.floor(age/1000)+' '+tr('с назад');
      row.append(title,state,raw);root.append(row);
    }
    if(journal.evicted){info.textContent=tr('Более ранние события вытеснены')+': '+journal.evicted;root.append(info);}
  }
  let local=null,remote=null,remoteAt=0,dom=null,pending=false,actionError='';
  const tr=value=>globalThis.ByI18n?.t?.(value)||value;
  const setText=(el,value)=>{value=tr(value);if(el.textContent!==value)el.textContent=value;};
  function remoteState(state){globalThis.ByReaderSelftest?.remoteState(state);globalThis.ByEspBattery?.remoteState(state);remote=state;remoteAt=performance.now();paint();}
  function bind(runtime){globalThis.ByReaderSelftest?.bind(runtime);globalThis.ByEspBattery?.bind(runtime);local=runtime;paint();}
  function source(){
    if(local?.transport?.connected)return {local:true,snapshot:local.liveData?.snapshot(local.device,true),device:local.device,connected:true,viewing:!!local.liveViewing,recording:!!local.recorder,extraAge:0};
    const state=remote||globalThis.ByRemoteConsole?.snapshot?.().state;
    if(state?.bridge?.kind==='stock')return {snapshot:null,connected:false,device:{},extraAge:0};
    const live=state?.control?.can_live;
    return {local:false,snapshot:live,device:state?.device||{},connected:state?.online===true&&!state?.conflict,viewing:state?.control?.live_view?.active===true,recording:state?.control?.recording===true,extraAge:performance.now()-remoteAt+Math.max(0,state?.age_seconds||0)*1000};
  }
  async function action(mode){
    if(pending)return;pending=true;actionError='';paint();
    try{if(local?.transport?.connected)await local.api('/api/live/'+mode,{});else{const ok=await globalThis.ByRemoteConsole?.run(mode==='start'?'live_start':'live_stop');if(!ok)throw Error('Нет подтверждения запуска. Проверьте удалённое подключение.');}await globalThis.refreshState?.();}
    catch(e){actionError=String(e.message||e);}finally{pending=false;paint();}
  }
  function paint(){
    if(!dom)return;const s=source(),schema=local?.schema||globalThis.__canLiveSchema;if(!schema)return;
    const active=s.connected&&s.snapshot?.stream_active;
    dom.badge.textContent=active?'CAN · живые данные':s.connected?'Приём остановлен':'Нет связи с ESP';dom.badge.className='chip '+(active?'good':'muted');
    dom.origin.textContent=s.local?'ESP32 · напрямую по USB / Wi-Fi':s.connected?'ESP32 · через подключённый USB-ПК':'Данные поступают только с ESP32';
    dom.mode.textContent='TRIPLE · 250 кбит/с · '+(s.recording?'идёт запись':s.viewing?'чтение без таймера':'приём остановлен');
    const remoteControl=globalThis.ByRemoteConsole?.snapshot?.(),allowed=s.local?!local.operation&&!local.ending&&!local.tuner?.active&&!local.scan?.active&&!globalThis.BySpardProbe?.active:remoteControl?.online&&!remoteControl?.busy&&remoteControl?.state?.control?.ready===true&&remoteControl?.state?.control?.busy!==true&&!['queued','accepted','started'].includes(remoteControl?.state?.pending?.state)&&remoteControl?.state?.control?.capabilities?.includes('live_view');
    dom.start.hidden=!!active;dom.stop.hidden=!s.viewing;
    dom.start.disabled=pending||!allowed||active;dom.stop.disabled=pending||!allowed||!s.viewing;
    let reason='';
    if(!s.local){
      if(!remoteControl?.active)reason='Для запуска с телефона введите ключ в блоке «Велосипед · удалённая панель» ниже.';
      else if(remoteControl.state?.bridge?.kind==='stock')reason='На USB-ПК подключён адаптер Spard. Подключите ESP32 для чтения CAN.';
      else if(!remoteControl.online)reason='Нет связи с ESP через USB-ПК. Оставьте на нём открытый сайт с подключённой ESP.';
      else if(!remoteControl.state?.control?.capabilities?.includes('live_view'))reason='На USB-ПК открыта старая версия сайта. Обновите страницу именно на компьютере с ESP; затем чтение можно запускать с телефона.';
      else if(!allowed)reason='На USB-ПК завершите текущую проверку и включите удалённое управление.';
    }
    dom.notice.textContent=actionError||reason;
    paintWarnings(s.snapshot,s.extraAge);
    const list=cards(s.snapshot?{...s.snapshot,stream_active:!!s.connected&&s.snapshot.stream_active}:null,schema,s.extraAge);
    const prefs=globalThis.ByPreferences?.snapshot?.()||{favorites:[],view:'all'},favorites=new Set(prefs.favorites),onlyFavorites=prefs.view==='favorites';
    if(dom.all){dom.all.setAttribute('aria-pressed',String(!onlyFavorites));dom.favorites.setAttribute('aria-pressed',String(onlyFavorites));setText(dom.favoriteCount,'Избрано показателей: '+favorites.size);}
    const visible=list.map(c=>({...c,fields:c.fields.filter(f=>!onlyFavorites||favorites.has(c.id+':'+f.key))})).filter(c=>c.fields.length);
    const signature=JSON.stringify(visible.map(c=>[c.id,c.fields.map(f=>f.key)]));
    if(signature!==dom.signature){
      dom.signature=signature;dom.rows=new Map();dom.grid.replaceChildren();
      for(const c of visible){const article=document.createElement('article');article.dataset.canId=c.id;
        const head=document.createElement('div'),title=document.createElement('h3'),stamp=document.createElement('span');head.className='can-live-message-heading';head.append(title,stamp);article.append(head);
        const dl=document.createElement('dl'),fields=new Map();
        for(const f of c.fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),button=document.createElement('button'),label=document.createElement('span');row.className='can-live-field';button.type='button';button.className='favorite-toggle';button.dataset.favoriteId=c.id+':'+f.key;button.addEventListener('click',()=>globalThis.ByPreferences?.toggleFavorite(button.dataset.favoriteId));dt.append(button,label);row.append(dt,dd);dl.append(row);fields.set(f.key,{row,button,label,dd});}
        article.append(dl);const id=document.createElement('small');article.append(id);dom.grid.append(article);dom.rows.set(c.id,{article,title,stamp,id,fields});
      }
      if(!visible.length){const empty=document.createElement('p');empty.className='can-live-empty';setText(empty,'Избранных показателей пока нет. Откройте «Все данные» и нажмите звезду рядом с нужным показателем.');dom.grid.append(empty);}
    }
    for(const c of visible){const row=dom.rows.get(c.id);row.article.className='can-live-message'+(c.stale?' is-stale':'');setText(row.title,c.title);setText(row.stamp,!c.observed?'Нет данных':c.age_ms<1000?'сейчас':Math.floor(c.age_ms/1000)+' с назад');setText(row.id,'CAN '+(c.source_ids?.join(' / ')||c.id)+(c.invalid?' · проверить формат':''));
      for(const f of c.fields){const cell=row.fields.get(f.key),selected=favorites.has(c.id+':'+f.key);cell.button.setAttribute('aria-pressed',String(selected));cell.button.setAttribute('aria-label',tr(selected?'Убрать из избранного':'В избранное')+': '+tr(f.name));cell.button.title=tr(selected?'Убрать из избранного':'В избранное');setText(cell.button,selected?'★':'☆');setText(cell.label,f.name);const display=f.note?'Нет показания':f.value+(f.value!=='—'&&f.unit?' '+tr(f.unit):'');setText(cell.dd,display);cell.row.classList.toggle('is-text',tr(display).length>24);cell.dd.title=f.note?tr(f.note):'';}
    }
    dom.coverage.textContent=list.filter(c=>c.observed).length+' / '+list.length+' известных сообщений';
    if(dom.raw){const known=new Set(list.flatMap(c=>[c.id,...(c.consumed_ids||[])]));const extra=(s.snapshot?.frames||[]).filter(f=>f.rtr||!known.has(f.id));dom.raw.textContent=extra.length?extra.map(f=>f.id+'  '+(f.rtr?'RTR':f.data)).join('\n'):'Дополнительных ID пока нет.';}
  }
  function mount(){const root=globalThis.document?.getElementById('canLivePanel');if(!root)return;const get=id=>document.getElementById(id);dom={root,badge:get('canLiveBadge'),origin:get('canLiveOrigin'),mode:get('canLiveMode'),start:get('canLiveStart'),stop:get('canLiveStop'),notice:get('canLiveNotice'),grid:get('canLiveGrid'),coverage:get('canLiveCoverage'),raw:get('canLiveRaw'),warnings:get('canFaultEvents'),all:get('canLiveAll'),favorites:get('canLiveFavorites'),favoriteCount:get('canLiveFavoriteCount')};dom.start.onclick=()=>action('start');dom.stop.onclick=()=>action('stop');if(dom.all){dom.all.onclick=()=>globalThis.ByPreferences?.update({view:'all'});dom.favorites.onclick=()=>globalThis.ByPreferences?.update({view:'favorites'});}globalThis.addEventListener?.('citybike-preferences',e=>{if(dom.language!==e.detail.language)dom.signature=null;dom.language=e.detail.language;paint();});setInterval(paint,500);paint();}
  globalThis.ByCanLive={WarningJournal,warningFrame,validateWarningJournal,WARNING_LIMIT,IdentityAssembler,validateIdentity,interpretIdentity,Cache,cards,valid,LIMIT,bind,remoteState,paint};
  if(typeof module!=='undefined')module.exports=globalThis.ByCanLive;
  if(globalThis.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
})();
