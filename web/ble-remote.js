/* User-selected workshop remote. Receive advertisements and GATT notifications only. */
'use strict';
(() => {
  const SERVICE='60fc0630-e5a5-93b5-2d49-e23000990770',CHARACTERISTIC='70079901-30e2-492d-b593-a5e53006fc60';
  // The email's service UUID may be a Nordic little-endian byte array. Keep both;
  // only successful discovery establishes which service the peripheral exposes.
  const SERVICE_CANDIDATE='70079900-30e2-492d-b593-a5e53006fc60',SERVICES=Object.freeze([SERVICE_CANDIDATE,SERVICE]);
  const LIMIT=1000,ADV_LIMIT=64,KEY='citybike-workshop-ble-v1';
  const hex=v=>Array.from(new Uint8Array(v.buffer,v.byteOffset,v.byteLength),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  function decode(value){
    if(!ArrayBuffer.isView(value))throw Error('Нет байтов уведомления');
    const bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength),raw=hex(bytes.subarray(0,512));
    const valid=bytes.length===2&&bytes[0]>=1&&bytes[0]<=4&&bytes[1]<=1;
    return {raw_hex:raw,length:bytes.length,truncated:bytes.length>512,valid,button:valid?bytes[0]:null,pressed:valid?bytes[1]===1:null};
  }
  function advertisement(event){
    const map=data=>data?.entries?Array.from(data.entries()).slice(0,16).filter(([,v])=>ArrayBuffer.isView(v)).map(([key,value])=>({key:String(key),raw_hex:hex(new Uint8Array(value.buffer,value.byteOffset,Math.min(128,value.byteLength))),original_bytes:value.byteLength,truncated:value.byteLength>128})):[];
    return {name:typeof event.name==='string'?event.name.slice(0,248):null,rssi:Number.isFinite(event.rssi)?event.rssi:null,tx_power:Number.isFinite(event.txPower)?event.txPower:null,uuids:Array.isArray(event.uuids)?event.uuids.slice(0,32).map(String):[],manufacturer_data:map(event.manufacturerData),service_data:map(event.serviceData),scope:'browser_exposed_fields_only_not_raw_advertising_PDU',manufacturer_data_complete:false,bluetooth_mac_available:false};
  }
  const context=()=>{
    const r=typeof browserRuntime!=='undefined'?browserRuntime:null,local=!!r?.transport?.connected,s=globalThis.ByRemoteConsole?.snapshot?.(),d=local?r.device:s?.state?.device;
    return {source:local?'local_USB_reader':d?'remote_reader_last_report':'no_CAN_reader',boot:d?.boot||null,epoch:Number.isInteger(d?.epoch)?d.epoch:null,ap_mac:d?.ap_mac||null,last_device_uptime_us:d?.uptime_us??null,capture_id:local?r.recorder?.session?.id||null:null,recording:local?!!r.recorder:s?.state?.control?.recording===true,remote_report_age_seconds:local?null:s?.state?.age_seconds??null,clock_source:'browser_receive_time_not_BLE_radio_timestamp'};
  };
  class Reader {
    constructor({bluetooth=globalThis.navigator?.bluetooth,changed=()=>{},canContext=context,utc=()=>new Date().toISOString(),mono=()=>performance.now(),stepTimeoutMs=null}={}){
      this.bluetooth=bluetooth;this.changed=changed;this.canContext=canContext;this.utc=utc;this.mono=mono;this.stepTimeoutMs=stepTimeoutMs;this.phase='idle';this.stage='idle';this.lastError=null;this.availability=null;this.pendingNative=0;this.watchState='not_started';this.generation=0;this.watchGeneration=0;this.label='unknown';this.resetLog();
    }
    get busy(){return this.pendingNative>0||!!this.selectPending||!!this.connectPending||['selecting','connecting','listening','stopping'].includes(this.phase)||['starting','watching'].includes(this.watchState);}
    resetLog(){this.revision=(this.revision||0)+1;this.log={schema:1,kind:'citybike_workshop_remote_ble',started_utc:this.utc(),service_uuid:SERVICE,service_uuid_candidates:[...SERVICES],observed_service_uuid:null,characteristic_uuid:CHARACTERISTIC,device:null,events:[],advertisements:[],notification_count:0,invalid_notification_count:0,advertisement_count:0,evicted_events:0,evicted_advertisements:0,can_commands_sent:0,application_commands_sent:0,environment:{secure_context:globalThis.isSecureContext===true,user_agent:String(globalThis.navigator?.userAgent||'').slice(0,256),platform:String(globalThis.navigator?.userAgentData?.platform||globalThis.navigator?.platform||'').slice(0,64)},clock_notice:'Host receipt times; different computers are not clock-synchronized',advertising_notice:'Browser-exposed fields, not complete raw radio packets or a Bluetooth MAC address'};}
    clear(){if(this.busy)throw Error('Сначала отключите пульт');this.cleanupDevice();this.device=null;this.phase='idle';this.stage='idle';this.lastError=null;this.watchState='not_started';this.resetLog();this.notify();}
    restore(value){
      if(!value||value.schema!==1||value.kind!=='citybike_workshop_remote_ble'||value.service_uuid!==SERVICE||value.characteristic_uuid!==CHARACTERISTIC||!Array.isArray(value.events)||value.events.length>LIMIT||!Array.isArray(value.advertisements)||value.advertisements.length>ADV_LIMIT)return false;
      this.log=structuredClone(value);this.log.service_uuid_candidates=[...SERVICES];this.log.observed_service_uuid=SERVICES.includes(value.observed_service_uuid)?value.observed_service_uuid:null;this.log.restored_from_browser=true;const last=value.diagnostics?.last_error;if(last&&typeof last.stage==='string'&&typeof last.name==='string'&&typeof last.message==='string')this.lastError={stage:last.stage,name:last.name.slice(0,80),message:last.message.slice(0,240),host_utc:String(last.host_utc||'').slice(0,32)};this.notify();return true;
    }
    diagnostics(){return {schema:1,phase:this.phase,stage:this.stage,bluetooth_api:!!this.bluetooth?.requestDevice,adapter_available:this.availability,gatt_connected:this.device?.gatt?.connected===true,service_uuid:this.log.observed_service_uuid||null,device_name:this.device?.name||this.log.device?.name||null,notification_count:this.log.notification_count||0,advertisement_count:this.log.advertisement_count||0,last_error:this.lastError,updated_utc:this.utc()};}
    snapshot(){return structuredClone({...this.log,exported_utc:this.utc(),phase:this.phase,advertisement_state:this.watchState,diagnostics:this.diagnostics()});}
    async checkAvailability(){try{this.availability=typeof this.bluetooth?.getAvailability==='function'?await this.bluetooth.getAvailability():null;}catch{this.availability=null;}this.notify();return this.availability;}
    async step(stage,operation,generation){
      this.stage=stage;this.stageStarted=this.mono();this.event('connection_step',{stage,state:'started'});
      let timer;const timeout=this.stepTimeoutMs??(stage==='gatt_connect'?12000:8000);this.pendingNative++;
      const native=Promise.resolve().then(operation);
      native.then(value=>{if(stage==='gatt_connect'&&generation!==this.generation)try{value?.disconnect();}catch{}},()=>{}).finally(()=>{this.pendingNative--;this.notify();}).catch(()=>{});
      try{
        const value=await Promise.race([native,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=Error('Превышено время ожидания Bluetooth');e.name='TimeoutError';reject(e);},timeout);this.cancelStep=()=>{const e=Error('Подключение отменено');e.name='AbortError';reject(e);};})]);
        if(generation!==this.generation){const e=Error('Подключение отменено');e.name='AbortError';throw e;}
        this.event('connection_step',{stage,state:'complete',elapsed_ms:Math.max(0,Math.round(this.mono()-this.stageStarted))});return value;
      }finally{clearTimeout(timer);this.cancelStep=null;}
    }
    notify(){this.changed(this);}
    stamp(){return {host_utc:this.utc(),host_monotonic_ms:this.mono()};}
    event(type,extra={}){this.revision++;let can;try{can=this.canContext();}catch{can={source:'unavailable'};}this.log.events.push({type,...this.stamp(),device_id:this.device?.id||null,physical_action_label:this.label,can_context:can,...extra});if(this.log.events.length>LIMIT){this.log.events.shift();this.log.evicted_events++;}this.notify();}
    stopWatch(){this.watchGeneration++;this.watchAbort?.abort();this.watchAbort=null;if(this.device&&this.onAdvertisement)this.device.removeEventListener('advertisementreceived',this.onAdvertisement);this.onAdvertisement=null;if(['starting','watching'].includes(this.watchState))this.watchState='stopped';}
    watch(){
      if(typeof this.device?.watchAdvertisements!=='function'){this.watchState='unsupported';this.notify();return;}
      const generation=++this.watchGeneration,device=this.device;this.watchAbort=new AbortController();this.watchState='starting';
      this.onAdvertisement=event=>{
        if(generation!==this.watchGeneration||this.device!==device||event.device&&event.device!==device)return;
        this.revision++;this.log.advertisement_count++;this.log.advertisements.push({...this.stamp(),device_id:device.id,...advertisement(event)});
        if(this.log.advertisements.length>ADV_LIMIT){this.log.advertisements.shift();this.log.evicted_advertisements++;}this.notify();
      };
      device.addEventListener('advertisementreceived',this.onAdvertisement);
      try{this.watchPromise=Promise.resolve(device.watchAdvertisements({signal:this.watchAbort.signal})).then(()=>{if(generation===this.watchGeneration){this.watchState='watching';this.notify();}}).catch(error=>{if(generation===this.watchGeneration){this.watchState='unavailable';this.event('advertisement_unavailable',{error:String(error?.message||error).slice(0,240)});this.stopWatch();}});}
      catch(error){this.watchState='unavailable';this.event('advertisement_unavailable',{error:String(error?.message||error).slice(0,240)});this.stopWatch();}
      this.notify();
    }
    async select({all=false}={}){
      if(!this.bluetooth?.requestDevice)throw Error('В этом браузере нет Web Bluetooth. Откройте сайт в Chrome или Edge на ПК с Bluetooth.');
      if(this.busy)throw Error('Сначала отключите пульт');
      this.phase='selecting';this.stage='picker';this.lastError=null;this.selectPending=true;this.notify();const generation=++this.generation;
      try{
        const options=all?{acceptAllDevices:true,optionalServices:[...SERVICES]}:{filters:[...SERVICES.map(uuid=>({services:[uuid]})),{namePrefix:'Citybike'},{namePrefix:'CityBike'},{namePrefix:'CITYBIKE'}],optionalServices:[...SERVICES]};
        const device=await this.bluetooth.requestDevice(options);
        if(generation!==this.generation)return;
        if(this.log.device?.browser_device_id&&this.log.device.browser_device_id!==device.id&&this.log.events.length)throw Error('Для другого пульта сначала сохраните данные и начните новую запись');
        this.device=device;this.log.device={browser_device_id:device.id,name:device.name||null,id_is_not_Bluetooth_MAC:true};this.phase='selected';this.stage='selected';this.event('device_selected',{selection_filter:all?'all_devices':'known_service_or_Citybike_name'});this.watch();return device;
      }catch(error){if(generation===this.generation){this.phase=this.device?'selected':'idle';this.notify();}throw error;}finally{this.selectPending=false;this.notify();}
    }
    async connect(){
      if(this.busy&&this.phase!=='selected')throw Error('Пульт занят');
      if(!this.device?.gatt)throw Error('Сначала найдите и выберите пульт');
      this.stopWatch();this.phase='connecting';this.connectPending=true;this.notify();const generation=++this.generation,device=this.device;
      const current=()=>generation===this.generation&&device===this.device;
      this.lastError=null;
      this.log.observed_service_uuid=null;
      this.onDisconnected=()=>{if(!current())return;this.lastError={name:'GATTDisconnected',message:'Соединение Bluetooth прервано',stage:this.stage,host_utc:this.utc()};this.generation++;this.removeNotificationListener();device.removeEventListener('gattserverdisconnected',this.onDisconnected);this.onDisconnected=null;this.phase='disconnected';this.event('gatt_disconnected',{stage:this.stage,error_name:'GATTDisconnected'});};
      device.addEventListener('gattserverdisconnected',this.onDisconnected);
      try{
        const server=await this.step('gatt_connect',()=>device.gatt.connect(),generation);
        const service=await this.step('service_discovery',async()=>{
          for(let i=0;i<SERVICES.length;i++){
            const uuid=SERVICES[i];
            if(!current())throw Object.assign(Error('Подключение отменено'),{name:'AbortError'});
            this.event('service_lookup',{service_uuid:uuid,state:'started'});
            let found;
            try{found=await server.getPrimaryService(uuid);}
            catch(error){
              if(!current())throw error;
              this.event('service_lookup',{service_uuid:uuid,state:'failed',error_name:String(error?.name||'Error').slice(0,80)});
              if(error?.name!=='NotFoundError'||i===SERVICES.length-1)throw error;
              continue;
            }
            if(!current())throw Object.assign(Error('Подключение отменено'),{name:'AbortError'});
            if(found.uuid&&found.uuid.toLowerCase()!==uuid)throw Error('Неверный сервис пульта');
            this.log.observed_service_uuid=uuid;this.event('service_lookup',{service_uuid:uuid,state:'complete'});return found;
          }
        },generation);
        const characteristic=await this.step('characteristic_discovery',()=>service.getCharacteristic(CHARACTERISTIC),generation);
        if(characteristic.uuid?.toLowerCase()!==CHARACTERISTIC)throw Error('Неверная характеристика пульта');
        if(!characteristic.properties?.notify&&!characteristic.properties?.indicate)throw Error('У характеристики нет уведомлений');
        this.characteristic=characteristic;
        this.onNotification=event=>{if(!current()||event.target!==this.characteristic)return;const value=decode(event.target.value);this.log.notification_count++;if(!value.valid)this.log.invalid_notification_count++;this.event('notification',value);};
        characteristic.addEventListener('characteristicvaluechanged',this.onNotification);
        await this.step('subscribe',()=>characteristic.startNotifications(),generation);
        this.phase='listening';this.stage='listening';this.event('notifications_started',{properties:{read:!!characteristic.properties.read,notify:!!characteristic.properties.notify,indicate:!!characteristic.properties.indicate,write:!!characteristic.properties.write,writeWithoutResponse:!!characteristic.properties.writeWithoutResponse}});
      }catch(error){
        if(current()){this.lastError={stage:this.stage,name:String(error?.name||'Error').slice(0,80),message:String(error?.message||error).slice(0,240),host_utc:this.utc()};this.generation++;this.cleanupDevice();this.phase='disconnected';this.event('connection_error',{stage:this.stage,error_name:this.lastError.name,error:this.lastError.message});}throw error;
      }finally{this.connectPending=false;this.notify();}
    }
    removeNotificationListener(){if(this.characteristic&&this.onNotification)this.characteristic.removeEventListener('characteristicvaluechanged',this.onNotification);this.onNotification=null;this.characteristic=null;}
    cleanupDevice(){this.stopWatch();this.removeNotificationListener();if(this.device&&this.onDisconnected)this.device.removeEventListener('gattserverdisconnected',this.onDisconnected);this.onDisconnected=null;this.device?.gatt?.disconnect();}
    async disconnect(){this.generation++;this.cancelStep?.();this.phase='stopping';this.notify();this.cleanupDevice();this.phase='disconnected';this.stage='idle';this.event('disconnected_by_user');}
  }
  let activeReader=null,saveFailed=false;
  globalThis.ByBleRemote={Reader,decode,advertisement,SERVICE,SERVICE_CANDIDATE,SERVICES,CHARACTERISTIC,LIMIT,ADV_LIMIT,get busy(){return !!activeReader?.busy||saveFailed;},get reader(){return activeReader;},diagnostics(){return activeReader?.diagnostics()||null;}};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),panel=$('bleRemotePanel');if(!panel)return;
  const t=value=>globalThis.ByI18n?.t?.(value)||value;
  const stageName=stage=>({idle:'Ожидание',picker:'Выбор устройства',selected:'Устройство выбрано',gatt_connect:'Соединение BLE',service_discovery:'Поиск сервиса пульта',characteristic_discovery:'Поиск характеристики кнопок',subscribe:'Подписка на кнопки',listening:'Чтение кнопок'})[stage]||'Этап неизвестен';
  let restoring=false,uploading=false,lastNotice='',persisted=true;
  const reader=activeReader=new Reader({changed:()=>{paint();if(restoring)return;try{const value=JSON.stringify(reader.snapshot());if(value.length>2*1024*1024)throw Error('BLE log too large');localStorage.setItem(KEY,value);persisted=true;saveFailed=false;}catch{persisted=false;saveFailed=true;$('bleRemoteStorage').textContent=t('Не удалось сохранить в браузере. Скачайте или отправьте запись перед обновлением страницы.');}}});
  try{const saved=localStorage.getItem(KEY);if(saved&&saved.length<=2*1024*1024){restoring=true;reader.restore(JSON.parse(saved));}}catch{}finally{restoring=false;}
  function paint(){
    const supported=!!navigator.bluetooth?.requestDevice,has=reader.log.events.length>0||reader.log.advertisements.length>0;
    const phases={idle:'Пульт не выбран',selected:'Пульт выбран',selecting:'Выберите пульт в окне браузера',connecting:'Подключение к пульту…',listening:'Принимаю кнопки пульта',stopping:'Отключение…',disconnected:'Пульт отключён'};
    $('bleRemoteStatus').textContent=t(phases[reader.phase]||'Пульт не выбран');
    $('bleRemoteStage').textContent=t('Этап:')+' '+t(stageName(reader.stage));
    $('bleRemoteAvailability').textContent=t(reader.availability===true?'Браузер сообщает: Bluetooth доступен':reader.availability===false?'Браузер сообщает: Bluetooth недоступен':'Доступность адаптера пока не подтверждена');
    $('bleRemoteError').hidden=!reader.lastError;
    $('bleRemoteError').textContent=reader.lastError?t(stageName(reader.lastError.stage))+' · '+reader.lastError.name+' · '+t(reader.lastError.message):'';
    $('bleRemoteSupport').textContent=t(supported?'Bluetooth этого компьютера или телефона. CAN-ридер не требуется.':'В этом браузере нет Web Bluetooth. Откройте сайт в Chrome или Edge на ПК с Bluetooth.');
    $('bleRemoteChoose').disabled=!supported||reader.busy||uploading;
    $('bleRemoteConnect').disabled=!reader.device||['selecting','connecting','listening','stopping'].includes(reader.phase)||reader.pendingNative>0||uploading;
    $('bleRemoteDisconnect').disabled=!reader.busy||uploading;
    $('bleRemoteDownload').disabled=!has||uploading;$('bleRemoteUpload').disabled=!has||uploading||!globalThis.ByFiles?.FileUploader;
    $('bleRemoteClear').disabled=reader.busy||uploading;
    $('bleRemoteDevice').textContent=reader.log.device?.name||(reader.log.device?t('Устройство без имени'):'—');
    $('bleRemoteCount').textContent=String(reader.log.notification_count||0);$('bleRemoteInvalid').textContent=String(reader.log.invalid_notification_count||0);
    const states={not_started:'Реклама ещё не запрашивалась',starting:'Ожидаю доступную рекламу…',watching:'Наблюдение рекламы включено',stopped:'Наблюдение рекламы остановлено',unsupported:'Этот браузер не предоставляет чтение рекламы. Уведомления кнопок можно читать отдельно.',unavailable:'Реклама недоступна в этом браузере. Уведомления кнопок можно читать отдельно.'};
    $('bleRemoteAdvertisementStatus').textContent=t(states[reader.watchState]||states.not_started)+' · '+(reader.log.advertisement_count||0);
    $('bleRemoteAdvertisement').textContent=JSON.stringify(reader.log.advertisements.at(-1)||{documented_service_uuid:SERVICE,service_uuid_candidates:SERVICES,observed_service_uuid:reader.log.observed_service_uuid||null,characteristic_uuid:CHARACTERISTIC,source:'GATT_discovery_status_not_observed_advertisement'},null,2);
    $('bleRemoteNotice').textContent=t(lastNotice);
    $('bleRemoteStorage').textContent=saveFailed?t('Не удалось сохранить в браузере. Скачайте или отправьте запись перед обновлением страницы.'):t('Последняя BLE-запись сохраняется в этом браузере.')+' '+t('Вытеснено событий:')+' '+(reader.log.evicted_events||0)+' / '+(reader.log.evicted_advertisements||0);
    const list=$('bleRemoteEvents');list.replaceChildren();
    const steps=$('bleRemoteConnectionEvents');steps.replaceChildren();
    for(const row of reader.log.events.filter(e=>['device_selected','connection_step','connection_error','gatt_disconnected','notifications_started','disconnected_by_user'].includes(e.type)).slice(-8).reverse()){
      const item=document.createElement('li'),labels={device_selected:'Устройство выбрано',connection_step:stageName(row.stage),connection_error:'Ошибка подключения',gatt_disconnected:'Соединение Bluetooth прервано',notifications_started:'Чтение кнопок',disconnected_by_user:'Пульт отключён'};
      item.textContent=String(row.host_utc||'').slice(11,23)+' UTC · '+t(labels[row.type])+(row.state?' · '+t(row.state==='complete'?'Готово':'Начато'):'')+(row.error_name?' · '+row.error_name:'');steps.append(item);
    }
    for(const row of reader.log.events.filter(e=>e.type==='notification').slice(-20).reverse()){
      const item=document.createElement('li'),code=document.createElement('code'),label=document.createElement('span');
      code.textContent=String(row.raw_hex||'');code.dataset.i18nSkip='';
      label.textContent=row.valid?t('Кнопка')+' '+row.button+' · '+t(row.pressed?'нажата':'отпущена'):t('Неизвестный формат уведомления');
      const labels={unknown:'Без подписи',unlock:'Unlock',walk_assist:'Walk Assist',power_off:'Power off',other:'Другое действие'};
      item.append(code,label,document.createTextNode(' · '+t(labels[row.physical_action_label]||'Без подписи')+' · '+String(row.host_utc||'').slice(11,23)+' UTC'));list.append(item);
    }
  }
  const run=async operation=>{if(globalThis.ByAutoUpdate?.holding)return;lastNotice='';try{await operation();}catch(error){lastNotice=error?.name==='NotFoundError'&&reader.stage==='picker'?'Пульт не выбран. Включите его и проверьте, что он доступен для подключения.':String(error?.message||error);}paint();};
  $('bleRemoteChoose').addEventListener('click',()=>run(()=>reader.select({all:$('bleRemoteAllDevices').checked})));
  $('bleRemoteConnect').addEventListener('click',()=>run(()=>reader.connect()));
  $('bleRemoteDisconnect').addEventListener('click',()=>run(()=>reader.disconnect()));
  $('bleRemoteAction').addEventListener('change',event=>{reader.label=event.target.value;});
  function file(){return new File([JSON.stringify(reader.snapshot(),null,2)+'\n'],'CityBike-BLE-remote-'+Date.now()+'.json',{type:'application/json'});}
  $('bleRemoteDownload').addEventListener('click',()=>{const value=file(),url=URL.createObjectURL(value),a=document.createElement('a');a.href=url;a.download=value.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);persisted=true;saveFailed=false;paint();});
  $('bleRemoteUpload').addEventListener('click',()=>run(async()=>{uploading=true;paint();const revision=reader.revision;try{const receipt=await new ByFiles.FileUploader().send(file());lastNotice='BLE-запись получена сервером. Код: '+receipt.id;if(reader.revision===revision){persisted=true;saveFailed=false;}}finally{uploading=false;paint();}}));
  $('bleRemoteClear').addEventListener('click',()=>{if(!confirm(t('Начать новую BLE-запись? Сначала скачайте или отправьте текущую.')))return;run(()=>reader.clear());});
  window.addEventListener('citybike-preferences',paint);
  window.addEventListener('beforeunload',event=>{if(reader.busy||!persisted){event.preventDefault();event.returnValue='BLE';}});
  paint();reader.checkAvailability();
})();
