/* Display only validated stock Information replies; cached samples remain labelled. */
'use strict';
(() => {
  let reading=null;
  const $=id=>document.getElementById(id),number={format:value=>new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3}).format(value)};
  const text=(id,value)=>{const e=$(id);if(e)e.textContent=value;};
  function consume(packet,{cached=false,receivedUtc}={}){
    const result=BySpardInformation.decode(packet?.raw_hex??packet);
    if(result.status!=='decoded')return false;
    reading={result,cached,receivedUtc:receivedUtc||packet?.received_utc||new Date().toISOString(),session:packet?.session_started_utc||null};
    render();return true;
  }
  function render(){
    const card=$('spardBatteryCard');if(!card)return;
    const state=globalThis.BySpardProbe?.snapshot?.()||{},active=state.active===true;
    const listen=$('listenSpardAdapter');if(listen)listen.disabled=active;
    const stop=$('stopSpardProbe');if(stop)stop.disabled=!active;
    const start=$('probeSpardAdapter');if(start)start.disabled=active||(typeof browserRuntime!=='undefined'&&!!(browserRuntime?.recorder||browserRuntime?.tuner?.active||browserRuntime?.flashBusy));
    const f=reading?.result.fields;
    const currentSession=reading?.session&&reading.session===state.started_utc;
    const live=!!(f&&active&&currentSession),mode=!f?'empty':reading.cached?'cached':live?'live':'read';
    card.dataset.state=mode;
    text('spardBatteryBadge',active?(state.mode==='listen'?'Наблюдение линии':'Идёт чтение'):!f?'Ожидание данных':reading.cached?'Сохранённое чтение':'Последнее чтение');
    text('spardBatteryCountdown',active&&state.remaining_ms>0?String(Math.floor(Math.ceil(state.remaining_ms/1000)/60)).padStart(2,'0')+':'+String(Math.ceil(state.remaining_ms/1000)%60).padStart(2,'0'):active?'Подготовка / сохранение':'');
    const progress=$('spardBatteryProgress');if(progress){progress.hidden=!active;progress.value=state.phase==='opening'?0:state.duration_s?Math.max(0,Math.min(1,1-state.remaining_ms/(state.duration_s*1000))):0;}
    if(!f)return;
    text('spardBatterySummary','Прошивка '+(f.firmware_version||'не определена')+' · '+f.cell_count+' ячеек · разброс '+f.delta_cell_mv+' мВ');
    const stamp=new Date(reading.receivedUtc);text('spardBatteryTime',(reading.cached?'Сохранено: ':'Прочитано: ')+(Number.isNaN(stamp.getTime())?'время неизвестно':stamp.toLocaleTimeString(globalThis.ByI18n?.locale?.()||'ru-RU'))+' · штатный адаптер Spard');
    text('spardCellSumValue',number.format(f.cell_sum_mv/1000));
    text('spardCurrentValue',number.format(f.current_ma/1000));
    text('spardSocValue',f.soc_percent>=0&&f.soc_percent<=100?number.format(f.soc_percent):'—');
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
  globalThis.BySpardBattery={consume,render,get reading(){return reading;}};
  window.addEventListener('spard-information',e=>consume(e.detail));
  window.addEventListener('spard-probe-progress',render);
  try{const cached=JSON.parse(localStorage.getItem('citybike-spard-probe-last')||'null');if(cached){for(const packet of [...(cached.packets||[])].reverse()){if(consume(packet,{cached:true,receivedUtc:packet.received_utc||cached.ended_utc}))break;}}}catch{}
  render();
})();
