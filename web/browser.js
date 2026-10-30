'use strict';
(() => {
  const RATES=[250000],SERVER='https://134.98.158.132:18443';
  const now=()=>new Date().toISOString();
  function vehicleContext(value,selected=false){
    const empty={bike_id:null,vehicle_variant:'unknown',pcb_revision:'unknown',battery_brand:'unknown',battery_swap_same_bicycle:null,session_active:null,source:'unknown',selected_utc:null};
    if(typeof value==='string'){
      if(!['phylion_old','spard_new','unknown'].includes(value))throw Error('Invalid vehicle context');
      // Legacy choices identify a battery brand; they never establish bike age.
      return {...empty,battery_brand:value==='spard_new'?'Spard':value==='phylion_old'?'Phylion':'unknown',source:selected?'owner_selected_context':'legacy_saved_selection',selected_utc:selected?now():null};
    }
    if(value==null)return empty;
    if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(empty,k)))throw Error('Invalid vehicle context');
    const v={...empty,...value};
    if(!['unknown','old_bicycle','new_bicycle'].includes(v.vehicle_variant)||!['unknown','Spard','Phylion'].includes(v.battery_brand)||
       typeof v.pcb_revision!=='string'||v.pcb_revision.length>80||v.bike_id!==null&&(typeof v.bike_id!=='string'||!v.bike_id.length||v.bike_id.length>80)||
       ![null,true,false].includes(v.battery_swap_same_bicycle)||![null,true,false].includes(v.session_active)||
       !['unknown','owner_selected_context','legacy_saved_selection'].includes(v.source)||v.selected_utc!==null&&(typeof v.selected_utc!=='string'||!Number.isFinite(Date.parse(v.selected_utc))))throw Error('Invalid vehicle context');
    return {...v,...(selected?{source:'owner_selected_context',selected_utc:now()}:{})};
  }
  class Runtime {
    constructor(initial,schema,profiles){this.initial=initial;this.schema=schema;this.profiles=profiles;this.wifi=initial.connection?.transport==='wifi';this.device=this.wifi?initial.device:{};this.preview=[];this.error='';this.lastSeq=null;this.boot=null;this.id=ByStore.uuid();this.writes=Promise.resolve();this.scan={active:false,results:[],selected:null};this.sharing={};this.ready=false;this.ending=false;this.operation=false;this.uploadError='';this.version=initial.app?.version||'0.4.8';this.webBuild='20261030-voltmeter1';this.durationMs=0;this.deadlineMono=null;this.fixedTest=false;this.liveViewing=false;this.liveRemote=false;this.liveData=globalThis.ByCanLive?new ByCanLive.Cache(schema):null;this.batteryQuery=globalThis.ByBatteryQuery?new ByBatteryQuery.Query(this):null;this.readerSelftest=globalThis.ByReaderSelftest?new ByReaderSelftest.Test(this):null;}
    async init({autoConnect=true}={}){this.store=await new ByStore.Store().open();await this.store.recover();this.settings=await this.store.settings();try{this.vehicleContext=vehicleContext((await this.store.get('settings','vehicleContext'))?.value);}catch{this.vehicleContext=vehicleContext();}try{this.updateResume=JSON.parse(globalThis.sessionStorage?.getItem('citybike-update-live-resume')||'null');globalThis.sessionStorage?.removeItem('citybike-update-live-resume');}catch{this.updateResume=null;}this.monitor=new ByMonitor.Monitor(this.store,SERVER,this.id);this.monitor.enable(this.settings.monitor_enabled===true);this.credential=(await this.store.get('settings','credential'))?.value;if(new URLSearchParams(location.hash.slice(1)).has('pair'))history.replaceState(null,'',location.pathname+location.search);const events={wire:e=>this.recordEvents([e]),event:e=>{this.monitor.capture(e);return this.event(e);},message:m=>{this.monitor.capture({type:'device',host_utc:now(),device:m});return this.message(m);},lost:e=>{this.monitor.capture({type:'connection_lost',host_utc:now(),message:String(e.message||e)});return this.lost(e);}};this.transport=this.wifi?new ByTransport.WiFiTransport(events):new ByTransport.SerialTransport(events);this.tuner=new ByTuning.Tuner(this);this.support=new BySupport.Support(this);this.monitor.support=this.support;await this.support.refreshStock?.();if(this.wifi)await this.transport.connect();this.autoConnect=!this.wifi&&autoConnect&&(await this.store.get('settings','usbAutoConnect'))?.value!==false;this.ready=true;this.interval=setInterval(()=>this.tick().catch(e=>{this.error=String(e.message||e);}),1000);this.uploadTimer=setInterval(()=>this.upload().catch(e=>{this.uploadError=String(e.message||e);}),4000);this.monitorTimer=setInterval(()=>{const interval=this.liveData&&this.device.can==='running'?1000:5000;const at=performance.now();if(this.monitorAttempt!==undefined&&at-this.monitorAttempt<interval)return;this.monitorAttempt=at;this.monitor.flush(this.wifi?'browser-wifi':'browser-usb',!!this.transport.connected).catch(()=>{});},1000);window.addEventListener('pagehide',()=>{this.transport.release();if(this.recorder)this.recorder.flush().catch(()=>{});});window.addEventListener('beforeunload',e=>{if(this.recorder||this.flashBusy||this.tuner?.active){e.preventDefault();e.returnValue='Запись или обновление ещё идёт';}});return this;}
    canLiveSnapshot(){return this.liveData?.snapshot(this.device,!!this.transport?.connected)||null;}
    async fixedReceive(current){
      if(current.can!=='stopped')throw Error('Сначала остановите CAN');
      if(current.rx_sampling_250k==='TRIPLE'){this.device=current;return current;}
      if(!current.sampling_profiles?.includes('TRIPLE'))throw Error('Прошивка не поддерживает фиксированный TRIPLE');
      const result=await this.transport.call('SAMPLE TRIPLE');
      if(result.boot!==current.boot||result.can!=='stopped'||result.rx_sampling_250k!=='TRIPLE')throw Error('TRIPLE не подтверждён; приём не запущен');
      this.device=result;return result;
    }
    async liveStart({beforeStart,remote=false}={}){
      this.checkTuning();
      if(!this.transport.connected||this.transport.uncertain||this.recorder||this.operation||this.ending||this.flashBusy||this.tuner?.active||this.scan.active||globalThis.BySpardProbe?.active)throw Error('Завершите текущую операцию и подключите ESP32');
      this.operation=true;
      try{
        const current=await this.transport.poll();this.device=current;
        if(current.can==='running'){if(this.liveViewing)return {ok:true};throw Error('Приём уже запущен');}
        if(current.rx_check?.state==='running'||current.ctx_guard?.policy!=='fixed_recessive'||current.ctx_guard?.valid!==true||current.ctx_guard?.level!==1||current.twai_tx_gpio!==10)throw Error('Пассивный приём ESP32 не подтверждён');
        await beforeStart?.();
        await this.fixedReceive(current);
        const started=await this.transport.call('START 250000');this.device=started;
        if(started.boot!==current.boot||started.can!=='running')throw Error('Запуск просмотра не подтверждён');
        this.liveViewing=true;this.liveRemote=remote;this.monitor?.capture({type:'device',host_utc:now(),device:this.device});return {ok:true};
      }finally{this.operation=false;}
    }
    async liveStop(){
      if(this.recorder||this.tuner?.active||this.scan.active||this.operation||this.ending||this.flashBusy)throw Error('Идёт отдельный тест; используйте его остановку');
      if(!this.liveViewing)throw Error('Живой просмотр не запущен');
      this.operation=true;
      try{const current=this.device,stopped=await this.transport.call('STOP');if(stopped.boot!==current.boot||stopped.can!=='stopped')throw Error('Остановка просмотра не подтверждена');await this.transport.drain(stopped.received||0);this.device=stopped;this.liveViewing=false;this.liveRemote=false;this.monitor?.capture({type:'device',host_utc:now(),device:this.device});return {ok:true};}
      finally{this.operation=false;}
    }
    async resumeLiveAfterUpdate(){
      const resume=this.updateResume;if(!resume)return;
      if(!Number.isFinite(resume.expires_at_ms)||Date.now()>resume.expires_at_ms||resume.expires_at_ms>Date.now()+120000||typeof resume.remote!=='boolean'){this.updateResume=null;return;}
      if(!this.transport?.connected)return;
      this.updateResume=null;
      if(this.transport.uncertain||this.device.boot!==resume.boot||this.device.ap_mac!==resume.mac||
         resume.remote&&(this.settings.remote_support_enabled!==true||this.settings.manual_mode!==false||this.settings.monitor_enabled!==true))return;
      if(this.recorder||this.operation||this.ending||this.flashBusy||this.scan.active||this.tuner?.active||this.device.ble_remote?.enabled)return;
      if(this.device.can==='running'){this.liveViewing=true;this.liveRemote=resume.remote;return;}
      await this.liveStart({remote:resume.remote});
    }
    async setVehicle(value){
      this.checkTuning();if(this.recorder||this.scan.active||this.operation||this.ending)throw Error('Контекст меняется перед записью');
      const context=vehicleContext(value,true);this.vehicleContext=context;await this.store.setting('vehicleContext',context);
    }
    context(){
      const v=vehicleContext(this.vehicleContext);
      return {recorder_version:2,vehicle_context_version:2,transport:this.wifi?'wifi':'webserial',ssid:this.device.ssid,
        profile:this.profiles?.profiles.find(p=>p.id===this.settings.profile),sym_compatibility:'unconfirmed',standard_display:false,
        vehicle_variant:v.vehicle_variant,bike_id:v.bike_id,pcb_revision:v.pcb_revision,battery_swap_same_bicycle:v.battery_swap_same_bicycle,
        rx_sampling_250k:this.device.rx_sampling_250k,...(this.tuner?.active?{sampling_sweep:this.tuner.context()}:{}),
        battery_brand:v.battery_brand,vehicle_source:v.source,vehicle_selected_utc:v.selected_utc,
        bicycle_session:{pcb_present:null,owner_reported_active:v.session_active,owner_reported_mode:'unknown',source:v.source}};
    }

    recordEvents(events){if(!this.recorder)return Promise.resolve();const recorder=this.recorder;const job=this.writes.then(()=>recorder.write(events));this.writes=job.catch(()=>{});return job.catch(e=>{recorder.session.storage_errors=(recorder.session.storage_errors||0)+1;recorder.session.unflushed_tail_possible=true;this.error='Хранилище: '+e.message;this.finish('storage_error').catch(()=>{});throw e;});}
    async message(message){globalThis.ByEspRemote?.feed(message);this.readerSelftest?.feed(message);this.batteryQuery?.feed(message);if(message.type==='status'){if(this.recorder&&this.boot&&message.boot!==this.boot)this.finish('device_reset').catch(()=>{});this.device=message;this.error='';}if(message.type==='frame'){this.liveData?.ingest(message);if(this.transport?.connected&&this.device.can==='running'&&!this.recorder&&!this.tuner?.active&&!this.operation&&!this.scan.active)this.liveViewing=true;if(this.boot!==message.boot){this.preview=[];this.lastSeq=null;this.boot=message.boot;}let decoded;try{decoded=this.schema?BafangDecoder.decode(message,this.schema):{status:'decoder_error'};if(!decoded||!['decoded_unconfirmed','unknown','invalid','rtr','decoder_error'].includes(decoded.status))throw Error('Invalid decoder result');}catch(e){decoded={status:'decoder_error',reason:String(e)};}this.preview.push({...message,decoded});if(this.preview.length>1024)this.preview.splice(0,this.preview.length-1024);if(this.recorder){const s=this.recorder.session;s.frames++;s.id_counts??={};s.id_counts[message.id]=(s.id_counts[message.id]||0)+1;if(decoded.status==='decoder_error')s.decode_errors++;if(this.lastSeq!==null&&message.seq>this.lastSeq+1)s.gaps+=message.seq-this.lastSeq-1;}this.lastSeq=message.seq;await this.recordEvents([{type:'device',host_utc:now(),device:message,decode_status:decoded.status}]);}else await this.recordEvents([{type:'device',host_utc:now(),device:message}]);}
    async event(event){await this.recordEvents([event]);if(event.type==='device_reset'&&this.recorder)this.finish('device_reset').catch(()=>{});}
    lost(error){this.liveViewing=false;this.liveRemote=false;this.error=String(error?.message||error);if(this.recorder)this.finish('transport_disconnected').catch(()=>{});}
    async tick(){if(this.ticking||this.flashBusy||this.updateHold)return;this.ticking=true;try{const settings=await this.store.settings();this.settings=settings;this.monitor.enable(settings.monitor_enabled===true);await this.support.refreshStock?.();if(!settings.enabled)this.uploadAbort?.abort();if(this.autoConnect&&!this.support.stockRemoteActive&&!globalThis.BySpardProbe?.active&&!this.transport.connected&&!this.ending&&!this.finishPromise&&!this.scan.active&&!this.operation){const restored=await this.transport.restore();if(restored){this.device=restored;this.error='';await this.reportStatus('usb_restored');}}if(this.liveViewing&&this.liveRemote&&(settings.remote_support_enabled!==true||settings.manual_mode!==false||settings.monitor_enabled!==true))await this.liveStop();if(this.transport.connected&&!this.support.stockRemoteActive){try{await this.transport.poll();this.device=this.transport.state;await this.resumeLiveAfterUpdate();this.monitor.capture({type:'device',host_utc:now(),device:this.device});this.observeRx();if(this.wifi)await this.recordEvents([{type:'device',host_utc:now(),device:this.device}]);}catch(e){this.lost(e);}}if(this.recorder){try{await this.store.claim('recorder-owner',this.id);}catch(e){await this.finish('another_tab');}if(this.recorder){const activeRecorder=this.recorder;await this.writes;await activeRecorder.flush();if(this.recorder!==activeRecorder)return;if(this.deadline&&this.remainingMs()===0)await this.finish('timer');else if(this.device.can==='stopped'&&!this.scan.active&&!this.ending&&Date.now()-this.started>1200)await this.finish('external_stop');}}this.support.observe();const sessions=await this.store.all('sessions');this.sessions=sessions.sort((a,b)=>b.started.localeCompare(a.started));this.sharing={...settings,configured:true,endpoint:SERVER,pending:sessions.filter(s=>!s.sent&&s.status!=='recording').length,sent:sessions.filter(s=>s.sent).length,sent_bytes:sessions.filter(s=>s.sent).reduce((n,s)=>n+(s.archive?.size||0),0),active:!!this.uploading,error:this.uploadError};if(navigator.storage?.estimate){const usage=await navigator.storage.estimate();this.storage={usage:usage.usage,quota:usage.quota};}}finally{this.ticking=false;}}
    snapshot(){return {device:this.device,connection:{transport:this.wifi?'wifi':'webserial',connected:!!this.transport?.connected,updating:!!this.flashBusy,port:this.wifi?'':'ESP32 USB',error:this.error,log_path:'Хранилище этого браузера',log_root:'Хранилище этого браузера'},network:{ssid:this.device.ssid,ip:'192.168.4.1',mac:this.device.ap_mac,channel:this.device.wifi_channel,clients:this.device.wifi_clients,saved_ssid:this.device.saved_ssid,saved_channel:this.device.saved_wifi_channel},app:{...this.initial.app,battery_information:this.batteryQuery?.snapshot()||null,live_view:{active:this.liveViewing,remote:this.liveRemote},version:this.version,desktop:false,browser:true,recording:!!this.recorder,remaining:this.deadline?Math.ceil(this.remainingMs()/1000):null,countdown:this.countdown(),web_build:this.webBuild,busy:!!globalThis.BySpardProbe?.active||!!this.tuner?.active||!!this.flashBusy||!!this.scan.active||!!this.operation||!!this.ending||this.device.rx_check?.state==='running',sharing:{...this.settings,...this.sharing},scan:this.scan,tuning:this.tuner?.snapshot(),storage:this.storage,sessions:this.sessions||[],transport:this.wifi?'wifi':'usb',monitor:this.monitor?.snapshot(),support:this.support?.snapshot(),stock_bridge:this.support?.relay?.()?.bridge||null,offline_ready:!!this.offlineReady}};}
    checkTuning(token){if(this.updateHold)throw Error('Сайт обновляется; дождитесь подключения');if(this.tuner?.active&&token!==this.tuner.token)throw Error('Идёт автоподбор приёма CAN');}
    async setSampling(profile,{tuningToken}={}){
      if(globalThis.BySpardProbe?.active)throw Error('Дождитесь завершения проверки штатного адаптера');
      this.checkTuning(tuningToken);
      if(profile!=='TRIPLE')throw Error('Приём закреплён: TRIPLE, 250 кбит/с');
      if(!this.transport.connected)throw Error('Подключите ридер');
      if(this.operation||this.recorder||this.ending||this.scan.active||this.flashBusy)throw Error('Сначала завершите текущий тест');
      this.operation=true;
      try{
        const current=await this.transport.poll();
        if(current.can!=='stopped'||current.rx_check?.state==='running')throw Error('Сначала остановите CAN и проверку сигнала');
        const supported=current.sampling_profiles||['DEFAULT','LATE','TRIPLE','LATE_TRIPLE'];
        if(!supported.includes(profile)||!supported.includes(current.rx_sampling_250k))throw Error('Этот профиль требует прошивку ESP32 0.4.8');
        const result=await this.transport.call('SAMPLE '+profile);
        if(result.boot!==current.boot||result.can!=='stopped'||result.rx_sampling_250k!==profile)throw Error('Ридер не подтвердил профиль приёма');
        this.device=result;return {ok:true,profile};
      }finally{this.operation=false;}
    }
    captureQuality(first,last){
      if(first?.boot!==last?.boot)return null;
      const delta=key=>Number.isSafeInteger(first?.[key])&&Number.isSafeInteger(last?.[key])&&last[key]>=first[key]?last[key]-first[key]:null;
      const elapsed=(last?.uptime_us-first?.uptime_us)/1e6,frames=delta('received'),errors=delta('bus_errors');
      return {sampling_profile:last?.rx_sampling_250k||first?.rx_sampling_250k||null,bitrate:last?.bitrate,
        elapsed_seconds:Number.isFinite(elapsed)&&elapsed>0?elapsed:null,received_frames:frames,bus_errors:errors,
        frames_per_second:Number.isFinite(elapsed)&&elapsed>0&&frames!==null?frames/elapsed:null,
        errors_per_second:Number.isFinite(elapsed)&&elapsed>0&&errors!==null?errors/elapsed:null,
        physical_completeness:'unverified',error_count_is_lost_frames:false,active_traffic_observed:frames!==null&&frames>0};
    }
    startClock(seconds){
      clearTimeout(this.deadlineTimer);this.durationMs=seconds*1000;this.deadline=Date.now()+this.durationMs;this.deadlineMono=performance.now()+this.durationMs;
      this.deadlineTimer=setTimeout(()=>{if(this.recorder&&!this.ending)this.finish('timer').catch(e=>{this.error=String(e.message||e);});},this.durationMs);
    }
    remainingMs(){return this.deadline?Math.max(0,(this.deadlineMono??(performance.now()+this.deadline-Date.now()))-performance.now()):0;}
    countdown(){return {duration_ms:this.durationMs,remaining_ms:this.remainingMs(),phase:this.ending?'finalizing':this.recorder&&this.deadline?'running':'idle'};}
    async runTest(seconds){this.checkTuning();if(![30,60,600].includes(seconds))throw Error('Выберите тест 30 с, 60 с или 10 минут');if(this.liveViewing)await this.liveStop();await this.configure({mode:'marked',duration:seconds});await this.begin(250000,{duration:seconds,fixed:true});return {ok:true};}
    async begin(bitrate,{duration=this.settings.duration,fixed=false,beforeStart,tuningToken}={}){
      if(bitrate!==250000)throw Error('Скорость закреплена: 250 кбит/с');
      if(this.liveViewing)await this.liveStop();
      if(globalThis.BySpardProbe?.active)throw Error('Дождитесь завершения проверки штатного адаптера');
      this.checkTuning(tuningToken);
      if(this.operation||this.recorder||this.ending)throw Error('Дождитесь завершения текущей операции');
      if(!RATES.includes(bitrate))throw Error('Выберите скорость CAN');if(!this.transport.connected)throw Error('Подключите ридер');
      this.operation=true;this.fixedTest=fixed;
      try{
        let current=await this.transport.poll();if(current.can==='running')throw Error('CAN уже запущен; сначала остановите текущий приём');if(current.rx_check?.state==='running')throw Error('Дождитесь проверки сигнала');
        current=await this.fixedReceive(current);
        await this.store.claim('recorder-owner',this.id);if(this.wifi)await this.transport.drain(current.received||0);
        this.lastSeq=current.received||0;this.boot=current.boot;this.preview=[];
        this.recorder=await ByStore.Recorder.start(this.store,this.context(),this.settings);
        this.recorder.session.device_first=structuredClone(current);this.recorder.session.finalization_verified=false;this.recorder.session.start_command_issued=false;this.recorder.session.test_duration_s=fixed||this.settings.mode==='marked'?duration:null;
        this.started=Date.now();this.deadline=null;this.deadlineMono=null;
        try{
          await beforeStart?.();this.recorder.session.start_command_issued=true;const started=await this.transport.call('START '+bitrate);this.device=started;
          if(started.can!=='running'||started.boot!==current.boot)throw Error('Запуск CAN не подтверждён');
          if(fixed||this.settings.mode==='marked')this.startClock(duration);
        }catch(e){await this.finish('start_failed');throw e;}
      }finally{this.operation=false;}
    }
    finish(reason='stop'){if(this.finishPromise)return this.finishPromise;this.finishPromise=this.finishNow(reason).finally(()=>{this.finishPromise=null;});this.finishPromise.then(s=>this.tuner?.onFinished(s,reason),e=>this.tuner?.onFailure(e));return this.finishPromise;}
    async finishNow(reason){
      clearTimeout(this.deadlineTimer);
      if(!this.recorder){if(this.transport.connected&&(this.device.can==='running'||this.device.rx_check?.state==='running')){await this.transport.call('STOP');this.device=this.transport.state;}this.liveViewing=false;this.liveRemote=false;return;}
      this.ending=true;const recorder=this.recorder;let finalReason=reason,finished;
      try{
        try{
          if(reason==='start_failed'&&recorder.session.start_command_issued===false)throw Error('Запуск отменён до отправки команды');
          const final=await this.transport.call('STOP'),drained=await this.transport.drain(final.received||0);
          if(final.can!=='stopped'||final.boot!==recorder.session.device_first?.boot)throw Error('Остановка исходного сеанса CAN не подтверждена');
          this.device=final;recorder.session.device_last=structuredClone(final);recorder.session.capture_quality=this.captureQuality(recorder.session.device_first,final);
          const missing=Math.max(0,(final.received||0)-(this.lastSeq||0));
          if(missing){recorder.session.gaps+=missing;await this.recordEvents([{type:'capture_tail_gap',count:missing,host_utc:now()}]);}
          recorder.session.finalization_verified=drained!==false&&!missing;
          recorder.session.end_confirmation=this.transport.lastCommand?.stream_end?'stream_end':'stopped_status_and_drain';
          await this.recordEvents([{type:'device',host_utc:now(),device:final}]);
          if(!recorder.session.finalization_verified)throw Error('Не подтверждено получение последних кадров');
        }catch(e){
          recorder.session.finalization_verified=false;recorder.session.finalization_error=String(e.message||e);recorder.session.unflushed_tail_possible=true;
          if(['stop','timer'].includes(reason))finalReason='stop_unconfirmed';
          this.error='Запись сохранена локально; завершение приёма не подтверждено';
        }
        this.settings=await this.store.settings();await this.writes;this.recorder=null;
        finished=await recorder.finish(finalReason,this.settings.enabled);
        try{await this.saveToFolder(finished);}catch(e){this.error='Запись в браузере сохранена; файл в папку не записан: '+e.message;}
      }finally{this.recorder=null;this.deadline=null;this.deadlineMono=null;this.fixedTest=false;this.ending=false;await this.store.claim('recorder-owner',this.id,true).catch(()=>{});}
      await this.tick();return finished;
    }
    async mark(action,bitrate){if(typeof action!=='string'||!action.trim()||action.length>120)throw Error('Опишите действие, до 120 символов');if(!this.recorder){if(this.settings.mode!=='marked')throw Error('Сначала начните запись');await this.begin(bitrate);}if(this.settings.mode==='marked'&&!this.fixedTest)this.startClock(this.settings.duration);const mark={type:'mark',action,host_utc:now(),host_monotonic_ms:performance.now(),t_us:this.device.uptime_us,clock_source:'last_status_estimate',clock_uncertainty_us:2000000,boot:this.device.boot};await this.recordEvents([mark]);return {...mark,ok:true};}
    async configure(values){if(Object.keys(values).some(k=>!['enabled','monitor_enabled','remote_support_enabled','manual_mode','mode','duration','profile'].includes(k)))throw Error('Неизвестная настройка');if(('mode'in values||'duration'in values||'profile'in values)&&(this.recorder||this.device.can==='running'||this.scan.active||this.tuner?.active))throw Error('Сначала остановите CAN');for(const key of ['enabled','monitor_enabled','remote_support_enabled','manual_mode'])if(key in values&&typeof values[key]!=='boolean')throw Error('Неверная галочка');if('duration'in values&&![30,60,600].includes(values.duration))throw Error('Длительность 30 с, 60 с или 10 минут');if('mode'in values&&!['marked','continuous'].includes(values.mode))throw Error('Неверный режим');if('profile'in values&&!this.profiles?.profiles.some(p=>p.id===values.profile))throw Error('Неизвестный профиль');for(const[key,value]of Object.entries(values))await this.store.setting(key,value);Object.assign(this.settings,values);if('monitor_enabled'in values)this.monitor.enable(values.monitor_enabled);if(values.enabled===false)this.uploadAbort?.abort();if(values.enabled===true&&this.transport.connected)await this.reportStatus('upload_enabled');if('profile'in values)this.scan={active:false,results:[],selected:null};await this.tick();return {ok:true};}
    async scanRates(){
      this.checkTuning();
      if(this.operation||!this.transport.connected||this.recorder||this.ending||(this.device.can==='running'||this.device.rx_check?.state==='running'))throw Error('Подключите ридер и остановите CAN');
      this.scan={active:true,results:[],selected:null};this.cancelScan=false;
      try{
        const initial=await this.transport.poll();await this.store.claim('recorder-owner',this.id);
        this.lastSeq=initial.received||0;this.boot=initial.boot;this.preview=[];
        this.recorder=await ByStore.Recorder.start(this.store,{...this.context(),kind:'bitrate_scan'},this.settings);
        this.started=Date.now();this.deadline=null;
        for(const rate of RATES){
          if(this.cancelScan)break;
          this.scan.bitrate=rate;await this.transport.call('STOP');
          const before=await this.transport.call('START '+rate);await ByTransport.pause(1500);
          const after=await this.transport.poll(),frames=Math.max(0,(after.received||0)-(before.received||0)),errors=Math.max(0,(after.bus_errors||0)-(before.bus_errors||0))+(after.rx_missed||0)-(before.rx_missed||0);
          const result={bitrate:rate,frames,errors,candidate:frames>=10,clean:errors===0};
          this.scan.results.push(result);await this.event({type:'bitrate_result',host_utc:now(),...result});
          await this.transport.call('STOP');
        }
        const matches=this.scan.results.filter(x=>x.candidate);
        this.scan.selected=matches.length===1?matches[0].bitrate:null;
        this.scan.message=this.cancelScan?'Поиск остановлен.':this.scan.selected?(matches[0].clean?'Найдены CAN-кадры. Запуск записи — вручную.':'Найдены CAN-кадры, но есть ошибки. Проверьте качество линии; запуск записи — вручную.'):'Скорость не установлена: нет однозначного кандидата.';
      }catch(e){this.scan.message=String(e.message||e);}
      finally{try{await this.finish('bitrate_scan');}catch{}this.scan.active=false;this.device=this.transport.state;}
    }
    async uploadRequest(method,path,body,headers={}){this.settings=await this.store.settings();if(!this.settings.enabled)throw Error('Отправка выключена');this.uploadAbort=new AbortController();const timer=setTimeout(()=>this.uploadAbort.abort(),30000);try{const r=await fetch(SERVER+path,{method,headers:{...(this.credential?.token?{Authorization:'Bearer '+this.credential.token}:{}),'Content-Type':'application/json',...headers},body,signal:this.uploadAbort.signal,cache:'no-store'});const data=await r.json();if(!r.ok||!data.ok)throw Error('Сервер: '+(data.error||r.status));return data;}finally{clearTimeout(timer);this.uploadAbort=null;}}
    prepare(session){return new Promise((resolve,reject)=>{const worker=new Worker('/archive-worker.js'),timeout=setTimeout(()=>{worker.terminate();reject(Error('Истекло время подготовки архива; локальная запись сохранена'));},300000);worker.onmessage=e=>{clearTimeout(timeout);worker.terminate();e.data.ok?resolve(e.data.archive):reject(Error(e.data.error));};worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(Error('Подготовка архива: '+e.message));};worker.postMessage({id:session.id});});}
    async upload(){if(this.updateHold||this.uploadChecking)return;this.uploadChecking=true;try{return await this.uploadNow();}finally{this.uploadChecking=false;}}
    async uploadNow(){if(this.uploading||!this.ready||!this.settings.enabled)return;this.credential=(await this.store.get('settings','credential'))?.value;try{await this.store.claim('uploader-owner',this.id);}catch{return;}const session=(await this.store.all('sessions')).find(s=>!s.sent&&s.status!=='recording');if(!session)return;this.uploading=true;const lease=setInterval(()=>this.store.claim('uploader-owner',this.id).catch(()=>this.uploadAbort?.abort()),3000);try{session.eligible=true;const meta=await this.prepare(session);await this.store.claim('uploader-owner',this.id);const begin=await this.uploadRequest('POST','/v1/uploads/'+session.id,JSON.stringify(meta));for(let part=begin.next_part;part<meta.parts;part++){await this.store.claim('uploader-owner',this.id);const chunk=await this.store.get('outbox',[session.id,part]);if(!chunk)throw Error('Отсутствует часть архива');const data=chunk.data;const digest=crypto.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join(''):new ByStore.SHA256().update(data).hex();await this.uploadRequest('PUT',`/v1/uploads/${session.id}/${part}`,data,{'Content-Type':'application/octet-stream','X-Content-SHA256':digest});}const receipt=await this.uploadRequest('POST','/v1/uploads/'+session.id+'/complete','{}');if(receipt.sha256!==meta.sha256||receipt.bytes!==meta.size)throw Error('Квитанция не соответствует архиву');session.archive=meta;session.sent=true;session.receipt=receipt;await this.store.put('sessions',session);await this.store.op('outbox','readwrite',s=>s.delete(IDBKeyRange.bound([session.id,0],[session.id,Number.MAX_SAFE_INTEGER])));this.uploadError='';}catch(e){this.uploadError=String(e.message||e);}finally{clearInterval(lease);this.uploading=false;await this.store.claim('uploader-owner',this.id,true).catch(()=>{});}}
    observeRx(){const rx=this.device.rx_check;if(!rx?.id||!['complete','cancelled'].includes(rx.state))return;const key=this.device.boot+':'+rx.id+':'+rx.state;if(this.rxReported===key)return;this.rxReported=key;this.reportStatus('rx_check_'+rx.state).catch(e=>{this.uploadError='Результат теста: '+e.message;});}
    async checkRx({beforeStart}={}){this.checkTuning();if(this.operation||this.recorder||this.scan.active||!this.transport.connected)throw Error('Остановите запись и поиск скорости');const status=await this.transport.poll();if(status.can==='running'||status.rx_check?.state==='running')throw Error('Сначала остановите текущий тест или CAN');if(!status.rx_check)throw Error('Обновите ESP32 до 0.4.2');this.operation=true;try{await beforeStart?.();await this.transport.call('RXCHECK');this.device=this.transport.state;}finally{this.operation=false;}}
    async reportStatus(reason){const device=structuredClone(this.device);const settings=await this.store.settings();if(!settings.enabled||device.product!=='BafangReader')return;const report=await ByStore.Recorder.start(this.store,{...this.context(),kind:reason.startsWith('rx_check_')?'rx_check':'device_status',reason},settings);await report.write([{type:'device',host_utc:now(),device}]);await report.finish('stop',true);}
    async chooseFolder(){if(!window.showDirectoryPicker)throw Error('Выбор папки доступен на HTTPS-странице в Chrome/Edge');const handle=await window.showDirectoryPicker({mode:'readwrite'});await this.store.setting('folder',handle);}
    async saveToFolder(session){const handle=(await this.store.get('settings','folder'))?.value;if(!handle||await handle.queryPermission({mode:'readwrite'})!=='granted')return;const folder=await handle.getDirectoryHandle('diag-logs',{create:true}),file=await folder.getFileHandle('BySykkel-'+session.started.replace(/[:.]/g,'-')+'.jsonl',{create:true}),writer=await file.createWritable();try{for await(const text of this.store.texts(session))await writer.write(text);await writer.close();}catch(e){await writer.abort().catch(()=>{});throw e;}}
    async download(id,csv=false){const session=await this.store.get('sessions',id);if(!session||session.status==='recording')throw Error('Сначала завершите запись');const blob=await(csv?this.store.exportCSV(session):this.store.export(session));const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='BySykkel-'+session.started.replace(/[:.]/g,'-')+(csv?'.csv':'.jsonl');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
    async api(path,body){if(body===undefined)return this.apiRequest(path,body);if(this.updateHold)throw Error('Сайт обновляется; дождитесь подключения');this.apiActive=(this.apiActive||0)+1;try{return await this.apiRequest(path,body);}finally{this.apiActive--;}}
    async apiRequest(path,body){if(this.flashBusy&&!['/api/state','/api/ports'].includes(path)&&!path.startsWith('/api/frames'))throw Error('Идёт обновление ESP32');if(path==='/api/state')return this.snapshot();if(path.startsWith('/api/frames')){const after=Number(new URL(path,location.origin).searchParams.get('after')||0),oldest=this.preview[0]?.seq||0;return {boot:this.boot||this.device.boot,oldest,latest:this.lastSeq||0,missed:oldest>after+1?oldest-after-1:0,frames:this.preview.filter(f=>f.seq>after)};}if(path==='/api/ports')return {ports:[{port:'browser',description:navigator.serial?'Выбрать ESP32 USB…':'Нужен Chrome/Edge и HTTPS',compatible:!!navigator.serial}]};if(path==='/api/connect'){await this.transport.connect();this.autoConnect=!this.wifi;await this.store.setting('usbAutoConnect',true);this.device=this.transport.state;await this.reportStatus('connected');return {ok:true};}if(path==='/api/disconnect'){this.batteryQuery?.cancel();this.autoConnect=false;if(this.tuner?.active)await this.tuner.cancel();await this.store.setting('usbAutoConnect',false);try{await this.finish();}catch(e){this.error='USB отключён; остановка CAN не подтверждена: '+e.message;}finally{if(!this.wifi){if(!this.transport.uncertain)try{await this.transport.call('GUARD OFF');}catch{}await this.transport.close();}}return {ok:true};}if(path==='/api/reader/selftest'){if(!this.readerSelftest)throw Error('Обновите страницу для самотеста');return this.readerSelftest.run({isolationAsserted:body?.isolation_asserted===true});}if(path==='/api/battery/information'){if(!this.batteryQuery)throw Error('Обновите страницу для опроса батареи');return this.batteryQuery.run({readMode:body?.read_mode||'normal',sessionEnded:body?.session_ended===true,expectedBoot:body?.expected_boot,expectedMac:body?.expected_mac});}if(path==='/api/battery/cancel'){this.batteryQuery?.cancel();return {ok:true};}if(path==='/api/live/start')return this.liveStart();if(path==='/api/live/stop')return this.liveStop();if(path==='/api/tuning/start')throw Error('Автоподбор завершён: закреплён TRIPLE, 250 кбит/с');if(path==='/api/tuning/cancel')return this.tuner.cancel();if(path==='/api/sampling')return this.setSampling(body?.profile);if(path==='/api/test')return this.runTest(body?.duration);if(path==='/api/rx-check'){await this.checkRx();return {ok:true};}if(path==='/api/command'){if(body.command==='SELFTEST ISOLATED')throw Error('Используйте отдельную проверку с подтверждением отсоединения CAN');if(body.command==='RXCHECK'){await this.checkRx();return {ok:true};}if(body.command==='STOP'){if(this.batteryQuery?.active){this.batteryQuery.cancel();return {ok:true};}this.cancelScan=true;if(this.tuner?.active)await this.tuner.cancel();else await this.finish();}else if(body.command.startsWith('START '))await this.begin(Number(body.command.slice(6)));else{this.checkTuning();if(this.scan.active)throw Error('Дождитесь завершения поиска');await this.transport.call(body.command);this.device=this.transport.state;}return {ok:true};}if(path==='/api/mark')return this.mark(body.action,body.bitrate);if(path==='/api/recording/settings')return this.configure(body);if(path==='/api/bitrate/scan')throw Error('Скорость закреплена: 250 кбит/с');if(path==='/api/bitrate/cancel'){this.cancelScan=true;return {ok:true};}throw Error('Эта функция доступна в Windows-программе');}
  }
  globalThis.ByBrowser={Runtime,SERVER,RATES,vehicleContext};
})();
