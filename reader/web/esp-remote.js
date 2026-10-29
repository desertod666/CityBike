/* Momentary BLE handset control. The USB browser executes, all pages share one lease. */
'use strict';
(()=>{
 const SERVER='https://134.98.158.132:18443',stamp=()=>new Date().toISOString(),mono=()=>performance.now();
 const random=n=>ByStore.uuid().slice(0,n),supported=d=>d?.product==='BafangReader'&&d.capabilities?.includes('ble_remote_v1');
 const runtime=()=>typeof browserRuntime==='undefined'?null:browserRuntime;
 async function request(path,{key,token,body,timeout=1200}={}){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
  try{const response=await fetch(SERVER+path,{method:body?'POST':'GET',headers:{...(key?{'X-Reader-Control':key}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:abort.signal});const value=await response.json();if(!response.ok||!value.ok)throw Error(value.message||value.error||'Нет связи с пультом');return value;}
  finally{clearTimeout(timer);}
 }
 class WindowLog {
  constructor(r){this.r=r;this.ring=[];this.active=null;this.last=null;this.error='';}
  feed(device){
   const row={type:'device',host_utc:stamp(),device:structuredClone(device)},at=mono();this.ring.push({at,row});
   while(this.ring.length>1024||this.ring[0]?.at<at-3000)this.ring.shift();
   if(this.active)this.append([row]).catch(e=>{this.error=String(e.message||e);this.failed=true;});
  }
  async append(rows){const a=this.active;if(!a)return;const recorder=await a.recorder;
   for(const row of rows){const f=row.device;if(f?.type==='frame'){recorder.session.frames++;if(a.lastFrame&&a.lastFrame.boot===f.boot&&a.lastFrame.epoch===f.epoch&&f.seq>a.lastFrame.seq+1)recorder.session.gaps+=f.seq-a.lastFrame.seq-1;a.lastFrame=f;}}
   await recorder.write(rows);
  }
  async begin(hold,button){
   if(this.failed)throw Error('Не удалось сохранить CAN-запись; отправка кнопки остановлена');
   clearTimeout(this.finishTimer);
   if(this.active&&mono()-this.active.started>40000)await this.finish();
   if(!this.active){
    const postMs=button===3?30000:3000;
    const context={...this.r.context(),kind:'ble_remote_can_window',pre_trigger_ms:3000,post_trigger_ms:postMs,physical_power_lines_measured:false,power_lines_notice:'Separate On/off wiring is not measured by CAN. No GPIO drives those wires.',notification_timestamp_semantics:'ESP BLE notification enqueue and CAN dequeue share boot uptime; not peer execution time'};
    const a=this.active={started:mono(),postMs,recorder:ByStore.Recorder.start(this.r.store,context,{enabled:false})};
    await this.append(this.ring.map(x=>x.row));await (await a.recorder).flush();
    this.flushTimer=setInterval(()=>a.recorder.then(r=>r.flush()).catch(e=>{this.error=String(e.message||e);this.failed=true;}),1000);
   }
   this.active.postMs=Math.max(this.active.postMs,button===3?30000:3000);
   await this.mark('press_requested',{hold,button,post_trigger_ms:this.active.postMs});await (await this.active.recorder).flush();
  }
  mark(type,extra={}){return this.append([{type:'remote_action',host_utc:stamp(),action:type,...extra}]);}
  released(reason){this.mark('release_requested',{reason}).catch(()=>{});clearTimeout(this.finishTimer);this.finishTimer=setTimeout(()=>this.finish().catch(e=>{this.error=String(e.message||e);}),this.active?.postMs||3000);}
  async finish(){
   const a=this.active;if(!a)return;this.active=null;clearInterval(this.flushTimer);clearTimeout(this.finishTimer);
   const r=await a.recorder;await r.write([{type:'remote_window_end',host_utc:stamp(),window_capture:true,stream_stop_fence_requested:false}]);
   const s=await r.finish('stop',false);this.last={id:s.id,frames:s.frames,receipt:null};
   try{const blob=await this.r.store.export(s);this.file=new File([blob],'CityBike-Remote-CAN-'+s.id+'.jsonl',{type:'application/x-ndjson'});this.uploader??=new ByFiles.FileUploader();const receipt=await this.uploader.send(this.file);s.sent=true;s.receipt=receipt;await this.r.store.put('sessions',s);this.last.receipt=receipt.id;this.error='';}
   catch(e){this.error=String(e.message||e);}
  }
  snapshot(){return {recording:!!this.active,last:this.last,error:this.error||null};}
 }
 // The page holding USB keeps its input lease locally. Network latency must
 // not turn a physical button hold into UP. The server coordinates ownership
 // in the background; it never renews or replays local button edges.
 class LocalControl {
  constructor({handset,actor,boot,seq,send,clock=mono}){
   this.actor=actor;this.session=handset.session;this.boot=boot;this.serverSeq=seq;this.inputSeq=seq;this.send=send;this.clock=clock;
   this.enabled=true;this.button=0;this.hold='';this.lastHold='';this.expires=clock()+3000;this.keyExpires=0;this.holdUntil=0;this.reason='enabled';this.lastSync=-Infinity;
  }
  expire(){const now=this.clock();if(this.enabled&&now>=this.expires){this.enabled=false;this.button=0;this.reason='controller_timeout';}else if(this.button&&(now>=this.keyExpires||now>=this.holdUntil)){this.button=0;this.reason=now>=this.holdUntil?'max_hold':'button_timeout';}}
  accept(body){
   this.expire();if(body.expected_boot!==this.boot||body.actor!==this.actor||body.seq<=this.inputSeq)throw Error('Управление пультом передано другой странице');
   this.inputSeq=body.seq;const now=this.clock(),action=body.action;
   if(action==='off'){this.enabled=false;this.button=0;this.reason='owner_off';return;}
   if(!this.enabled||this.takeover)throw Error('Сначала включите пульт');
   if(action==='down'){
    if(this.button||body.hold===this.lastHold||![1,2,3].includes(body.button))throw Error('Отпустите кнопку перед повторным нажатием');
    if(body.button===3&&body.confirmed!==true)throw Error('Подтвердите выключение');
    this.button=body.button;this.hold=this.lastHold=body.hold;this.keyExpires=now+900;this.holdUntil=now+30000;this.reason='pressed';
   }else if(action==='keep'){if(this.button&&body.hold===this.hold)this.keyExpires=now+900;}
   else if(action==='up'&&body.hold===this.hold){this.button=0;this.reason='released';}
   else if(action!=='ping'&&action!=='up')throw Error('Invalid local input');
   this.expires=now+3000;
  }
  snapshot(){this.expire();const now=this.clock();return {enabled:this.enabled,actor:this.actor,session:this.session,button:this.button,hold:this.hold,reason:this.reason,local:true,lease_ms:Math.max(0,this.expires-now),key_lease_ms:this.button?Math.max(0,Math.min(this.keyExpires,this.holdUntil)-now):0};}
  async sync(){
   if(this.syncing||this.clock()-this.lastSync<500)return;this.syncing=true;this.lastSync=this.clock();
   const post=action=>this.send({actor:this.actor,seq:++this.serverSeq,action,expected_boot:this.boot});
   const adopt=w=>{if(w?.enabled&&w.actor!==this.actor||this.enabled&&!w?.enabled&&w?.reason==='owner_off'){this.takeover=w;return true;}return false;};
   try{
    if(this.enabled){await post('ping');this.networkError='';}
    else if(!this.offAcknowledged){await post('off');this.offAcknowledged=true;this.networkError='';}
    else adopt((await this.send()).handset);
   }catch(e){
    this.networkError=String(e.message||e);
    try{adopt((await this.send()).handset);}catch{}
   }finally{this.syncing=false;}
  }
 }
 class Executor {
  constructor(r){this.r=r;this.log=new WindowLog(r);this.nativeSession=null;this.hold=null;this.lastNativeSeq=0;this.error='';this.failedActor=null;this.lastAlive=0;}
  get enabled(){return this.r.device?.ble_remote?.enabled===true;}
  async call(command){try{const s=await this.r.transport.call(command);this.r.device=s;await this.log.mark('command_ack',{command,boot:s.boot,remote:s.ble_remote});return s;}catch(e){e.remoteCommand=true;try{this.r.device=await this.r.transport.poll();}catch{}throw e;}}
  next(){return ++this.lastNativeSeq;}
  enableLocal(body,result,send){
   const local=new LocalControl({handset:result.handset,actor:body.actor,boot:body.expected_boot,seq:body.seq,send:async value=>{if(this.local!==local)throw Error('Local controller replaced');return send(value);}});this.local=local;return result;
  }
  async off(reason){
   try{if(this.nativeSession||this.enabled)await this.call('REMOTE OFF');}finally{this.log.released(reason);this.nativeSession=null;this.hold=null;this.holdNotice='';}
  }
  async apply(wanted,elapsed=0){
   const r=this.r,keyUntil=mono()+(wanted?.key_lease_ms||0)-elapsed-150,modeUntil=mono()+(wanted?.lease_ms||0)-elapsed-200;if(!wanted?.enabled||wanted.lease_ms<=elapsed+200){await this.off('controller_released');return;}
   if(this.failedActor===wanted.session)throw Error('Пульт остановлен. Выключите и включите его снова.');
   if(this.nativeSession&&this.nativeSession!==wanted.session)await this.off('controller_changed');
   if(!this.nativeSession){
    if(r.recorder||r.flashBusy||r.operation||r.ending||r.tuner?.active||r.batteryQuery?.active)throw Error('Ридер занят');
    if(r.device.can!=='running')await r.liveStart();
    this.nativeSession=wanted.session;await this.call('REMOTE ON '+wanted.session);this.lastNativeSeq=0;this.lastAlive=mono();
   }else if(!r.device.ble_remote?.enabled){this.failedActor=wanted.session;await this.off('native_remote_stopped');throw Error('Пульт остановлен. Выключите и включите его снова.');}
   if(this.hold&&(!wanted.button||wanted.hold!==this.hold||wanted.key_lease_ms<=elapsed+150||r.device.ble_remote?.button===0)){
    const hold=this.hold,reason=wanted.local&&['max_hold','button_timeout'].includes(wanted.reason)?wanted.reason:!wanted.button||wanted.hold!==hold?'released':r.device.ble_remote?.button===0?'native_hold_expired':'input_lease_expired';
    // A refreshed snapshot may still describe the same physical press. Once UP
    // was sent, that hold must never become a second DOWN, even after renewal.
    this.blockedHold=hold;
    await this.call(`REMOTE UP ${this.nativeSession} ${hold} ${this.next()}`);this.hold=null;
    if(reason!=='released')this.holdNotice=reason==='max_hold'?'Достигнут лимит 30 секунд. Отпустите кнопку и нажмите снова.':'Удержание прервано. Отпустите кнопку и нажмите снова.';
    await this.log.mark('hold_closed',{hold,reason,key_lease_ms:wanted.key_lease_ms,poll_elapsed_ms:elapsed});this.log.released(reason);
   }
   if(wanted.button&&wanted.key_lease_ms>elapsed+150&&this.blockedHold!==wanted.hold){
    if(!this.hold){
     if(r.device.can!=='running')throw Error('Включите чтение CAN перед нажатием');
     if(!r.device.ble_remote?.connected||!r.device.ble_remote?.subscribed)throw Error('Дождитесь BLE-подключения и подписки');
     await this.log.begin(wanted.hold,wanted.button);
     if(this.log.failed)throw Error('Хранилище недоступно');
     if(wanted.local){const current=this.local?.snapshot();if(!current?.enabled||this.local.boot!==r.device.boot||current.button!==wanted.button||current.hold!==wanted.hold){this.log.released('local_input_released_before_transmit');return;}}
     if(mono()>=keyUntil||mono()>=modeUntil){this.log.released('input_expired_before_transmit');return;}
     await this.call(`REMOTE DOWN ${this.nativeSession} ${wanted.hold} ${this.next()} ${wanted.button}`);this.hold=wanted.hold;this.holdNotice='';
    }else await this.call(`REMOTE KEEP ${this.nativeSession} ${this.hold} ${this.next()}`);
   }
   if(mono()-this.lastAlive>500){await this.call(`REMOTE ALIVE ${this.nativeSession} ${this.next()}`);this.lastAlive=mono();}
  }
  async tick(){
   if(this.polling||!supported(this.r.device)||!this.r.transport?.connected||this.r.wifi||this.r.flashBusy||this.r.updateHold)return;
   this.polling=true;const began=mono();
   try{
    if(this.local){const local=this.local;if(local.boot!==this.r.device.boot){this.local=null;this.nativeSession=null;this.hold=null;this.onLocalRevoked?.(local.actor);return;}local.sync();if(local.takeover){this.local=null;this.onLocalRevoked?.(local.actor);await this.apply(local.takeover);}else await this.apply(local.snapshot());}
    else{const result=await request('/v1/handset/'+this.r.id,{key:this.r.support.key});if(this.local)return;await this.apply(result.handset,mono()-began);}
    this.error='';
   }
   catch(e){this.error=String(e.message||e);if(e.remoteCommand){if(this.nativeSession)this.failedActor=this.nativeSession;try{await this.off('native_command_failed');}catch{}}else if(this.hold){this.blockedHold=this.hold;try{await this.call(`REMOTE UP ${this.nativeSession} ${this.hold} ${this.next()}`);}catch{}this.hold=null;this.log.released('control_unavailable');}}
   finally{this.polling=false;}
  }
  snapshot(){return {enabled:this.enabled,local_control:!!this.local?.enabled,error:this.error||this.holdNotice||null,log:this.log.snapshot()};}
 }
 class Input {
  constructor({send,changed=()=>{}}){this.send=send;this.changed=changed;this.actor=random(16);this.seq=0;this.armed=false;this.held=null;this.tail=Promise.resolve();this.error='';}
  request(action,extra={}){const value={actor:this.actor,seq:++this.seq,action,...extra};const task=this.tail.then(()=>this.send(value));this.tail=task.catch(()=>{});return task;}
  async on(){this.actor=random(16);this.seq=0;await this.request('on');this.armed=true;this.error='';this.changed();}
  async off(){this.armed=false;this.held=null;try{await this.request('off');}finally{this.changed();}}
  async down(button,confirmed=false){
   if(!this.armed||this.held)throw Error('Сначала включите пульт');
   if(button===3&&!confirmed)throw Error('Подтвердите выключение');
   const hold=random(8);this.held={hold,button};this.changed();
   try{await this.request('down',{hold,button,...(button===3?{confirmed:true}:{})});}catch(e){if(this.held?.hold===hold)this.held=null;throw e;}
  }
  async up(){const h=this.held;this.held=null;this.changed();if(h)await this.request('up',{hold:h.hold});}
  async tick(){if(!this.armed||this.pinging)return;this.pinging=true;
   try{if(this.held)await this.request('keep',{hold:this.held.hold});else await this.request('ping');}
   catch(e){this.error=String(e.message||e);this.armed=false;await this.up().catch(()=>{});}
   finally{this.pinging=false;this.changed();}
  }
 }
 let executor=null,input=null;
 globalThis.ByEspRemote={Executor,Input,LocalControl,WindowLog,supported,get busy(){return !!executor?.enabled||!!executor?.log.active||!!input?.armed;},feed(message){executor?.log.feed(message);},snapshot(){return executor?.snapshot()||null;}};
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id),panel=$('espRemotePanel');if(!panel)return;
 const t=s=>globalThis.ByI18n?.t?.(s)||s;
 function target(){const r=runtime();return r?.transport?.connected&&!r.wifi?{local:true,r,device:r.device,online:true}:Object.assign({local:false},globalThis.ByRemoteConsole?.snapshot?.()?.state||{});}
 function paint(){
  const a=target(),d=a.device||{},ble=d.ble_remote||{},valid=!!a.online&&supported(d),owned=input?.armed;
  $('espRemoteOn').disabled=!valid||!!owned||!!a.control?.busy;
  $('espRemoteOn').textContent=t(ble.enabled&&!owned?'Управлять пультом':'Включить пульт');
  $('espRemoteOff').disabled=!valid||(!ble.enabled&&!owned);
  const canPress=valid&&d.can==='running'&&ble.enabled&&ble.connected&&ble.subscribed&&!!owned;
  for(const b of panel.querySelectorAll('[data-remote-key]')){b.disabled=!canPress||(!!input.held&&input.held.button!==Number(b.dataset.remoteKey));b.classList.toggle('is-held',input?.held?.button===Number(b.dataset.remoteKey));b.setAttribute('aria-pressed',input?.held?.button===Number(b.dataset.remoteKey)?'true':'false');}
  $('espRemotePower').disabled=!canPress;
  $('espRemoteStatus').textContent=t(runtime()?.wifi?'Пульт доступен при подключении ESP32 по USB':!valid?'Для пульта нужна новая прошивка ESP32':!ble.enabled?'Пульт выключен':ble.subscribed?'BLE подключён · кнопки готовы':ble.connected?'BLE подключён · ожидаю подписку':ble.advertising?'Пульт включён · ожидаю велосипед':'Запускаю пульт…');
  const log=a.local?executor?.snapshot():a.control?.handset_log;
  $('espRemoteLog').textContent=t('CAN-запись:')+' '+(log?.log?.recording?t('записываю действие'):log?.log?.last?.receipt?t('отправлена')+' · '+log.log.last.receipt:t('автоматически при нажатии'));
  $('espRemoteError').textContent=t(input?.error||log?.error||log?.log?.error||'');
 }
 async function post(body){
  const a=target();if(!a.online||!supported(a.device))throw Error('Подключите ESP32 с новой прошивкой');body.expected_boot=a.device.boot;
  if(!a.local)return request('/v1/operator/handset',{token:globalThis.ByRemoteConsole?.token,body,timeout:1000});
  const send=body=>request('/v1/handset/'+a.r.id,{key:a.r.support.key,body,timeout:1000});
  if(body.action==='on')return executor.enableLocal(body,await send(body),send);
  if(executor?.local?.actor===body.actor){executor.local.accept(body);return {ok:true};}
  if(body.action==='off')return send(body);
  throw Error('Управление пультом передано другой странице');
 }
 input=new Input({send:post,changed:paint});
 const run=op=>Promise.resolve().then(op).catch(e=>{input.error=String(e.message||e);paint();});
 $('espRemoteOn').onclick=()=>run(()=>input.on());$('espRemoteOff').onclick=()=>run(()=>input.off());
 const dialog=$('espRemoteConfirm');$('espRemotePower').onclick=()=>dialog.showModal();$('espRemoteCancel').onclick=()=>dialog.close();
 function release(){run(()=>input.up());}
 for(const b of panel.querySelectorAll('[data-remote-key]')){
  const down=()=>run(()=>input.down(Number(b.dataset.remoteKey),b.dataset.remoteKey==='3'));
  b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);down();});
  b.addEventListener('pointerup',e=>{e.preventDefault();release();if(b.dataset.remoteKey==='3')dialog.close();});
  b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
  b.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();down();}});
  b.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();release();if(b.dataset.remoteKey==='3')dialog.close();}});
  b.addEventListener('contextmenu',e=>e.preventDefault());
 }
 dialog.addEventListener('cancel',release);dialog.addEventListener('close',release);
 window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 window.addEventListener('pagehide',()=>{input.armed=false;release();});
 setInterval(()=>{const r=runtime();if(r?.ready&&!executor){executor=new Executor(r);executor.onLocalRevoked=actor=>{if(input?.actor===actor){input.armed=false;input.held=null;input.error='Управление пультом передано другой странице';}};}executor?.tick();paint();},150);
 setInterval(()=>input.tick(),200);
 window.addEventListener('citybike-preferences',paint);paint();
})();
