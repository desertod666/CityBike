/* Local BLE controls. Browser persistence and downloads never use ESP heap. */
'use strict';
(() => {
 const tr=s=>globalThis.ByI18n?.t(s)||s,stamp=()=>new Date().toISOString();
 class ActionLog {
  constructor(clock=()=>performance.now()){this.clock=clock;this.ring=[];this.rows=[];this.active=false;this.dropped=0;this.until=0;this.dirty=false;this.error='';}
  async database(){if(!this.db)this.db=await new Promise((resolve,reject)=>{const request=indexedDB.open('citybike-offline-actions-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('recordings');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return this.db;}
  async restore(){const db=await this.database();const data=await new Promise((resolve,reject)=>{const r=db.transaction('recordings').objectStore('recordings').get('latest');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(!this.active&&!this.rows.length&&Array.isArray(data?.rows)&&data.rows.length<=8192){this.rows=data.rows;this.dropped=data.dropped||0;}}
  add(row){if(this.rows.length<8192)this.rows.push(row);else this.dropped++;this.dirty=true;}
  feed(frame){const at=this.clock();this.ring.push({at,frame});while(this.ring.length>512||this.ring[0]?.at<at-3000)this.ring.shift();if(this.active)this.add(frame);}
  mark(action,data={}){this.add({type:'remote_action',action,host_utc:stamp(),...data});}
  async begin(button,boot){if(!this.active){this.rows=[{type:'metadata',kind:'offline_ble_can_window',boot,pre_trigger_ms:3000,button,timestamps:'CAN t_us is native uptime; action host_utc is browser time; ack_t_us is native command completion, not bike execution'} ,...this.ring.filter(x=>this.clock()-x.at<=3000).map(x=>x.frame)];this.dropped=0;this.active=true;}this.until=Infinity;this.mark('press_requested',{button,boot});await this.flush();}
  released(button){if(this.active)this.until=this.clock()+(button===3?30000:3000);}
  async flush(){if(this.writing)await this.writing;if(!this.dirty)return;this.dirty=false;this.writing=(async()=>{const db=await this.database();await new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readwrite');tx.objectStore('recordings').put({rows:this.rows,dropped:this.dropped},'latest');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('CAN log storage failed'));});})();try{await this.writing;}catch(e){this.error=String(e.message||e);this.dirty=true;throw e;}finally{this.writing=null;}}
  async tick(){if(this.active&&this.clock()>=this.until){this.mark('window_end');this.active=false;}await this.flush();}
  download(){const data=this.rows.concat({type:'summary',dropped_rows:this.dropped,incomplete:this.dropped>0,active:this.active});return new Blob([data.map(row=>JSON.stringify(row)).join('\n')+'\n'],{type:'application/x-ndjson'});}
 }
 class Remote {
  constructor(reader,{log=new ActionLog(reader.clock)}={}){this.r=reader;this.log=log;this.seq=0;this.armed=false;this.held=null;this.error='';this.lastAlive=-Infinity;this.busy=false;this.generation=0;}
  supported(){return this.r.device.capabilities?.includes('ble_remote_wifi_v1');}
  async call(action,extra={},valid=()=>true){const boot=this.r.device.boot,session=this.r.session,created=this.r.clock();return this.r.serial(async()=>{
   if(!valid()||this.r.device.boot!==boot||this.r.session!==session||(['down','keep','alive'].includes(action)&&this.r.clock()-created>650))return {skipped:true};
   return this.r.rawRequest('/api/remote',{action,boot,seq:++this.seq,...extra},{timeout:800});
  });}
  async on(){if(this.enabling||this.armed)return;this.enabling=true;const generation=this.generation,valid=()=>generation===this.generation&&!this.r.closed&&!globalThis.document?.hidden;
   try{await this.r.refresh();if(!valid())return;if(!this.supported())throw Error('Обновите прошивку для пульта по Wi-Fi');if(this.r.device.can!=='running')await this.r.api('/api/live/start');if(!valid()){this.r.release();return;}
    const result=await this.call('on',{},valid);if(result.skipped)return;await this.r.refresh();if(!valid()){this.r.release();return;}if(!this.r.device.ble_remote?.enabled)throw Error('Пульт не включился');this.armed=true;this.lastAlive=this.r.clock();this.error='';
   }finally{this.enabling=false;}}
  async off(){this.generation++;const h=this.held;this.held=null;const was=this.armed;this.armed=false;if(h){this.log.mark('release_requested',{button:h.button});this.log.released(h.button);}if(was||this.enabling)await this.call('off');await this.r.refresh();}
  async down(button,confirmed=false){
   const ble=this.r.device.ble_remote;if(!this.armed||this.held||!ble?.connected||!ble?.subscribed||this.r.device.can!=='running')throw Error('Дождитесь подключения велосипеда');
   if(button===3&&!confirmed)throw Error('Подтвердите выключение');
   const h=this.held={button,hold:this.r.newToken().slice(0,8),at:this.r.clock(),sent:false};
   try{await this.log.begin(button,this.r.device.boot);const result=await this.call('down',{hold:h.hold,button,...(button===3?{confirmed:true}:{})},()=>this.armed&&this.held===h&&this.r.clock()-h.at<650);
    if(result.skipped){if(this.held===h)this.held=null;this.log.released(button);throw Error('Удержание прервано. Отпустите кнопку и нажмите снова.');}else{h.sent=true;this.log.mark('press_ack',{button,ack_t_us:result.t_us,boot:this.r.device.boot});}
   }catch(e){if(this.held===h)this.held=null;this.log.released(button);throw e;}
  }
  async up(){const h=this.held;this.held=null;if(!h)return;this.log.mark('release_requested',{button:h.button});this.log.released(h.button);await this.call('up',{hold:h.hold});}
  revoke(){this.generation++;const h=this.held;this.armed=false;this.held=null;if(h){this.log.mark('release_requested',{button:h.button,reason:'controller_released'});this.log.released(h.button);}}
  async tick(){if(this.busy)return;this.busy=true;try{
   if(this.armed){const b=this.r.device.ble_remote;
    if(!this.r.transport.connected||this.r.device.can!=='running'||!b?.enabled||b.transport!=='wifi'||b.session!==this.r.session.slice(0,16)){await this.off();throw Error('Пульт остановлен. Включите его снова.');}
    if(this.held){const h=this.held;if(this.r.clock()-h.at>=30000||(h.sent&&b.button===0&&this.r.clock()-h.at>1300)){await this.up();this.error='Удержание прервано. Отпустите кнопку и нажмите снова.';}
     else if(h.sent)await this.call('keep',{hold:h.hold},()=>this.armed&&this.held===h);
    }
    if(this.armed&&this.r.clock()-this.lastAlive>=500){const result=await this.call('alive',{},()=>this.armed);if(!result.skipped)this.lastAlive=this.r.clock();}
   }
   this.log.tick().catch(e=>{this.error=String(e.message||e);if(this.armed)this.off().catch(()=>{});});
  }catch(e){this.error=String(e.message||e);this.r.release();}finally{this.busy=false;}}
 }
 function mount(r,paint){
  const get=id=>document.getElementById(id),remote=new Remote(r);r.remote=remote;remote.log.restore().catch(e=>{remote.error=String(e.message||e);paint();});
  const run=f=>Promise.resolve().then(f).catch(e=>{remote.error=String(e.message||e);}).finally(paint);
  get('offlineRemoteOn').onclick=()=>run(()=>remote.on());get('offlineRemoteOff').onclick=()=>run(()=>remote.off());
  const dialog=get('offlineRemoteConfirm');get('offlineRemotePower').onclick=()=>dialog.showModal();get('offlineRemoteCancel').onclick=()=>dialog.close();
  for(const button of document.querySelectorAll('[data-offline-key]')){
   const down=()=>run(()=>remote.down(Number(button.dataset.offlineKey),button.id==='offlineRemoteConfirmed'));
   button.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();button.setPointerCapture(e.pointerId);down();};
   button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>run(()=>remote.up());
   button.onkeydown=e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();down();}};
   button.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();run(()=>remote.up());}};
   button.oncontextmenu=e=>e.preventDefault();
  }
  const release=()=>run(()=>remote.up());addEventListener('pointerup',release);addEventListener('pointercancel',release);addEventListener('blur',release);dialog.addEventListener('close',release);
  get('offlineRemoteDownload').onclick=()=>run(async()=>{await remote.log.flush();const url=URL.createObjectURL(remote.log.download()),a=document.createElement('a');a.href=url;a.download='CityBike-BLE-CAN-'+Date.now()+'.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const timer=setInterval(()=>remote.tick().finally(paint),200);addEventListener('pagehide',()=>{clearInterval(timer);remote.revoke();});return remote;
 }
 function paint(r){const get=id=>document.getElementById(id),remote=r.remote,b=r.device.ble_remote||{},valid=r.transport.connected&&remote?.supported();
  get('offlineRemoteOn').disabled=!valid||!!remote.armed||!!remote.enabling;get('offlineRemoteOff').disabled=!valid||!remote?.armed;
  const can=valid&&remote.armed&&b.connected&&b.subscribed&&r.device.can==='running';
  for(const button of document.querySelectorAll('[data-offline-key],#offlineRemotePower')){button.disabled=!can||(!!remote.held&&Number(button.dataset.offlineKey)!==remote.held.button);button.setAttribute('aria-pressed',String(!!remote.held&&Number(button.dataset.offlineKey)===remote.held.button));}
  get('offlineRemoteStatus').textContent=tr(!valid?'Пульт недоступен':!b.enabled?'Пульт выключен':b.subscribed?'BLE подключён · кнопки готовы':b.connected?'BLE подключён · ожидаю подписку':'Пульт включён · ожидаю велосипед');
  get('offlineRemoteError').textContent=tr(remote?.error||remote?.log.error||'');get('offlineRemoteDownload').disabled=!remote?.log.rows.length;
  get('offlineRemoteLog').textContent=tr(remote?.log.active?'CAN-запись: записываю действие':'CAN-лог сохраняется на этом устройстве')+(remote?.log.dropped?' · '+tr('Неполная запись')+': '+remote.log.dropped:'');
 }
 globalThis.ByOfflineRemote={ActionLog,Remote,mount,paint};if(typeof module!=='undefined')module.exports=globalThis.ByOfflineRemote;
})();
