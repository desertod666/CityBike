/* ESP CAN Information only; no stock-adapter access or arbitrary commands. */
'use strict';
(()=>{
 let local=null,remote=null,remoteAt=0,dom=null,pending=false,actionError='',identity='';
 const number={format:value=>new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3}).format(value)},activeStates=['queued','accepted','started'];
 function available(d){return globalThis.ByBatteryQuery?.supported(d)===true&&d.rx_sampling_250k==='TRIPLE';}
 function quietAvailable(d){return available(d)&&globalThis.ByBatteryQuery.supported(d,true)&&d.capabilities.includes('spard_quiet_query_v1');}
 function bind(runtime){local=runtime;paint();}
 function remoteState(state){remote=state;remoteAt=performance.now();paint();}
 function source(){
  if(local?.transport?.connected)return {local:true,connected:true,device:local.device,query:local.batteryQuery?.snapshot(),blocked:!!(local.recorder||local.ending||local.flashBusy||local.scan?.active||local.tuner?.active||globalThis.BySpardProbe?.active||local.operation&&!local.batteryQuery?.active),extraAge:0};
  const state=remote||globalThis.ByRemoteConsole?.snapshot?.().state,access=globalThis.ByRemoteConsole?.snapshot?.();
  return {local:false,connected:state?.online===true&&!state.conflict&&state?.bridge?.kind!=='stock',device:state?.device||{},query:state?.control?.battery_information,blocked:!access?.active||state?.control?.ready!==true||state?.control?.busy===true&&!state?.control?.battery_information?.active||activeStates.includes(state?.pending?.state)&&state?.pending?.kind!=='battery_information',extraAge:performance.now()-remoteAt+Math.max(0,state?.age_seconds||0)*1000};
 }
 function model(query,device,extraAge=0,connected=false){
  const info=query?.information;if(device?.product!=='BafangReader'||device.protocol!==1||!info||info.source!=='esp_can_std666'||info.boot!==device?.boot||!Number.isSafeInteger(info.epoch)||info.epoch>device?.epoch)return null;
  const decoded=globalThis.BySpardInformation?.decode(info.raw_hex);if(decoded?.status!=='decoded')return null;
  const age=Math.max(0,info.age_ms||0)+Math.max(0,extraAge);return {decoded,age_ms:age,stale:!connected||age>5000,origin:info.origin};
 }
 async function action(cancel=false){
  if(pending&&!cancel)return;const s=source(),quiet=!cancel&&dom?.quiet?.checked===true,confirmation=quiet?{session_ended:true,expected_boot:s.device.boot,expected_mac:s.device.ap_mac}:null;if(quiet)dom.quiet.checked=false;actionError='';if(!cancel)pending=true;paint();
  try{if(local?.transport?.connected)await local.api(cancel?'/api/battery/cancel':'/api/battery/information',quiet?{read_mode:'quiet',...confirmation}:{});else if(!await globalThis.ByRemoteConsole?.run(cancel?'stop':quiet?'battery_information_quiet':'battery_information',false,confirmation))throw Error('Не удалось подтвердить действие на USB-ПК');}
  catch(e){actionError=String(e.message||e);}finally{if(!cancel)pending=false;paint();}
 }
 function paint(){
  if(!dom)return;const s=source(),q=s.query||{},d=s.device||{},m=model(q,d,s.extraAge,s.connected),running=q.active===true;
  const key=d.ap_mac+':'+d.boot;if(identity!==key){identity=key;if(dom.quiet)dom.quiet.checked=false;}
  if(dom.quiet)dom.quiet.disabled=pending||running||!s.connected||!quietAvailable(d);
  dom.start.disabled=pending||!s.connected||!available(d)||s.blocked||running||dom.quiet?.checked===true&&!quietAvailable(d);dom.cancel.disabled=!running||!s.connected;
  dom.clock.hidden=!running;const left=Math.max(0,(q.remaining_ms||0)-s.extraAge);dom.clock.textContent=running?Math.ceil(left/1000)+' с':'';
  const phases={idle:'Ожидание ответа',preparing:'Подготовка опроса',qualifying:'Проверка линии · TRIPLE / 250 кбит/с',querying:'Чтение батареи',complete:'Опрос завершён',failed:'Опрос не завершён',cancelled:'Опрос остановлен'};
  dom.status.textContent=actionError||q.error||(!s.connected?'Подключите ESP32 или откройте удалённый доступ.':!available(d)?'Для самостоятельного опроса нужна прошивка ESP 0.5.2+. Ответы из CAN отображаются и с 0.4.9.':q.phase==='qualifying'&&q.read_mode==='quiet'?'Тихая линия · проверка 5 с · только без ошибок':q.phase==='qualifying'&&globalThis.ByBatteryQuery.versionAtLeast(d.version,'0.5.3')&&d.capabilities?.includes('spard_query_quality_v1')?'Проверка 30 с · до 1 события ошибки на 100 кадров, максимум 10':phases[q.phase]||'Готов к чтению батареи');
  dom.root.hidden=!m;dom.values.hidden=!m;dom.badge.textContent=!m?'Ожидание полного ответа':m.stale?'Последний ответ':m.origin==='esp_query'?'Ответ на запрос ESP':'Ответ из CAN';dom.root.classList.toggle('is-stale',!!m?.stale);
  if(!m)return;const f=m.decoded.fields;dom.age.textContent=(m.origin==='esp_query'?'Запрос отправил ESP · ':'Принято через ESP · ')+(m.age_ms<1000?'сейчас':Math.floor(m.age_ms/1000)+' с назад');
  dom.cells.replaceChildren();for(const [i,mv]of f.cells_mv.entries()){const cell=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');cell.className='esp-battery-cell';label.textContent='Ячейка '+(i+1);value.textContent=number.format(mv/1000)+' В';cell.append(label,value);dom.cells.append(cell);}
  const rows=[['Сумма ячеек',number.format(f.cell_sum_mv/1000)+' В'],['Ток',number.format(f.current_ma/1000)+' А'],['Заряд',number.format(f.soc_percent)+'%'],['SOH',number.format(f.soh_percent)+'%'],['Полная ёмкость',number.format(f.full_charge_capacity_mah)+' мА·ч'],['Остаток ёмкости',number.format(f.remaining_capacity_mah)+' мА·ч'],['Температуры',f.temperatures_c.map(t=>t+' °C').join(' / ')],['Разброс ячеек',f.delta_cell_mv+' мВ'],['Циклы',String(f.cycle_count)],['Прошивка батареи',f.firmware_version||'—']];
  dom.facts.replaceChildren();for(const[name,value]of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;dom.facts.append(dt,dd);}dom.raw.textContent=JSON.stringify(f,null,2);
 }
 function mount(){const root=document.getElementById('espBatteryPanel');if(!root)return;const get=id=>document.getElementById(id);dom={root,quiet:get('espBatteryQuiet'),start:get('espBatteryRead'),cancel:get('espBatteryCancel'),clock:get('espBatteryClock'),status:get('espBatteryStatus'),badge:get('espBatteryBadge'),values:get('espBatteryValues'),age:get('espBatteryAge'),cells:get('espBatteryCells'),facts:get('espBatteryFacts'),raw:get('espBatteryRaw')};dom.start.onclick=()=>action();dom.cancel.onclick=()=>action(true);setInterval(paint,500);paint();}
 globalThis.ByEspBattery={available,quietAvailable,model,bind,remoteState,paint};if(typeof module!=='undefined')module.exports=globalThis.ByEspBattery;
 if(globalThis.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
})();
