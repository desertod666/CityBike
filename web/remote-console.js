/* Shared VPS operator console. This module never opens a physical port. */
'use strict';
(() => {
  const TOKEN_KEY='citybike-operator-token-v1',REQUEST_KEY='citybike-operator-request-v1';
  const SERVER=globalThis.ByBrowser?.SERVER||'https://134.98.158.132:18443';
  const ACTIONS={battery_information_quiet:'Читать Spard без сессии',reader_selftest:'Проверка передатчика ESP',battery_information:'Прочитать батарею через ESP',live_start:'Живой просмотр CAN',live_stop:'Остановить просмотр',capture30:'Тест 30 с',capture60:'Тест 60 с',spard_identity:'Модель и серийный номер',spard_parameters:'Параметры батареи',spard_information:'Прочитать Spard · 30 с',spard_listen:'Наблюдать линию · 30 с',sampling_sweep:'Автоподбор CAN',rx_check:'Проверить приём CAN',stop:'СТОП'};
  const STATES={queued:'В очереди',accepted:'Принято мостом',started:'Выполняется',complete:'Задание завершено',failed:'Не выполнено',cancelled:'Остановлено',expired:'Срок запуска истёк',interrupted:'Прервано'};
  const RUNNING=new Set(['queued','accepted','started']);
  let token='',state=null,posting=false,uncertain=null,polling=null,generation=0,receivedMono=0,clock=null,message='',authMessage='';
  let hadLocalDevice=false,localConnected=false,localTransport='USB',bridgeLayout=false;
  let panel,refs,interval,ticker,accessController;
  const number={format:value=>new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3}).format(value)};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const value=v=>finite(v)?number.format(v):'—';
  const read=(storage,key)=>{try{return storage.getItem(key)||'';}catch{return '';}};
  const save=(storage,key,value)=>{try{if(value)storage.setItem(key,value);else storage.removeItem(key);}catch{}};
  const active=()=>!!token;
  const online=()=>state?.online===true&&state?.bridge_authenticated===true&&state?.conflict!==true;
  const pending=()=>state?.pending&&typeof state.pending==='object'?state.pending:null;
  const ongoing=()=>RUNNING.has(pending()?.state);
  const busy=()=>posting||!!uncertain;
  const holding=()=>globalThis.ByAutoUpdate?.holding===true;
  const stockMode=()=>state?.bridge?.kind==='stock'||state?.device?.product==='StockCANAdapter';
  function supported(action){if(action==='battery_information_quiet'&&!globalThis.ByBatteryQuery?.supported(state?.device,true))return false;if(['spard_identity','spard_parameters'].includes(action)&&(!stockMode()||!state?.control?.capabilities?.includes('spard_service_reads_v1')))return false;if(stockMode()&&!['spard_information','spard_listen','spard_identity','spard_parameters','stop'].includes(action))return false;const caps=state?.control?.capabilities,cap=({battery_information_quiet:'battery_information',reader_selftest:'reader_selftest',battery_information:'battery_information',live_start:'live_view',live_stop:'live_view',capture30:'capture',capture60:'capture',sampling_sweep:'sampling_sweep',rx_check:'rx_check',spard_identity:'spard_probe',spard_parameters:'spard_probe',spard_information:'spard_probe',spard_listen:'spard_probe',stop:'stop'})[action];return !Array.isArray(caps)||caps.includes(cap);}
  const label=job=>ACTIONS[job?.action]||({capture:'Запись CAN',spard_probe:'Проверка Spard',sampling_sweep:'Автоподбор CAN',rx_check:'Проверка приёма',stop:'Остановка'})[job?.kind]||'Задание';
  const set=(name,text)=>{if(refs?.[name])refs[name].textContent=text;};
  function setLocalState(s){
    const device=s?.device||{},connection=s?.connection||{},app=s?.app||{};
    const transport=connection.transport||app.transport;
    const direct=(app.browser===true&&['usb','webserial','wifi'].includes(transport))||(app.desktop===true&&transport==='usb');
    localConnected=connection.connected===true&&direct&&device.product==='BafangReader'&&device.protocol===1
      &&typeof device.ap_mac==='string'&&/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(device.ap_mac.toLowerCase());
    const stock=app.stock_bridge;if(stock?.kind==='stock'){localConnected=stock.port_count===1;hadLocalDevice=true;localTransport='Spard USB';}
    // Page-local role survives a cable interruption, never credentials or reloads.
    if(localConnected&&stock?.kind!=='stock'){hadLocalDevice=true;localTransport=transport==='wifi'?'Wi-Fi':'USB';}
    render();
  }
  function placePanel(){
    if(!panel||bridgeLayout===hadLocalDevice)return;
    bridgeLayout=hadLocalDevice;
    refs.bridge.open=!hadLocalDevice;refs.bridgeSummary.hidden=!hadLocalDevice;
    const main=document.querySelector('main')||document.body;
    if(hadLocalDevice){const diagnostics=main.querySelector('#diagnostics');if(diagnostics)diagnostics.before(panel);else main.append(panel);}
    else{const live=main.querySelector('#canLivePanel'),header=main.querySelector(':scope > header');if(live)live.before(panel);else if(header)header.after(panel);else main.prepend(panel);}
  }
  function readToken(input){
    let s=String(input||'').trim();
    if(s.includes('#')){try{s=new URLSearchParams(new URL(s,location.href).hash.slice(1)).get('operator')||'';}catch{return '';}}
    return s&&s.length<=4096&&!/[\s<>]/.test(s)?s:'';
  }
  function bootstrap(){
    const hash=new URLSearchParams(location.hash.slice(1));
    if(hash.has('operator')){
      token=readToken(hash.get('operator'));save(localStorage,TOKEN_KEY,token);
      hash.delete('operator');const rest=hash.toString();
      history.replaceState(null,'',location.pathname+location.search+(rest?'#'+rest:''));
    }else token=readToken(read(localStorage,TOKEN_KEY));
    if(token){try{const p=JSON.parse(read(sessionStorage,REQUEST_KEY)||'null');if(p&&/^[a-f0-9]{32}$/.test(p.id)&&ACTIONS[p.action])uncertain=p;}catch{}}
  }
  function clearRequest(){uncertain=null;save(sessionStorage,REQUEST_KEY,'');}
  function authenticate(next){
    generation++;polling?.controller.abort();clearSpardAccess();token=next;save(localStorage,TOKEN_KEY,next);
    clearRequest();state=null;clock=null;message='';authMessage='';render();if(token)poll();
  }
  function clearSpardAccess(){
    accessController?.abort();accessController=null;
    if(refs?.spardRows)refs.spardRows.replaceChildren();
    if(refs?.spardStatus)refs.spardStatus.textContent='';
    if(refs?.spardAccess)refs.spardAccess.open=false;
  }
  async function loadSpardAccess(){
    if(!token||!refs.spardAccess.open)return;
    accessController?.abort();const controller=new AbortController(),epoch=generation;accessController=controller;
    refs.spardRows.replaceChildren();set('spardStatus','Загружаю справку…');
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(SERVER+'/v1/operator/spard-access',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});
      if(epoch!==generation||!refs.spardAccess.open)return;
      if(response.status===401){unauthorized();return;}
      if(!response.ok)throw Error('reference unavailable');
      const data=await response.json();
      if(epoch!==generation||!refs.spardAccess.open)return;
      if(data.ok!==true||!Array.isArray(data.credentials)||data.credentials.length!==2||data.credentials.some((v,i)=>v.role!==['Engineer','Developer'][i]||typeof v.password!=='string'||v.password.length<1||v.password.length>128))throw Error('invalid reference');
      for(const item of data.credentials){
        const row=document.createElement('div'),name=document.createElement('dt'),value=document.createElement('dd'),code=document.createElement('code'),copy=document.createElement('button');
        name.textContent=item.role;code.textContent=item.password;copy.type='button';copy.className='button ghost';copy.textContent='Скопировать';copy.setAttribute('aria-label','Скопировать пароль '+item.role);
        copy.onclick=async()=>{try{await navigator.clipboard.writeText(item.password);copy.textContent='Скопировано';}catch{set('spardStatus','Выделите и скопируйте пароль вручную.');}};
        value.append(code,copy);row.append(name,value);refs.spardRows.append(row);
      }
      set('spardStatus','Spard SBS Plus V1.3 · регистр букв важен');
    }catch{if(epoch===generation&&refs.spardAccess.open)set('spardStatus','Не удалось загрузить справку. Закройте и откройте этот раздел для повтора.');}
    finally{clearTimeout(timeout);if(accessController===controller)accessController=null;}
  }
  function unauthorized(){authenticate('');authMessage='Ключ не принят. Введите другой.';render();}
  function makeId(){
    if(globalThis.crypto?.randomUUID)return crypto.randomUUID().replaceAll('-','');
    const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
    return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  }
  function adopt(next){
    state=next;receivedMono=performance.now();clock=null;globalThis.ByCanLive?.remoteState(next);
    if(uncertain&&(next.pending?.id===uncertain.id||next.control?.last?.id===uncertain.id))clearRequest();
    const stock=next.control?.stock_adapter,cd=next.control?.countdown,job=next.pending;
    if(stock?.active===true){
      clock={remaining:stock.phase==='opening'?null:finite(stock.remaining_ms)?Math.max(0,stock.remaining_ms):null,
        duration:finite(stock.duration_s)?stock.duration_s*1000:0,estimate:false,
        title:stock.mode==='listen'?'Наблюдение линии через Spard':'Чтение батареи Spard'};
    }else if(cd&&['running','finalizing'].includes(cd.phase)){
      clock={remaining:finite(cd.remaining_ms)?Math.max(0,cd.remaining_ms):null,
        duration:finite(cd.duration_ms)?cd.duration_ms:0,estimate:false,title:'Запись CAN',phase:cd.phase};
    }else if(job?.state==='started'&&job.estimated_deadline_utc){
      const deadline=Date.parse(job.estimated_deadline_utc),server=Date.parse(next.server_utc);
      if(Number.isFinite(deadline)&&Number.isFinite(server))clock={remaining:Math.max(0,deadline-server),duration:finite(job.duration_s)?job.duration_s*1000:0,estimate:true,title:label(job)};
    }
    render();renderBattery();
  }
  async function poll(){
    if(!token||polling)return polling?.promise;
    const epoch=generation,controller=new AbortController();
    const work={controller};polling=work;
    work.promise=(async()=>{
      const timer=setTimeout(()=>controller.abort(),8000);
      try{
        const response=await fetch(SERVER+'/v1/operator/state',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});
        if(epoch!==generation)return;
        if(response.status===401){unauthorized();return;}
        if(!response.ok)throw Error('state');
        const data=await response.json();
        if(epoch!==generation)return;
        if(data?.ok!==true)throw Error('state');
        if(message==='Нет связи с сервером. Команды недоступны.')message='';
        adopt(data);
      }catch{
        if(epoch!==generation)return;
        if(state){state={...state,online:false};globalThis.ByCanLive?.remoteState(state);}
        message='Нет связи с сервером. Команды недоступны.';render();renderBattery();
      }finally{clearTimeout(timer);if(polling===work)polling=null;}
    })();
    return work.promise;
  }
  function canStart(action){if(action==='live_stop')return supported(action)&&online()&&!busy()&&!holding()&&!ongoing()&&state?.control?.ready===true&&state?.control?.live_view?.active===true&&state?.control?.recording!==true;return (!action||supported(action))&&online()&&!busy()&&!holding()&&!ongoing()&&state?.control?.ready!==false
    &&state?.control?.stock_adapter?.active!==true&&state?.control?.updating!==true
    &&state?.control?.busy!==true&&state?.control?.recording!==true&&(state?.device?.can!=='running'||['battery_information','battery_information_quiet','reader_selftest'].includes(action)&&state?.control?.live_view?.active===true);}
  function canStop(){
    const job=pending(),last=state?.control?.last;
    return supported('stop')&&online()&&!posting&&!holding()&&((job?.state==='started'&&job.kind!=='stop')
      ||(last?.state==='started'&&last.kind!=='stop'&&(!job||job.id===last.id)));
  }
  async function run(action,retry=false,isolation=null){
    if(!ACTIONS[action]||!token||posting||holding()||!supported(action))return false;
    if(retry){if(!uncertain||uncertain.action!==action)return false;}
    else if(action==='stop'?!canStop():!canStart(action))return false;
    if(!retry&&action==='reader_selftest'&&(!isolation||isolation.isolation_asserted!==true||isolation.expected_boot!==state?.device?.boot||isolation.expected_mac!==state?.device?.ap_mac))return false;
    if(!retry&&action==='battery_information_quiet'&&(!isolation||isolation.session_ended!==true||isolation.expected_boot!==state?.device?.boot||isolation.expected_mac!==state?.device?.ap_mac))return false;
    const request=retry?uncertain:{id:makeId(),action,submitted_utc:new Date().toISOString(),...(action==='reader_selftest'?{isolation}:action==='battery_information_quiet'?{session:isolation}:{})};
    // Persist identity before sending: an unknown outcome can only retry this ID.
    uncertain=request;save(sessionStorage,REQUEST_KEY,JSON.stringify(request));
    posting=true;message='Отправка задания…';generation++;const epoch=generation;
    polling?.controller.abort();render();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      if(holding()){clearRequest();message='Обновление страницы: дождитесь завершения.';return false;}
      const response=await fetch(SERVER+'/v1/operator/jobs',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:request.id,action:request.action,...(request.action==='reader_selftest'?request.isolation:request.action==='battery_information_quiet'?request.session:{})}),signal:controller.signal});
      if(epoch!==generation)return false;
      if(response.status===401){unauthorized();return false;}
      const data=await response.json();
      if(!response.ok||data?.ok!==true){
        // A 5xx/timeout can occur after the server durably accepted the job.
        if(![400,403,404,409,422].includes(response.status))throw Error('ambiguous');
        clearRequest();
        message=({offline:'Мост не в сети.',bridge_conflict:'Подключено несколько мостов.',reader_busy:'Ридер занят.',permission_denied:'Удалённые задания не разрешены на мосте.',not_ready:'Мост ещё не готов к удалённым заданиям.',unsupported:'Эта сборка моста не поддерживает выбранную проверку.',unsupported_capability:'Эта сборка моста не поддерживает выбранную проверку.',older_build:'Обновите страницу на компьютере, подключённом к ридеру.',job_pending:'Другое задание уже ожидает выполнения.',id_conflict:'Не удалось подтвердить это задание.'})[data?.error]||'Сервер отклонил задание.';
        return false;
      }
      if(!data.job||data.job.id!==request.id)throw Error('confirmation');
      clearRequest();state={...(state||{}),pending:data.job};
      message='Задание принято сервером. Ожидаем подтверждение моста.';return true;
    }catch{
      if(epoch===generation)message='Подтверждение не получено. Проверяем состояние; повтор использует тот же номер задания.';
      return false;
    }finally{
      clearTimeout(timer);posting=false;render();
      // An earlier GET aborted by this POST may still be unwinding.
      if(polling)await polling.promise;
      if(epoch===generation)poll();
    }
  }
  function ageText(){
    if(!finite(state?.age_seconds))return 'Время последнего сообщения неизвестно';
    const seconds=Math.max(0,state.age_seconds+Math.floor((performance.now()-receivedMono)/1000));
    return 'Последнее сообщение '+(seconds<60?Math.floor(seconds)+' с':Math.floor(seconds/60)+' мин')+' назад';
  }
  function renderClock(){
    if(!refs)return;
    const show=online()&&!!clock;refs.clock.hidden=!show;
    if(!show)return;
    const remaining=clock.remaining===null?null:Math.max(0,clock.remaining-(performance.now()-receivedMono));
    const seconds=remaining===null?null:Math.ceil(remaining/1000);
    set('time',seconds===null?'—:—':String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'));
    set('phase',clock.title+(clock.estimate?' · время приблизительное':'')+(remaining===0||clock.phase==='finalizing'?' · Завершение…':remaining===null?' · Подготовка…':''));
    refs.progress.hidden=!clock.duration||remaining===null;
    refs.progress.value=remaining===null?0:Math.max(0,Math.min(1,1-remaining/clock.duration));
  }
  function render(){
    if(!panel)return;
    document.body.classList.toggle('operator-mode',active());
    document.body.classList.toggle('operator-bridge',hadLocalDevice);placePanel();
    refs.spardAccess.hidden=!active();
    refs.auth.hidden=active();refs.content.hidden=!active()||hadLocalDevice;
    refs.bridgeInfo.hidden=!hadLocalDevice;refs.bridgeChangeKey.hidden=!active();
    set('bridgeConnection',localTransport+(localConnected?' подключён':' отключён · ожидаем подключения'));
    set('bridgeStatus',!active()?'PIN нужен только для доступа с другого компьютера.':online()?'Удалённый доступ включён.':'Удалённый сервер недоступен. Локальная диагностика работает напрямую.');
    set('authStatus',authMessage||'Удалённый доступ: введите ключ');
    set('connection',!active()?'':!state?'Получение состояния…':state.conflict?'Несколько мостов':online()?(stockMode()?'Штатный адаптер Spard в сети':'Мост ESP32 в сети'):'Мост не в сети');
    panel.dataset.online=String(online());
    set('age',ageText());set('notice',message);
    const device=state?.device||{},job=pending()||state?.control?.last;
    set('dataLabel',stockMode()?'Штатный адаптер Spard · USB':online()?'Состояние ридера':'Последние полученные данные');
    if(refs.metrics)refs.metrics.hidden=stockMode();set('canNote',stockMode()?'Доступны чтение Spard и наблюдение линии. Этот USB-лог не является записью всех CAN-кадров.':'Число ошибок не равно числу потерянных кадров. Завершение задания ещё не подтверждает загрузку архива.');set('deviceKind',stockMode()?'Spard USB':'ESP32');
    set('frames',value(device.received));set('errors',value(device.bus_errors));
    set('can',device.can==='running'?'Приём идёт':device.can==='stopped'?'Остановлен':'—');
    set('job',job?label(job)+' · '+(STATES[job.state]||'Состояние неизвестно'):'Нет текущего задания');
    set('firmware',typeof device.version==='string'?device.version:'—');
    set('boot',stockMode()?state?.bridge?.boot||'—':typeof device.boot==='string'?device.boot:'—');
    set('permission',state?.control?.ready===false?'На мосте нужно разрешить удалённые задания и отключить ручной режим.':'');
    for(const button of panel.querySelectorAll('[data-remote-action]')){
      const action=button.dataset.remoteAction,stockAction=['spard_information','spard_listen','spard_identity','spard_parameters'].includes(action);
      button.hidden=stockAction?!stockMode():stockMode()&&['capture30','capture60'].includes(action)||action==='stop'&&!canStop();
      button.disabled=action==='stop'?!canStop():!canStart(action);
    }
    refs.retry.hidden=!uncertain;refs.retry.disabled=posting||!online()||holding()||!supported(uncertain?.action);
    renderClock();
  }
  function renderBattery(){
    if(!refs)return;
    refs.battery.hidden=true;refs.batteryValues.replaceChildren();
    const packet=state?.control?.stock_adapter?.latest_information;
    if(!packet||typeof packet.raw_hex!=='string')return;
    const decoded=globalThis.BySpardInformation?.decode(packet.raw_hex);
    if(decoded?.status!=='decoded'||decoded.checksum_valid!==true)return;
    const f=decoded.fields;refs.battery.hidden=false;
    const stamp=new Date(packet.received_utc);
    set('batteryTime','Последнее чтение батареи · '+(Number.isNaN(stamp.getTime())?'время неизвестно':stamp.toLocaleString(globalThis.ByI18n?.locale?.()||'ru-RU'))+(online()?'':' · мост не в сети'));
    const rows=[['Сумма ячеек',value(f.cell_sum_mv/1000)+' В'],['Ток',value(f.current_ma/1000)+' А'],['Заряд',f.soc_percent>=0&&f.soc_percent<=100?value(f.soc_percent)+' %':'—'],['SOH',f.soh_percent>=0&&f.soh_percent<=100?value(f.soh_percent)+' %':'—'],['Ячейки',value(f.cell_count)+' · разброс '+value(f.delta_cell_mv)+' мВ'],['Прошивка BMS',f.firmware_version||'—']];
    for(const [name,text]of rows){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=text;div.append(dt,dd);refs.batteryValues.append(div);}
  }
  function mount(){
    if(panel)return;const main=document.querySelector('main')||document.body;
    panel=document.createElement('section');panel.id='remoteConsole';panel.className='remote-console';panel.setAttribute('aria-labelledby','remoteConsoleTitle');
    panel.innerHTML='<div class="remote-console-heading"><h2 id="remoteConsoleTitle">Велосипед · удалённая панель</h2><span data-remote-ref="connection" role="status"></span></div><form data-remote-ref="auth" class="remote-console-auth"><label><span data-remote-ref="authStatus">Удалённый доступ: введите ключ</span><input data-remote-ref="key" type="password" autocomplete="current-password" maxlength="4096" placeholder="Ключ или ссылка владельца" aria-label="Ключ удалённого доступа"></label><button type="submit" class="button dark">Подключить</button></form><div data-remote-ref="content" hidden><p data-remote-ref="age" class="remote-console-subtle"></p><p data-remote-ref="permission" class="remote-console-subtle"></p><div class="remote-console-actions"><button class="button accent" data-remote-action="capture30">Тест 30 с</button><button class="button dark" data-remote-action="capture60">Тест 60 с</button><button class="button dark" data-remote-action="spard_information">Прочитать Spard · 30 с</button><button class="button ghost" data-remote-action="spard_identity">Модель и серийный номер</button><button class="button ghost" data-remote-action="spard_parameters">Параметры батареи</button><button class="button ghost" data-remote-action="spard_listen">Наблюдать линию · 30 с</button><button class="button remote-console-stop" data-remote-action="stop">СТОП</button></div><div data-remote-ref="clock" class="remote-console-clock" hidden><strong data-remote-ref="time" role="timer">—:—</strong><span data-remote-ref="phase"></span><progress data-remote-ref="progress" max="1" value="0" aria-label="Выполнение удалённой проверки"></progress></div><p data-remote-ref="job" class="remote-console-job" role="status"></p><p data-remote-ref="notice" class="remote-console-subtle" role="status"></p><button data-remote-ref="retry" class="button ghost" hidden>Повторить подтверждение</button><h3 data-remote-ref="dataLabel">Состояние ридера</h3><dl data-remote-ref="metrics" class="remote-console-metrics"><div><dt>CAN-кадры</dt><dd data-remote-ref="frames">—</dd></div><div><dt>Ошибки приёма CAN</dt><dd data-remote-ref="errors">—</dd></div><div><dt>CAN</dt><dd data-remote-ref="can">—</dd></div></dl><p data-remote-ref="canNote" class="remote-console-subtle">Число ошибок не равно числу потерянных кадров. Завершение задания ещё не подтверждает загрузку архива.</p><section data-remote-ref="battery" class="remote-console-battery" hidden><h3>Батарея Spard</h3><p data-remote-ref="batteryTime" class="remote-console-subtle"></p><dl data-remote-ref="batteryValues" class="remote-console-metrics"></dl></section><details><summary>Сведения и доступ</summary><p class="remote-console-subtle"><span data-remote-ref="deviceKind">ESP32</span> <span data-remote-ref="firmware">—</span> · загрузка <span data-remote-ref="boot">—</span></p><button class="button ghost" data-remote-action="rx_check">Проверить приём CAN</button> <button class="button ghost" data-remote-ref="changeKey">Сменить ключ</button></details></div>';
    refs={};for(const node of panel.querySelectorAll('[data-remote-ref]'))refs[node.dataset.remoteRef]=node;
    const serviceDetails=refs.content.querySelector('details');serviceDetails.prepend(refs.dataLabel,refs.metrics,refs.canNote);
    const bridge=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
    bridge.className='remote-console-bridge';bridge.open=true;summary.hidden=true;summary.textContent='Удалённый доступ';
    const badge=document.createElement('span');badge.className='remote-console-bridge-badge';summary.append(badge);
    while(panel.firstChild)body.append(panel.firstChild);
    const info=document.createElement('div');info.hidden=true;
    const explanation=document.createElement('p');explanation.className='remote-console-subtle';explanation.textContent='Показания и проверки на этом компьютере работают напрямую, без PIN и связи с сервером.';
    const access=document.createElement('p');access.className='remote-console-subtle';
    const change=document.createElement('button');change.type='button';change.className='button ghost';change.textContent='Сменить ключ';
    info.append(explanation,access,change);body.prepend(info);bridge.append(summary,body);panel.append(bridge);
    Object.assign(refs,{bridge,bridgeSummary:summary,bridgeInfo:info,bridgeStatus:access,bridgeChangeKey:change,bridgeConnection:badge});
    const spardAccess=document.createElement('details'),spardSummary=document.createElement('summary'),spardStatus=document.createElement('p'),spardRows=document.createElement('dl');
    spardAccess.className='spard-access';spardAccess.hidden=true;spardSummary.textContent='Пароли Spard';spardStatus.className='remote-console-subtle';spardStatus.setAttribute('role','status');spardRows.className='spard-access-rows';
    spardAccess.append(spardSummary,spardStatus,spardRows);panel.append(spardAccess);Object.assign(refs,{spardAccess,spardStatus,spardRows});
    spardAccess.addEventListener('toggle',()=>{if(spardAccess.open)loadSpardAccess();else clearSpardAccess();});
    const live=main.querySelector('#canLivePanel'),header=main.querySelector(':scope > header');if(live)live.before(panel);else if(header)header.after(panel);else main.prepend(panel);
    refs.auth.addEventListener('submit',event=>{event.preventDefault();const next=readToken(refs.key.value);refs.key.value='';if(!next){authMessage='Введите ключ или ссылку с #operator=…';render();return;}authenticate(next);});
    refs.changeKey.onclick=()=>{authenticate('');refs.key.focus();};
    refs.bridgeChangeKey.onclick=refs.changeKey.onclick;
    refs.retry.onclick=()=>{if(uncertain)run(uncertain.action,true);};
    for(const button of panel.querySelectorAll('[data-remote-action]'))button.onclick=()=>run(button.dataset.remoteAction);
    render();renderBattery();poll();interval=setInterval(poll,2000);
    ticker=setInterval(()=>{set('age',ageText());renderClock();},200);
  }
  bootstrap();
  globalThis.ByRemoteConsole={get token(){return token;},get active(){return active();},get busy(){return busy();},get localBridge(){return hadLocalDevice;},poll,run,setLocalState,
    snapshot(){return {active:active(),busy:busy(),online:online(),local_bridge:hadLocalDevice,local_connected:localConnected,state:state?JSON.parse(JSON.stringify(state)):null};}};
  window.addEventListener('storage',event=>{if(event.key===TOKEN_KEY){const next=readToken(event.newValue);if(next!==token)authenticate(next);}});
  window.addEventListener('pagehide',()=>{clearInterval(interval);clearInterval(ticker);polling?.controller.abort();clearSpardAccess();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
