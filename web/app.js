'use strict';
let browserRuntime=null;
const $=id=>document.getElementById(id), number={format:value=>new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU').format(value)};
let state=null,schema=null,cursor=0,boot=null,frames=[],marks=[],previewMissed=0,paused=false,lastRate=null,rates=Array(30).fill(0),stateBusy=false,framesBusy=false,sessionToken=null,sessionPending=false,lastScanSelection=null,profileCatalog=null,previewProfile='unidentified',lastRenderedProfile=null;
const text=(id,value)=>{const e=$(id);if(e)e.textContent=value;};
const uiConfirm=message=>confirm(globalThis.ByI18n?.t?.(message)||message);
function toast(message,error=false){const e=$('toast');e.textContent=message;e.classList.toggle('error',error);e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),5000);}
async function api(path,data){if(browserRuntime&&path.startsWith('/api/'))return browserRuntime.api(path,data);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Reader-UI':'1'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.ok===false)throw Error(j.error||'Операция не выполнена');return j;}finally{clearTimeout(timer);}}
async function command(command){try{await api('/api/command',{command});await refreshState();return true;}catch(e){toast(e.message,true);return false;}}
async function ensureSession(){if(!state?.app?.desktop||sessionToken||sessionPending)return;sessionPending=true;try{sessionToken=(await api('/api/session/open',{})).session;}catch(e){/* Offline reconnect will retry with the next state refresh. */}finally{sessionPending=false;}}
window.addEventListener('pagehide',()=>{if(sessionToken&&state?.app?.desktop)navigator.sendBeacon('/api/session/leave',JSON.stringify({session:sessionToken}));});
setInterval(()=>{if(sessionToken&&state?.app?.desktop)api('/api/session/ping',{session:sessionToken}).catch(()=>{});},10000);
function switchView(name){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===name+'View'));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===name));text('viewName',{overview:'Обзор',stream:'CAN-поток',connection:'Ридер и сеть',software:'Программа и обновления'}[name]);}
document.querySelectorAll('.nav').forEach(x=>x.addEventListener('click',()=>switchView(x.dataset.view)));
for(const rate of []){const o=document.createElement('option');o.value=rate;o.textContent=number.format(rate)+' бит/с';$('bitrate').append(o);}
for(let i=1;i<=11;i++){const o=document.createElement('option');o.value=i;o.textContent='Канал '+i;$('channelSelect').append(o);}
function duration(us){const sec=Math.floor((us||0)/1e6),h=Math.floor(sec/3600),m=Math.floor(sec/60)%60;return `${h? h+' ч ':''}${m} мин ${sec%60} с`;}
function renderState(s){state=s;globalThis.ByRemoteConsole?.setLocalState?.(s);ensureSession();const d=s.device||{},c=s.connection||{},a=s.app||{},n=s.network||{},connected=!!c.connected,running=d.can==='running',desktop=!!a.desktop,recordable=desktop||!!a.browser;
document.body.classList.toggle('desktop',recordable);document.body.classList.toggle('browser',!!a.browser);document.body.classList.toggle('browser-wifi',!!a.browser&&a.transport==='wifi');text('transportBadge',connected?(desktop?'USB · '+(c.port||'COM'):'Wi-Fi · подключено'):'Ридер не подключён');$('transportBadge').className='chip '+(connected?'good':'muted');text('canBadge',running?'CAN · приём':'CAN остановлен');$('canBadge').className='chip '+(running?'running good':'muted');
text('heroTitle',running?'Шина под наблюдением.':connected?'Ридер готов к работе.':'Подключите ваш ридер.');text('heroText',desktop?'Все прочитанные USB-байты записываются на диск. Просмотр не влияет на состав лога.':'Откройте живые данные или запишите тест на 30 или 60 секунд.');
text('firmwareVersion',d.version?'v'+d.version:'—');text('uptime',connected?duration(d.uptime_us):'—');text('heap',d.heap_free?number.format(Math.round(d.heap_free/1024))+' КБ':'—');text('boot',d.boot||'—');$('deviceLight').classList.toggle('good',connected);text('recordMode',desktop?(connected?'USB → диск ПК':'Нет подключения'):'Веб-просмотр · RAM');
text('receivedCount',number.format(d.received||0));text('navCount',number.format(d.received||0));text('busErrors',number.format(d.bus_errors||0));text('rxLoss',`${number.format(d.rx_missed||0)} / ${number.format(d.rx_overrun||0)}`);text('usbLoss',`${number.format(d.frame_queue_drops||0)} / ${number.format(d.usb_frame_drops||0)}`);text('previewLoss',number.format(previewMissed));
const now=performance.now();if(lastRate&&lastRate.boot===d.boot&&d.received>=lastRate.count){const rate=Math.max(0,(d.received-lastRate.count)*1000/(now-lastRate.time));rates.push(rate);rates.shift();text('rateLabel',number.format(Math.round(rate))+' кадров/с');const scale=Math.max(1,...rates);$('rateLine').setAttribute('points',rates.map((v,i)=>`${i*600/29},${75-v/scale*65}`).join(' '));}lastRate={boot:d.boot,count:d.received||0,time:now};
text('ssid',n.ssid||d.ssid||'—');text('mac',n.mac||'—');text('wifiClients',`${n.channel||d.wifi_channel||'—'} / ${n.clients??d.wifi_clients??0}`);text('ledLevel',d.led_active_level===1?'HIGH':'LOW');
if(document.activeElement!==$('ssidInput')&&!$('ssidInput').dataset.edited)$('ssidInput').value=n.saved_ssid||n.ssid||d.ssid||'';if(document.activeElement!==$('channelSelect')&&!$('channelSelect').dataset.edited)$('channelSelect').value=n.saved_channel||n.channel||d.wifi_channel||6;if(!$('ledPolarity').dataset.edited)$('ledPolarity').value=d.led_active_level||0;
$('bitrate').value='250000';$('bitrate').disabled=true;$('startButton').disabled=!connected||running||!$('bitrate').value||!!c.updating;$('stopButton').disabled=!connected||!running;$('saveWifi').disabled=!connected||running;$('saveLed').disabled=!connected||running;text('connectButton',connected?'Отключить':'Подключить');$('connectButton').disabled=!!c.updating;if($('quickConnectUSB')){$('quickConnectUSB').hidden=!navigator.serial;$('quickConnectUSB').disabled=!!c.updating;text('quickConnectUSB',connected?'Отключить USB':'Подключить USB');}
if(a.download_url)$('downloadLink').href=a.download_url;if(a.release_url)$('releaseLink').href=a.release_url;text('appVersion','v'+(a.version||'0.4.0'));text('footerVersion',a.version||'0.4.0');text('sideVersion','v'+(a.version||'0.4.0'));text('fwUpdateVersion',d.version?'v'+d.version:'Не подключён');text('webBuild',a.web_build||'20261027-sampling-sweep3');
if(desktop){text('storageText','Программа записывает каждый прочитанный USB-байт в wire.bin, события в capture.jsonl и все кадры в frames.csv. Фильтр таблицы меняет только экран.');text('logPath',c.log_path||'Подключите устройство для начала записи');text('logHint',connected?'Запись на диск активна':'Запись начнётся при подключении');const u=a.update||{};text('appUpdateText',u.error|| (u.available?'Доступна версия '+u.version:u.checked?'Установлена актуальная версия':'Проверка ещё не выполнена'));text('fwUpdateText',u.error||(!connected?'Подключите ридер по USB':u.firmware_available?'Доступна прошивка '+u.version:u.checked?'Установлена актуальная версия':'Нажмите «Проверить версии»'));$('updateApp').disabled=!u.available||!!a.busy;$('updateFirmware').disabled=!connected||!u.firmware_available||!!a.busy;text('updateProgress',a.progress||'Скачивание через HTTPS, проверка SHA-256. CAN останавливается перед прошивкой ESP32.');}
renderConnectionProfile(s);renderRecording(s);if(globalThis.BySpardBattery)BySpardBattery.render();if(a.browser)renderBrowser(s);
updateMetrics();const alert=$('connectionAlert');alert.classList.toggle('hidden',!c.error);alert.textContent=c.error||'';
}
async function refreshState(){if(stateBusy)return;stateBusy=true;try{renderState(await api('/api/state'));}catch(e){text('transportBadge','Нет связи');$('transportBadge').className='chip error';$('startButton').disabled=true;$('stopButton').disabled=true;text('heroText','Соединение с панелью потеряно. Проверьте USB или Wi-Fi и адрес страницы.');}finally{stateBusy=false;}}
function renderFrames(){if(paused)return;const filter=$('frameFilter').value.trim().toUpperCase(),rows=frames.filter(f=>!filter||(f.id+' '+f.data).toUpperCase().includes(filter)).slice(-200).reverse(),tbody=$('framesBody');tbody.replaceChildren();for(const f of rows){const row=document.createElement('tr'),status=f.decoded?.status||'unknown';for(const value of [f.seq,(f.t_us/1e6).toFixed(6),f.id,(f.extended?'EXT':'STD')+(f.rtr?' · RTR':''),f.dlc,f.rtr?'—':(String(f.data??'').match(/../g)||[]).join(' '),status==='decoded_unconfirmed'?(f.decoded.mapping_source==='bafang_v25'?'V2.5 · не подтверждено':'SYM · не подтверждено'):status==='unknown'?'Неизвестный ID':status==='rtr'?'RTR': 'Проверить формат']){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}tbody.append(row);}$('emptyFrames').classList.toggle('hidden',rows.length>0);text('previewInfo',`В памяти браузера: ${frames.length} / 500 кадров`);}
function updateMetrics(){for(const name of ['speed','voltage','current','temperature','cadence','charge']){const value=ByMetrics.pick(name,frames,state?.device?.uptime_us,performance.now());if(!value){text(name+'Value','—');text(name+'Note','Ожидание данных');$(name+'Value').classList.remove('stale');continue;}text(name+'Value',Number(value.signal.value.toFixed(2)).toLocaleString('ru-RU'));text(name+'Note',`${value.source} · SYM проверяется${value.stale?' · данные устарели':''}`);$(name+'Value').title='Источник: '+value.source+' · CAN '+value.frame.id;$(name+'Value').classList.toggle('stale',value.stale);}}
async function refreshFrames(){if(framesBusy||!state?.connection?.connected)return;framesBusy=true;try{const result=await api('/api/frames?after='+cursor);if(boot&&boot!==result.boot){cursor=0;frames=[];previewMissed=0;boot=result.boot;updateMetrics();return;}boot=result.boot;previewMissed+=result.missed||0;if(result.missed&&result.oldest)cursor=Math.max(cursor,result.oldest-1);for(const f of result.frames){if(f.seq<=cursor)continue;f.host_seen=performance.now();previewMissed+=Math.max(0,f.seq-cursor-1);try{f.decoded=schema?BafangDecoder.decode(f,schema):{status:'decoder_error'};}catch(e){f.decoded={status:'decoder_error'};}frames.push(f);cursor=f.seq;}if(!result.frames.length&&cursor>result.latest)cursor=0;frames=frames.slice(-500);renderFrames();updateMetrics();text('previewLoss',number.format(previewMissed));renderMetricCharts();}catch(e){/* State polling reports connection problems without flooding toasts. */}finally{framesBusy=false;}}
$('bitrate').addEventListener('change',()=>state&&renderState(state));$('startButton').addEventListener('click',()=>command('START '+$('bitrate').value));$('stopButton').addEventListener('click',()=>command('STOP'));
document.querySelectorAll('.led-command').forEach(b=>b.addEventListener('click',()=>command(b.dataset.command)));
for(const id of ['ssidInput','channelSelect','ledPolarity'])$(id).addEventListener('input',()=>$(id).dataset.edited='1');
$('saveLed').addEventListener('click',async()=>{if(await command('LED ACTIVE '+($('ledPolarity').value==='1'?'HIGH':'LOW'))){delete $('ledPolarity').dataset.edited;toast('Полярность LED сохранена');}});
$('saveWifi').addEventListener('click',async()=>{const ssid=$('ssidInput').value.trim();if(!/^[A-Za-z0-9 ._-]{1,32}$/.test(ssid)){toast('SSID: 1–32 символа, латиница, цифры, пробел, - или _',true);return;}if(await command(`WIFI ${$('channelSelect').value} ${ssid}`))toast('Wi-Fi сохранён. Новая сеть появится после перезапуска питания.');});
async function addMark(){if($('markButton').disabled)return;const action=$('markInput').value.trim();if(!action){toast('Опишите действие, например «включаю свет»',true);return;}try{const r=await api('/api/mark',{action,bitrate:Number($('bitrate').value)});marks.push({action,host_utc:new Date().toISOString(),t_us:r.t_us,boot});marks=marks.slice(-200);$('markInput').value='';$('marksList').replaceChildren();for(const m of marks.slice(-8).reverse()){const item=document.createElement('span'),time=document.createElement('time');item.className='mark-item';time.textContent=new Date(m.host_utc).toLocaleTimeString('ru-RU');item.append(time,document.createTextNode(m.action));$('marksList').append(item);}toast('Отметка добавлена');}catch(e){toast(e.message,true);}}
$('markButton').addEventListener('click',addMark);$('markInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();addMark();}});$('frameFilter').addEventListener('input',renderFrames);$('pauseView').addEventListener('click',()=>{paused=!paused;text('pauseView',paused?'Продолжить экран':'Пауза экрана');if(!paused)renderFrames();});
$('exportPreview').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({notice:'Bounded browser preview, not a complete CAN log. SYM compatibility unconfirmed.',exported_utc:new Date().toISOString(),state,capture_context:selectedProfile(),preview_missed:previewMissed,frames,marks},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='BafangReader-preview-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
async function refreshPorts(silent=false){try{const result=await api('/api/ports'),select=$('portSelect'),previous=select.value,candidates=result.ports.filter(p=>p.compatible);select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=candidates.length===0?'ESP32 USB не найдена':candidates.length>1?'Несколько ESP32 — выберите ридер':'Выберите ридер';select.append(placeholder);for(const p of result.ports){const o=document.createElement('option');o.value=p.port;o.disabled=!p.compatible;o.textContent=`${p.port} · ${p.description}${p.compatible?' · ESP32 USB':' · другое устройство'}`;select.append(o);}if(candidates.some(p=>p.port===previous))select.value=previous;else if(candidates.length===1)select.value=candidates[0].port;if(!silent)toast(`Найдено портов: ${result.ports.length}; ESP32 USB: ${candidates.length}`);}catch(e){toast(e.message,true);}}
$('refreshPorts').addEventListener('click',()=>refreshPorts(false));$('connectButton').addEventListener('click',async()=>{try{if(state?.connection?.connected)await api('/api/disconnect',{});else{if(!state?.app?.browser&&!$('portSelect').value)throw Error('Выберите COM-порт');await api('/api/connect',{port:$('portSelect').value});}await refreshState();}catch(e){toast(e.message,true);}});
$('checkUpdates').addEventListener('click',async()=>{try{await api('/api/updates/check',{});toast('Проверка версий запущена');}catch(e){toast(e.message,true);}});
$('updateApp').addEventListener('click',async()=>{if(!uiConfirm('Скачать проверенное обновление программы? Приём CAN будет остановлен, текущие логи закрыты.'))return;try{await api('/api/updates/app',{});toast('Подготовка обновления программы…');}catch(e){toast(e.message,true);}});
$('updateFirmware').addEventListener('click',async()=>{if(!uiConfirm('Обновить прошивку ESP32-C3 по USB? Сначала отсоедините CANH/CANL от велосипеда. CAN будет остановлен. Не отключайте USB во время записи.'))return;try{await api('/api/updates/firmware',{});toast('Обновление ESP32 запущено');}catch(e){toast(e.message,true);}});
$('openBrowserPanel').addEventListener('click',async()=>{try{await api('/api/browser/open',{});toast('Интернет-панель открывается…');}catch(e){toast(e.message,true);}});
$('openLogs').addEventListener('click',async()=>{try{await api('/api/open-logs',{});}catch(e){toast(e.message,true);}});$('exitApp').addEventListener('click',async()=>{if(!uiConfirm('Остановить CAN, закрыть логи и завершить программу?'))return;try{await api('/api/exit',{});text('heroText','Программа завершена. Эту вкладку можно закрыть.');}catch(e){toast(e.message,true);}});
(async()=>{
try{profileCatalog=await api('/capture_profiles.json');const select=$('connectionProfile');select.replaceChildren();for(const p of profileCatalog.profiles){const option=document.createElement('option');option.value=p.id;option.textContent=p.label;select.append(option);}}catch(e){toast('Профили недоступны; используйте ручной выбор скорости',true);}
try{schema=await api('/decoder_reference.json');globalThis.__canLiveSchema=schema;}catch(e){toast('Декодер недоступен. Сырые кадры доступны для просмотра и записи.',true);}
try{const initial=await api('/api/state');if(!initial.app?.desktop){browserRuntime=await new ByBrowser.Runtime(initial,schema,profileCatalog).init();await browserRuntime.tick();globalThis.ByCanLive?.bind(browserRuntime);}await refreshState();if(state?.app?.desktop||(state?.app?.browser&&state.app.transport==='usb'))await refreshPorts(true);await refreshFrames();setupOffline();}catch(e){toast(e.message,true);}
})();
setInterval(refreshState,1000);setInterval(refreshFrames,200);

setInterval(()=>{if((state?.app?.desktop||(state?.app?.browser&&state.app.transport==='usb'))&&!state.connection?.connected&&!state.connection?.updating)refreshPorts(true);},4000);

const countdownModel=new ByMetrics.Countdown();
let countdownTick=null,testStartPending=false;
function paintCountdown(){
 const view=countdownModel.view();
 text('testTime',view.label);
 text('testPhase',view.phase==='running'?'Осталось до завершения':view.phase==='finalizing'?'Завершение…':'Готов к тесту');
 $('testCountdown').dataset.phase=view.phase;
 $('testProgress').value=view.progress;
 if(view.phase!=='running'&&countdownTick!==null){clearInterval(countdownTick);countdownTick=null;}
}
function syncCountdown(s){
 const a=s.app||{},sharing=a.sharing||{};
 $('tuningStage').hidden=!a.tuning?.active;
 text('tuningStage',a.tuning?.active?`Автоподбор · этап ${a.tuning.step||0}/${a.tuning.total} · ${a.tuning.profile||'подготовка'} · ${a.tuning.duration} с на этап`:'');
 countdownModel.sync(a.countdown||{phase:a.recording&&a.remaining!=null?'running':'idle',duration_ms:(sharing.duration||60)*1000,remaining_ms:(a.remaining||0)*1000});
 paintCountdown();
 if(countdownModel.view().phase==='running'&&countdownTick===null)countdownTick=setInterval(paintCountdown,200);
}
async function startTest(seconds){
 if(testStartPending)return;
 testStartPending=true;$('test30Button').disabled=true;$('test60Button').disabled=true;$('test600Button').disabled=true;
 text('testPhase','Подготовка…');
 try{await api('/api/test',{duration:seconds});await refreshState();}
 catch(e){toast(e.message,true);}
 finally{testStartPending=false;await refreshState();}
}
$('test30Button').addEventListener('click',()=>startTest(30));
$('test60Button').addEventListener('click',()=>startTest(60));
$('test600Button').addEventListener('click',()=>startTest(600));
function renderRecording(s){
 const a=s.app||{},d=s.device||{},c=s.connection||{},sharing=a.sharing||{},scan=a.scan||{};
 if(!a.desktop&&!a.browser)return;
 const marked=sharing.mode==='marked',recording=!!a.recording;
 syncCountdown(s);
 const finalizing=countdownModel.view().phase==='finalizing',blocked=!c.connected||recording||(d.can==='running'&&!a.live_view?.active)||!!a.busy||!!scan.active||d.rx_check?.state==='running'||testStartPending;
 if($('stopSpardProbe'))$('stopSpardProbe').disabled=globalThis.BySpardProbe?.active!==true;
 if($('probeSpardAdapter'))$('probeSpardAdapter').disabled=recording||!!a.busy||globalThis.BySpardProbe?.active===true||!navigator.serial;
 if($('spardReadMode'))$('spardReadMode').disabled=recording||!!a.busy||globalThis.BySpardProbe?.active===true||!navigator.serial;
 if($('inspectSpardAdapter'))$('inspectSpardAdapter').disabled=recording||!!a.tuning?.active||!!a.busy||globalThis.ByAdapter?.busy===true||!navigator.serial;
 if(recording&&$('testCountdown').hidden)$('recordingPanel').open=true;
 $('testCountdown').hidden=!recording&&!finalizing;$('testProgress').hidden=!recording&&!finalizing;
 $('stopButton').hidden=!recording&&!a.tuning?.active&&d.rx_check?.state!=='running';
 $('markForm').hidden=false;$('marksList').hidden=!recording;
 $('test30Button').disabled=blocked;$('test60Button').disabled=blocked;$('test600Button').disabled=blocked||!a.browser;
 $('stopButton').disabled=!c.connected||(!recording&&!a.tuning?.active&&d.can!=='running'&&d.rx_check?.state!=='running')||finalizing;
 text('stopButton',a.tuning?.active?'Остановить автоподбор':recording?'Завершить тест':d.can==='running'?'Остановить приём':'Завершить тест');
 for(const [id,key,defaultValue] of [['monitorEnabled','monitor_enabled',false],['remoteSupportEnabled','remote_support_enabled',false],['manualMode','manual_mode',true]]){if(document.activeElement!==$(id))$(id).checked=sharing[key]??defaultValue;}
 if(document.activeElement!==$('captureMode'))$('captureMode').value=sharing.mode||'marked';
 if(document.activeElement!==$('captureDuration'))$('captureDuration').value=String(sharing.duration||60);
 $('captureMode').disabled=recording||d.can==='running'||!!a.busy;
 $('captureDuration').disabled=recording||d.can==='running'||!!a.busy||!marked;
 $('shareEnabled').checked=!!sharing.enabled;
 $('startButton').classList.toggle('hidden',marked);
 $('scanBitrate').disabled=true;
 $('cancelScan').classList.toggle('hidden',!scan.active);
 $('markButton').disabled=!c.connected||!!a.busy||!recording||finalizing;
 text('recordingBadge',finalizing?'Завершение…':recording?'Идёт запись':scan.active?'Поиск скорости…':'Готов к тесту');
 $('recordingBadge').className='chip '+(recording?'running good':'muted');
 text('recordMode',recording?'USB → диск ПК':'Ожидание записи');
 text('heroText',recording?'Тест записывается. Выполняйте действие и добавляйте отметки.':'Подключите ридер и выберите длительность теста.');
 text('logHint',recording?'Запись на диск активна':'Сейчас запись не идёт');
 text('recordingHelp',recording?'Отмечайте начало и конец действия. Новая отметка не продлевает тест.':'Выберите 30 или 60 секунд. Все принятые кадры сохранятся в браузере.');
 text('storageText','Каждая запись сохраняет все прочитанные USB-байты в wire.bin, события и отметки в capture.jsonl, все кадры в frames.csv. Фильтры экрана не изменяют лог. При включённой галочке завершённые записи автоматически отправляются; локальные файлы остаются.');
 text('shareStatus',(!sharing.enabled?'Отправка выключена. Настройка запоминается на этом ПК.':!sharing.configured?'Отправка включена, но сервер для этого ПК ещё не настроен. Записи остаются в очереди.':sharing.active?'Отправка записи на сервер…':'Отправка включена. В очереди: '+sharing.pending+' · отправлено: '+sharing.sent+' · '+Number((sharing.sent_bytes||0)/1048576).toFixed(1)+' МиБ.')+(sharing.enabled&&sharing.error?' '+sharing.error:''));
 if(scan.selected&&scan.selected!==lastScanSelection){$('bitrate').value=String(scan.selected);lastScanSelection=scan.selected;}
 $('bitrate').value='250000';$('bitrate').disabled=true;
 text('scanResults',(scan.active?'Проверяется '+Number(scan.bitrate||0).toLocaleString('ru-RU')+' бит/с. Только listen-only.\n':scan.message?scan.message+'\n':'')+(scan.results||[]).map(x=>Number(x.bitrate).toLocaleString('ru-RU')+' бит/с: '+x.frames+' кадров · '+x.errors+' ошибок'+(x.candidate?' · кандидат':'')).join('\n'));
}
async function saveRecording(values){try{await api('/api/recording/settings',values);await refreshState();}catch(e){toast(e.message,true);await refreshState();}}
$('captureMode').addEventListener('change',()=>saveRecording({mode:$('captureMode').value}));
$('captureDuration').addEventListener('change',()=>saveRecording({duration:Number($('captureDuration').value)}));
$('shareEnabled').addEventListener('change',()=>saveRecording({enabled:$('shareEnabled').checked}));
for(const [id,key] of [['monitorEnabled','monitor_enabled'],['remoteSupportEnabled','remote_support_enabled'],['manualMode','manual_mode']])$(id).addEventListener('change',()=>saveRecording({[key]:$(id).checked}));
$('scanBitrate').addEventListener('click',async()=>{try{lastScanSelection=null;await api('/api/bitrate/scan',{});await refreshState();}catch(e){toast(e.message,true);}});
$('cancelScan').addEventListener('click',async()=>{try{await api('/api/bitrate/cancel',{});}catch(e){toast(e.message,true);}});

function selectedProfile(){return profileCatalog?.profiles.find(p=>p.id===((state?.app?.desktop||state?.app?.browser)?(state.app.sharing?.profile||'unidentified'):previewProfile))||null;}
function renderConnectionProfile(s){
 const id=(s.app?.desktop||s.app?.browser)?(s.app.sharing?.profile||'unidentified'):previewProfile,p=profileCatalog?.profiles.find(x=>x.id===id);
 $('connectionProfile').value=id;
 $('connectionProfile').disabled=s.device?.can==='running'||!!s.app?.recording||!!s.app?.scan?.active;
 text('profileNote',p?p.note+' Выбор профиля не запускает CAN.':'Профиль недоступен; скорость выбирается вручную.');
 if(lastRenderedProfile!==id){$('bitrate').value='250000';lastRenderedProfile=id;lastScanSelection=null;}
}
$('connectionProfile').addEventListener('change',async()=>{const id=$('connectionProfile').value;lastRenderedProfile=null;lastScanSelection=null;$('bitrate').value='';if(state?.app?.desktop||state?.app?.browser)await saveRecording({profile:id});else{previewProfile=id;renderConnectionProfile(state);}});


const samplingProfiles=['TRIPLE'];
let samplingPending=false,lastSamplingActual=null;
function renderSampling(s){
 const a=s.app||{},d=s.device||{},c=s.connection||{},actual=d.rx_sampling_250k;
 const supported=typeof actual==='string'&&samplingProfiles.includes(actual);
 const blocked=!c.connected||!supported||d.can!=='stopped'||!!a.recording||!!a.busy||!!a.scan?.active||d.rx_check?.state==='running'||samplingPending;
 $('samplingProfile').disabled=true;$('applySampling').disabled=true;
 const allowed=d.sampling_profiles||samplingProfiles.slice(0,4);
 for(const option of $('samplingProfile').options||[])option.disabled=!allowed.includes(option.value);
 renderTuning(s,blocked);
 if(supported&&actual!==lastSamplingActual&&!$('samplingProfile').dataset.edited)$('samplingProfile').value=actual;
 lastSamplingActual=actual;
 text('samplingActual',actual==='TRIPLE'?'TRIPLE · 250 кбит/с':'TRIPLE будет установлен перед чтением');
 text('samplingStatus',samplingPending?'Применение профиля…':!c.connected?'Подключите ридер.':!supported?'Прошивка не сообщает профиль выборки. Обновите ESP32 через Chrome.':blocked?'Завершите запись и остановите CAN перед сменой профиля.':'После применения выполните тест 30 с при неизменном состоянии велосипеда.');
}
function renderTuning(s,blocked){
 const t=s.app?.tuning||{},profiles=s.device?.sampling_profiles||[];
 const supported=['SP625','SP625_TRIPLE','SP6875','SP6875_TRIPLE','MID','MID_TRIPLE'].every(p=>profiles.includes(p));
 $('startTuning').disabled=true;
 $('tuningDuration').disabled=!!t.active;
 text('tuningStatus',t.active?`Этап ${t.step||0}/${t.total}: ${t.profile||'подготовка'}. Не меняйте состояние велосипеда. Остановка — кнопкой «Остановить автоподбор».`:t.error?t.error:t.result?(t.result.candidate?'Кандидат: '+t.result.candidate+'. ':'')+t.result.reason+(t.restored?' Исходный профиль восстановлен.':' Исходный профиль не восстановлен.'):!supported?'Для автоподбора нужна прошивка ESP32 0.4.8.':'9 этапов, отдельный архив каждого теста. Не меняйте состояние велосипеда; после серии исходный профиль восстановится.');
 $('tuningResults').hidden=!(t.rows?.length);$('tuningRows').replaceChildren();
 for(const row of t.rows||[]){const tr=document.createElement('tr');for(const value of [row.profile,number.format(Math.round((row.quality?.frames_per_second||0)*10)/10),number.format(Math.round((row.quality?.errors_per_second||0)*10)/10),row.groups?.battery??0]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}$('tuningRows').append(tr);}
}
$('startTuning').addEventListener('click',async()=>{
 $('startTuning').disabled=true;
 try{await api('/api/tuning/start',{duration:Number($('tuningDuration').value)});await refreshState();}
 catch(e){toast(e.message,true);await refreshState();}
});
async function applySamplingProfile(){
 if($('applySampling').disabled||samplingPending)return;
 const profile=$('samplingProfile').value;
 if(!samplingProfiles.includes(profile))return;
 samplingPending=true;renderSampling(state);
 try{await api('/api/sampling',{profile});delete $('samplingProfile').dataset.edited;await refreshState();toast('Профиль приёма применён');}
 catch(e){toast(e.message,true);}
 finally{samplingPending=false;if(state)renderSampling(state);}
}
$('samplingProfile').addEventListener('change',()=>{$('samplingProfile').dataset.edited='1';});
$('applySampling').addEventListener('click',applySamplingProfile);
function captureQualityText(row){
 const q=row.capture_quality;if(!q)return '';
 const parts=[];
 if(typeof q.sampling_profile==='string')parts.push('профиль '+q.sampling_profile);
 if(q.active_traffic_observed===false||q.received_frames===0)parts.push('Нет CAN-кадров');
 if(typeof q.errors_per_second==='number'&&Number.isFinite(q.errors_per_second))parts.push(q.errors_per_second.toLocaleString('ru-RU',{maximumFractionDigits:1})+' ошибок/с');
 if(typeof q.frames_per_second==='number'&&Number.isFinite(q.frames_per_second))parts.push(q.frames_per_second.toLocaleString('ru-RU',{maximumFractionDigits:1})+' кадров/с');
 return parts.length?' · '+parts.join(' · '):'';
}
function renderBrowser(s){
 renderSampling(s);
 const a=s.app,c=s.connection,recording=a.recording,wifi=a.transport==='wifi';
 text('transportBadge',c.connected?(wifi?'Wi-Fi · ESP32':'USB · браузер'):'Подключите ESP32 по USB');
 text('heroText',a.live_view?.active?'Живые данные CAN. Полная запись не ведётся.':recording?'Все принятые кадры сохраняются. Выполняйте действие и отмечайте его начало и конец.':wifi?'Локальная панель ESP32. Запись начинается по вашему действию.':c.connected?'Ридер подключён. Выберите тест на 30 или 60 секунд.':'Подключите ESP32 по USB и нажмите «Подключить».');
 text('recordMode',a.live_view?.active?'Живой просмотр':recording?(wifi?'Wi-Fi → браузер':'USB → браузер'):'Ожидание записи');text('logHint',recording?'Запись в хранилище браузера':c.connected?'Ридер подключён по USB':'Выберите ридер ESP32 в окне Chrome');
 text('storageText','Кадры и отметки пишутся порциями в хранилище браузера. Неизвестные/RTR/невалидные кадры не отбрасываются. В таблице последние 500 кадров. Лимит сеанса — 128 МиБ; при ошибке записи CAN останавливается.');
 text('streamFoot','Экран и фильтр не ограничивают запись. Полные сеансы доступны в разделе «Записи браузера».');
 text('shareStatus',!a.sharing.enabled?'Отправка выключена. Галочка запоминается в этом браузере.':a.sharing.active?'Отправка архива на сервер…':`Очередь: ${a.sharing.pending} · отправлено: ${a.sharing.sent}${a.sharing.error?' · '+a.sharing.error:''}`);
 const rx=s.device?.rx_check,rxRunning=rx?.state==='running';
 $('checkRx').disabled=!c.connected||!rx||recording||!!a.scan?.active||s.device?.can==='running'||rxRunning;
 text('rxCheckResult',!c.connected?'Подключите ридер.':!rx?'Нужна прошивка ESP32 0.4.2.':rxRunning?'Проверка… до 10 секунд':rx.state==='cancelled'?'Проверка остановлена.':rx.state==='complete'?(rx.edges>0?'На CRX есть активность.':'Импульсов на CRX нет.'):'Проверка не запускалась.');
 text('rxCheckDetails',rx&&rx.state!=='idle'?`${rx.limit_reached?'Не менее ':''}${rx.edges} перепадов · ${rx.elapsed_ms} мс · GPIO5: ${rx.level}. Это проверка цифровой активности, а не определение скорости или подтверждение CAN.`:'');
 if(rxRunning){$('stopButton').disabled=false;$('startButton').disabled=true;}
 const monitor=a.monitor||{};
 text('monitorState',a.support?.last?.kind==='flash'&&a.support.last.state==='started'?'Обновление ESP32…':a.support?.ready?(a.support.last?.state==='started'?'Удалённая проверка идёт':'Поддержка подключена'):!monitor.enabled?'Выключена':!c.connected?'USB отключён':monitor.error?'Нет связи с сервером':monitor.last_sent?'Отправляется':'Подключение…');
 text('monitorDetails',`ESP ${s.device?.version||'—'} · CAN ${s.device?.can||'—'} · получено ${s.device?.received||0} · ошибки ${s.device?.bus_errors||0} · потери монитора ${monitor.dropped||0}`);
 text('monitorConsole',(monitor.lines||[]).map(e=>e.device?.type==='log'?e.device.message:e.device?.type==='error'?e.device.message:e.type==='connection_lost'?e.message:JSON.stringify(e)).join('\n')||'STATUS обновляется; отладочных сообщений пока нет.');
 text('browserStorage',a.storage?.quota?`${(a.storage.usage/1048576).toFixed(1)} МиБ занято из ${(a.storage.quota/1048576).toFixed(0)} МиБ браузера`:'Хранилище браузера активно');
 text('offlineState',wifi?'Все файлы страницы находятся на ESP32':a.offline_ready?'Страница сохранена для работы без интернета':'Сохранение страницы для автономного запуска…');
 const list=$('sessionList');list.replaceChildren();
 for(const row of (a.sessions||[]).slice(0,30)){const item=document.createElement('div');item.className='session-row';const label=document.createElement('span');label.textContent=(row.context?.kind==='rx_check'?'Сигнал CAN · ':row.context?.kind==='device_status'?'STATUS · ':row.context?.kind==='firmware_update'?'Обновление ESP32 · ':'')+new Date(row.started).toLocaleString('ru-RU')+' · '+(row.persisted_frames??row.frames)+' кадров сохранено · '+(row.bytes/1048576).toFixed(2)+' МиБ · '+(row.status==='recording'?'записывается':row.status==='interrupted'?'прервана':row.sent?'отправлена':'сохранена')+(row.gaps?' · пропуски '+row.gaps:'')+(row.finalization_verified===false?' · завершение не подтверждено':'')+(row.capture_integrity?.storage_match===false?' · ошибка сохранения':'');label.textContent+=captureQualityText(row);item.append(label);for(const type of ['jsonl','csv']){const b=document.createElement('button');b.className='button ghost';b.textContent=type.toUpperCase();b.disabled=recording||row.status==='recording';b.addEventListener('click',()=>browserRuntime.download(row.id,type==='csv').catch(e=>toast(e.message,true)));item.append(b);}list.append(item);}
 if(!list.children.length)list.textContent='Записей пока нет. Выберите тест 30 или 60 секунд.';
 $('browserFlash').hidden=wifi;
 $('browserFlash').disabled=!!recording||!!a.busy||!!a.scan?.active||rxRunning;
 $('folderButton').disabled=!window.showDirectoryPicker||recording;
 text('folderHint',window.showDirectoryPicker?'Выберите папку: завершённые JSONL сохраняются в её подпапку diag-logs.':'Для выгрузки файлов используйте JSONL/CSV у завершённого сеанса.');
}
$('quickConnectUSB')?.addEventListener('click',()=>{$('connectButton').click();});
$('folderButton').addEventListener('click',async()=>{try{await browserRuntime.chooseFolder();toast('Папка для новых записей выбрана');}catch(e){toast(e.message,true);}});
async function setupOffline(){if(!browserRuntime||browserRuntime.wifi||!window.isSecureContext||!('serviceWorker'in navigator))return;try{await ByAutoUpdate.start(browserRuntime,{notice:message=>text('siteUpdateStatus',message)});}catch(e){text('siteUpdateStatus','Автообновление недоступно: '+e.message);}}
const metricHistory={speed:[],voltage:[],current:[],cadence:[]};
function renderMetricCharts(){for(const[name,history]of Object.entries(metricHistory)){const e=$(name+'Value'),svg=$(name+'Chart');if(!e||!svg)continue;const value=Number(e.textContent.replace(/\s/g,'').replace(',','.'));if(!Number.isFinite(value)||e.textContent==='—')continue;history.push(value);if(history.length>60)history.shift();const low=Math.min(...history),high=Math.max(...history),span=Math.max(high-low,0.01);svg.setAttribute('points',history.map((v,i)=>`${i*180/59},${35-(v-low)/span*30}`).join(' '));}}

async function openManualFlasher(){try{if(browserRuntime?.wifi)throw Error('Откройте интернет-панель на ПК с USB');if(browserRuntime){if(browserRuntime.recorder||browserRuntime.tuner?.active||browserRuntime.scan.active||browserRuntime.operation||browserRuntime.device.can==='running')throw Error('Сначала остановите CAN и завершите запись');await browserRuntime.api('/api/disconnect',{});await browserRuntime.store.setting('usbAutoConnect',true);}location.assign('/flash.html');}catch(e){toast(e.message,true);}}
$('browserFlash').addEventListener('click',openManualFlasher);
$('manualFlashLink').addEventListener('click',e=>{e.preventDefault();openManualFlasher();});

$('checkRx').addEventListener('click',async()=>{try{await api('/api/rx-check',{});await refreshState();}catch(e){toast(e.message,true);}});
