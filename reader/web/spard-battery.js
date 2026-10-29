/* Display only validated stock Information replies; cached samples remain labelled. */
'use strict';
(() => {
  let reading=null;
  const $=id=>globalThis.document?.getElementById(id),number={format:value=>new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3}).format(value)};
  const text=(id,value)=>{const e=$(id);if(e)e.textContent=globalThis.ByI18n?.t?.(value)||value;};
  function consume(packet,{cached=false,receivedUtc}={}){
    const result=BySpardInformation.decode(packet?.raw_hex??packet);
    if(result.status!=='decoded')return false;
    reading={result,cached,receivedUtc:receivedUtc||packet?.received_utc||new Date().toISOString(),session:packet?.session_started_utc||null};
    render();return true;
  }
  function renderStock(){
    const card=$('spardBatteryCard');if(!card)return;
    const state=globalThis.BySpardProbe?.snapshot?.()||{},active=state.active===true;
    const listen=$('listenSpardAdapter');if(listen)listen.disabled=active;
    const stop=$('stopSpardProbe');if(stop)stop.disabled=!active;
    const start=$('probeSpardAdapter');if(start)start.disabled=active||(typeof browserRuntime!=='undefined'&&!!(browserRuntime?.recorder||browserRuntime?.tuner?.active||browserRuntime?.flashBusy));
    card.dataset.source='stock';const f=reading?.result.fields;text('spardBatterySource',f?'SPARD · USB':'ESP32 · CAN');
    const currentSession=reading?.session&&reading.session===state.started_utc;
    const live=!!(f&&active&&currentSession),mode=!f?'empty':reading.cached?'cached':live?'live':'read';
    card.dataset.state=mode;
    text('spardVoltageLabel','Сумма ячеек');text('spardPowerNote','Сумма напряжений × ток батареи');const cn=$('spardCellsNote');if(cn)cn.hidden=true;const fd=$('spardBatteryDetails');if(fd)fd.hidden=false;
    text('spardBatteryBadge',active?(state.mode==='listen'?'Наблюдение линии':'Идёт чтение'):!f?'Ожидание данных':reading.cached?'Сохранённое чтение':'Последнее чтение');
    text('spardBatteryCountdown',active&&state.remaining_ms>0?String(Math.floor(Math.ceil(state.remaining_ms/1000)/60)).padStart(2,'0')+':'+String(Math.ceil(state.remaining_ms/1000)%60).padStart(2,'0'):active?'Подготовка / сохранение':'');
    const progress=$('spardBatteryProgress');if(progress){progress.hidden=!active;progress.value=state.phase==='opening'?0:state.duration_s?Math.max(0,Math.min(1,1-state.remaining_ms/(state.duration_s*1000))):0;}
    const history=$('spardBatteryHistoryNote');if(history)history.hidden=!f||!reading.cached;
    if(!f)return;
    text('spardBatterySummary','Прошивка '+(f.firmware_version||'не определена')+' · '+f.cell_count+' ячеек · разброс '+f.delta_cell_mv+' мВ');
    const stamp=new Date(reading.receivedUtc);text('spardBatteryTime',(reading.cached?'Сохранено: ':'Прочитано: ')+(Number.isNaN(stamp.getTime())?'время неизвестно':stamp.toLocaleString(globalThis.ByI18n?.locale?.()||'ru-RU'))+' · штатный адаптер Spard');
    text('spardTemperatureValue',number.format(f.temperatures_c[0]));text('spardCellSumValue',number.format(f.cell_sum_mv/1000));
    text('spardCurrentValue',number.format(f.current_ma/1000));
    text('spardSocValue',f.soc_percent>=0&&f.soc_percent<=100?number.format(f.soc_percent):'—');
    text('spardFullCapacityValue',number.format(f.full_charge_capacity_mah));
    text('spardRemainingCapacityValue',number.format(f.remaining_capacity_mah));
    text('spardPowerValue',number.format(f.cell_sum_mv*f.current_ma/1e6));
    const cells=$('spardCells');cells.replaceChildren();
    for(const [index,value]of f.cells_mv.entries()){
      const cell=document.createElement('div');cell.className='spard-cell';
      const label=document.createElement('span'),voltage=document.createElement('strong');label.textContent=String(index+1);voltage.textContent=number.format(value/1000)+' В';cell.append(label,voltage);cells.append(cell);
    }
    const facts=$('spardBatteryFacts');facts.replaceChildren();
    const rows=[['Температуры',f.temperatures_c.map(v=>v+' °C').join(' / ')],['Номинальная ёмкость',number.format(f.design_capacity_mah)+' мА·ч'],['Полная ёмкость',number.format(f.full_charge_capacity_mah)+' мА·ч'],['Остаток ёмкости',number.format(f.remaining_capacity_mah)+' мА·ч'],['SOH из пакета',f.soh_percent<=100?f.soh_percent+'%':'raw '+f.soh_percent],['Циклы',String(f.cycle_count)],['Второе измерение напряжения',number.format(f.secondary_voltage_mv/1000)+' В'],['Балансировка, маска','0x'+f.balance_mask.toString(16).toUpperCase()],['Статус, код','0x'+f.pack_status_raw.toString(16).toUpperCase()]];
    if(reading.result.derived?.stock_soh_display_percent!==undefined)rows.push(['SOH, расчёт Spard',number.format(reading.result.derived.stock_soh_display_percent)+'%']);
    for(const [label,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);facts.append(row);}
  }

  function canModel(input){
    const d=input?.device,s=input?.snapshot,extra=input?.extraAge??0;
    if(!d||d.product!=='BafangReader'||d.protocol!==1||!s||s.schema!==1||s.boot!==d.boot||s.epoch!==d.epoch||typeof s.boot!=='string'||!/^[A-F0-9]{8}$/.test(s.boot)||!Number.isSafeInteger(s.epoch)||s.epoch<0||!Array.isArray(s.frames)||s.frames.length>64||!Number.isFinite(extra)||extra<0)return null;
    const metrics={},used=[],seen=new Set();
    const put=(key,value,age,id)=>{if(Number.isFinite(value)&&(!metrics[key]||age<metrics[key].age_ms)){metrics[key]={value,age_ms:age,id,stale:!input.connected||!s.stream_active||age>5000};}};
    for(const f of s.frames){
      if(!['04F83400','04F83401'].includes(f.id))continue;
      if(seen.has(f.id)||!globalThis.ByCanLive?.valid(f)||!f.extended||f.rtr||!Number.isSafeInteger(f.age_ms)||f.age_ms<0||f.age_ms>86400000||f.boot!==undefined&&f.boot!==s.boot||f.epoch!==undefined&&f.epoch!==s.epoch)return null;
      seen.add(f.id);const decoded=globalThis.BafangDecoder?.decode(f,input.schema);if(!decoded||!decoded.status.startsWith('decoded'))continue;
      const age=f.age_ms+extra,fields=decoded.fields;used.push(f.id);
      const mapping=f.id==='04F83400'?{full:'Total_Capacity_mAh',remaining:'Residual_Capacity_mAh',soc:'Relative_Capacity %',soh:'SOH'}:{voltage:'Battery_Voltage_V',current:'Battery_Current_A',temperature:'Temperature'};
      for(const [key,name]of Object.entries(mapping)){const v=fields?.[name]?.value;if(['soc','soh'].includes(key)&&(v<0||v>100))continue;put(key,v,age,f.id);}
    }
    const info=globalThis.ByEspBattery?.model(input.query,d,extra,input.connected),full=info?.decoded?.fields;
    if(full){const age=info.age_ms;for(const [key,value]of Object.entries({voltage:full.cell_sum_mv/1000,current:full.current_ma/1000,soc:full.soc_percent,soh:full.soh_percent,full:full.full_charge_capacity_mah,remaining:full.remaining_capacity_mah,temperature:full.temperatures_c[0]}))put(key,value,age,'ESP Information');}
    if(metrics.voltage&&metrics.current){const a=metrics.voltage,b=metrics.current;metrics.power={value:a.value*b.value,age_ms:Math.max(a.age_ms,b.age_ms),id:a.id+' / '+b.id,stale:a.stale||b.stale};}
    const cells=globalThis.ByBafangBattery?.model(s,extra);let cellValues=[],cellAge=null,cellStale=true,cellComplete=false;
    if(cells?.cells?.length){cellValues=cells.cells.map(c=>c.mv===65535?null:c.mv);cellAge=cells.age_ms;cellStale=cells.stale;cellComplete=cells.complete&&cells.coherent;}
    if(full&&(!cellValues.length||info.age_ms<cellAge)){cellValues=[...full.cells_mv];cellAge=info.age_ms;cellStale=info.stale;cellComplete=true;}
    return {metrics,cellValues,cellAge,cellStale,cellComplete,full,used,hasValues:Object.keys(metrics).length>0||cellValues.length>0};
  }
  function renderCAN(input,m){
    const card=$('spardBatteryCard');card.dataset.source='esp';text('spardBatterySource','ESP32 · CAN');const values=m?.metrics||{},available=Object.values(values),fresh=available.some(x=>!x.stale);card.dataset.state=!m?.hasValues?'empty':fresh?'live':'stale';
    text('spardVoltageLabel','Напряжение батареи');text('spardPowerNote','Напряжение батареи × ток');
    text('spardBatteryBadge',!m?.hasValues?'Ожидание CAN батареи':fresh?'ESP32 · данные CAN':'Последние данные CAN');
    text('spardBatterySummary','Напряжение, ток, заряд и ёмкость поступают напрямую через ESP32.');
    text('spardBatteryTime',!m?.hasValues?'Кадры батареи ещё не получены.':'Источник: ESP32 · CAN');
    const history=$('spardBatteryHistoryNote');if(history)history.hidden=true;
    for(const [id,key]of [['spardCellSumValue','voltage'],['spardCurrentValue','current'],['spardSocValue','soc'],['spardPowerValue','power'],['spardFullCapacityValue','full'],['spardRemainingCapacityValue','remaining'],['spardTemperatureValue','temperature']]){
      const value=values[key];text(id,value?number.format(value.value):'—');const el=$(id);if(el){el.closest('.metric')?.classList.toggle('is-stale',!!value?.stale);el.title=value?value.id+' · '+Math.floor(value.age_ms/1000)+' '+(globalThis.ByI18n?.t?.('с назад')||'с назад'):'';}
    }
    const cells=$('spardCells');cells.replaceChildren();
    for(const [i,mv]of (m?.cellValues||[]).entries()){const cell=document.createElement('div'),label=document.createElement('span'),voltage=document.createElement('strong');cell.className='spard-cell'+(m.cellStale?' is-stale':'');label.textContent=String(i+1);voltage.textContent=mv===null?'—':number.format(mv/1000)+' '+(globalThis.ByI18n?.t?.('В')||'В');cell.append(label,voltage);cells.append(cell);}
    const note=$('spardCellsNote');if(note){note.hidden=false;note.textContent=globalThis.ByI18n?.t?.(!m?.cellValues.length?'Напряжения ячеек пока не получены. Они приходят отдельным ответом батареи.':!m.cellComplete?'Получена только часть показаний ячеек.':m.cellStale?'Показания ячеек устарели.':'Напряжения ячеек получены через ESP32.')||'';}
    const facts=$('spardBatteryFacts');facts.replaceChildren();const rows=[];if(values.soh)rows.push(['Состояние батареи',number.format(values.soh.value)+'%']);if(m?.full){rows.push(['Прошивка батареи',m.full.firmware_version||'—'],['Циклы',String(m.full.cycle_count)]);}
    for(const [label,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=globalThis.ByI18n?.t?.(label)||label;dd.textContent=value;row.append(dt,dd);facts.append(row);}const details=$('spardBatteryDetails');if(details)details.hidden=!rows.length;
  }
  function render(){
    if(!$('spardBatteryCard'))return;const source=globalThis.ByCanLive?.source?.();
    if(source?.device?.product==='BafangReader'&&(source.connected||source.snapshot?.frames?.length))return renderCAN(source,canModel(source));
    renderStock();
  }
  globalThis.BySpardBattery={consume,render,canModel,get reading(){return reading;}};
  globalThis.addEventListener?.('spard-information',e=>consume(e.detail));
  globalThis.addEventListener?.('spard-probe-progress',render);
  try{const cached=JSON.parse(localStorage.getItem('citybike-spard-probe-last')||'null');if(cached){for(const packet of [...(cached.packets||[])].reverse()){if(consume(packet,{cached:true,receivedUtc:packet.received_utc||cached.ended_utc}))break;}}}catch{}
  if(typeof module!=='undefined')module.exports=globalThis.BySpardBattery;
  if(globalThis.document){setInterval(render,500);render();}
})();
