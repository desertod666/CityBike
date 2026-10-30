/* Private diagnostic jobs require a local permission and an independent server policy. */
'use strict';
(() => {
  const validMac=value=>typeof value==='string'&&/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(value.toLowerCase()),RATES=[250000];
  class Support {
    constructor(runtime){this.runtime=runtime;this.key=ByStore.uuid()+ByStore.uuid();this.seen=new Set();this.last=null;this.lastBridgeKind='esp';this.active=false;this.runningJob=null;this.probeWork=null;this.pairedWork=null;this.pairedState=null;this.stock={boot:ByStore.uuid().slice(0,8).toUpperCase(),ports:[],refreshed:null,cutoff:Date.now()};this.stockExcluded=new WeakSet();const serial=globalThis.navigator?.serial;serial?.addEventListener?.('disconnect',e=>{const p=e.target;if(p?.getInfo){const i=p.getInfo();if(i.usbVendorId!==0x1a86||i.usbProductId!==0x7523)return;}if(p&&p!==serial)this.stockExcluded.add(p);this.stock.ports=[];this.stock.refreshed=null;this.stock.cutoff=Date.now();this.stock.blocked=globalThis.BySpardProbe?.snapshot?.().latest_information;this.runtime.monitor?.capture({type:'stock_usb_disconnected',host_utc:new Date().toISOString()});});serial?.addEventListener?.('connect',e=>{if(e.target?.getInfo){const i=e.target.getInfo();if(i.usbVendorId!==0x1a86||i.usbProductId!==0x7523)return;}if(e.target&&e.target!==serial)this.stockExcluded.delete(e.target);this.stock.refreshed=null;this.stock.cutoff=Date.now();this.stock.blocked=globalThis.BySpardProbe?.snapshot?.().latest_information;});}
    identityVerified(){const r=this.runtime;return !r.wifi&&r.transport?.connected&&r.transport.verified===true&&r.transport.uncertain!==true&&validMac(r.device.ap_mac);}
    mono(){return globalThis.performance?.now?.()??Date.now();}
    async refreshStock(){if(this.stockRefreshing)return this.stockRefreshing;const work=(async()=>{try{const serial=globalThis.navigator?.serial;const ports=this.runtime.wifi||!serial?.getPorts?[]:await serial.getPorts();const valid=ports.filter(p=>{const i=p.getInfo();return i.usbVendorId===0x1a86&&i.usbProductId===0x7523&&p.connected!==false&&!this.stockExcluded.has(p);});if(valid.length!==this.stock.ports.length||valid.some((p,i)=>p!==this.stock.ports[i])){this.stock.cutoff=Date.now();this.stock.blocked=globalThis.BySpardProbe?.snapshot?.().latest_information;}this.stock.ports=valid;this.stock.refreshed=this.mono();}catch{this.stock.ports=[];this.stock.refreshed=null;}})();this.stockRefreshing=work;try{await work;}finally{if(this.stockRefreshing===work)this.stockRefreshing=null;}}
    get stockRemoteActive(){return this.runningJob?.bridge_kind==='stock'||!!this.stockAwaitingAck;}
    stockCount(){return this.stock.refreshed!==null&&this.mono()-this.stock.refreshed<=3000?this.stock.ports.length:0;}
    stockMode(){if(this.stockRemoteActive)return true;if(this.identityVerified()){this.stockRoute=false;return false;}if(!this.runtime.wifi&&this.stockCount()===1&&!this.stockRoute){this.stockRoute=true;this.stock.cutoff=Date.now();this.stock.blocked=globalThis.BySpardProbe?.snapshot?.().latest_information;}return !!this.stockRoute;}
    localPermission(){const r=this.runtime;return !r.flashBusy&&!r.updateHold&&r.settings?.remote_support_enabled===true&&r.settings?.manual_mode===false&&r.settings?.monitor_enabled===true;}
    stockReady(){return !!globalThis.BySpardProbe&&this.stockMode()&&this.stockCount()===1&&this.localPermission();}
    ready(){return this.localPermission()&&(this.identityVerified()||this.stockReady());}
    relay(){if(!this.stockMode())return null;return {source:'browser-stock',device:{product:'StockCANAdapter',protocol:1,usb_vid:'1A86',usb_pid:'7523'},bridge:{kind:'stock',boot:this.stock.boot,uptime_us:Math.floor(this.mono()*1000),port_count:this.stockCount()},connected:this.stockCount()===1};}
    acknowledge(packet){const last=packet?.control?.last;if(this.stockAwaitingAck&&last&&packet?.source==='browser-stock'&&last.id===this.stockAwaitingAck&&['complete','failed','cancelled'].includes(last.state))this.stockAwaitingAck=null;}
    pairedAvailable(){return !!(globalThis.BySpardProbe&&globalThis.navigator?.serial?.getPorts&&typeof this.runtime.setSampling==='function'&&Array.isArray(this.runtime.device.sampling_profiles)&&this.runtime.device.sampling_profiles.includes('DEFAULT'));}
    pairedGuard(){const d=this.runtime.device,g=d.ctx_guard||{};return d.tx_gpio===4&&d.rx_gpio===5&&d.twai_tx_gpio===10&&g.policy==='fixed_recessive'&&g.valid===true&&g.level===1&&g.out_sel===128&&g.mux===1&&g.enabled===true&&g.input_enabled===true&&g.latch_high===true&&g.inverted===false;}
    batteryAvailable(){const d=this.runtime.device;return !!this.runtime.batteryQuery&&globalThis.ByEspBattery?.available(d)===true;}
    snapshot(){const ready=!!this.ready(),stock=this.stockMode();let adapter=globalThis.BySpardProbe?.snapshot?.()||null;if(stock&&adapter){const packet=adapter.latest_information;adapter={...adapter,latest_information:this.stockCount()===1&&packet!==this.stock.blocked&&Date.parse(packet?.received_utc)>=this.stock.cutoff?packet:null};}return {version:2,web_build:this.runtime.webBuild,handset_log:globalThis.ByEspRemote?.snapshot?.()||null,ble_remote:globalThis.ByBleRemote?.diagnostics?.()||null,site_update:globalThis.ByAutoUpdate?.snapshot?.()||null,can_live:stock?null:this.runtime.canLiveSnapshot?.()||null,reader_selftest:stock?null:this.runtime.readerSelftest?.snapshot()||null,battery_information:stock?null:this.runtime.batteryQuery?.snapshot()||null,live_view:{active:!stock&&!!this.runtime.liveViewing,remote:!stock&&!!this.runtime.liveRemote},recorder_version:2,countdown:stock?null:this.runtime.countdown?.()||null,recording:stock?false:!!this.runtime.recorder,busy:!!(this.active||this.stockAwaitingAck||this.runtime.operation||this.runtime.ending||this.runtime.scan?.active||this.runtime.tuner?.active||this.runtime.recorder),ready,updating:!!this.runtime.flashBusy,capabilities:stock?['spard_probe','stop']:['rx_check','capture','stop','flash','sampling',...(this.batteryAvailable()?['battery_information']:[]),...(globalThis.ByReaderSelftest?.available(this.runtime.device)?['reader_selftest']:[]),...(globalThis.BySpardProbe?['spard_probe']:[]),...(this.runtime.liveData&&typeof this.runtime.liveStart==='function'?['live_view']:[])],last:this.lastBridgeKind===(stock?'stock':'esp')?this.last:null,stock_adapter:adapter,local_permission:{remote_support_enabled:this.runtime.settings?.remote_support_enabled===true,manual_mode:this.runtime.settings?.manual_mode!==false},lease_expires_at:ready?Date.now()/1000+30:0};}
    canStop(job){const r=this.runtime;return /^[a-f0-9]{32}$/.test(job.target_job_id||'')&&((r.tuner?.active&&r.tuner.remoteJob===job.target_job_id)||(r.recorder?.session?.context?.support_job===job.target_job_id)||(this.runningJob?.id===job.target_job_id&&((this.runningJob.kind==='battery_information'&&r.batteryQuery?.active)||(this.runningJob.kind==='rx_check'&&r.device.rx_check?.state==='running')||(this.runningJob.kind==='spard_probe'&&globalThis.BySpardProbe?.active)||(this.runningJob.kind==='paired_probe'&&this.pairedWork))));}
    receive(job){
      if(!job||typeof job.id!=='string'||!/^[a-f0-9]{32}$/.test(job.id)||this.seen.has(job.id))return;
      const stock=Object.prototype.hasOwnProperty.call(job,'expected_bridge_boot');
      if(!this.ready()||!Number.isFinite(job.expires_at)||job.expires_at<Date.now()/1000||job.expires_at>Date.now()/1000+90)return;
      if(stock){if(!this.stockReady()||job.expected_bridge_boot!==this.stock.boot||'expected_mac'in job||'expected_boot'in job||!['spard_probe','stop'].includes(job.kind)||job.adapter_vid!=='1A86'||job.adapter_pid!=='7523')return;}
      else if(!this.identityVerified()||job.expected_mac?.toLowerCase()!==this.runtime.device.ap_mac?.toLowerCase()||job.expected_boot!==this.runtime.device.boot)return;
      if(job.kind==='stop'&&stock!==(this.runningJob?.bridge_kind==='stock'))return;
      if(!['rx_check','capture','stop','flash','spard_probe','live_view','battery_information','reader_selftest'].includes(job.kind))return;
      if(job.kind==='reader_selftest'&&(!globalThis.ByReaderSelftest?.available(this.runtime.device)||!this.pairedGuard()||job.isolation_asserted!==true||Object.keys(job).some(k=>!['id','kind','expected_mac','expected_boot','expires_at','isolation_asserted'].includes(k))))return;
      if(job.kind==='battery_information'&&(!this.batteryAvailable()||!this.pairedGuard()||(job.read_mode==='quiet'?(!globalThis.ByEspBattery?.quietAvailable(this.runtime.device)||job.session_ended!==true||Object.keys(job).some(k=>!['id','kind','read_mode','session_ended','expected_mac','expected_boot','expires_at'].includes(k))):Object.keys(job).some(k=>!['id','kind','expected_mac','expected_boot','expires_at'].includes(k)))))return;
      if(job.kind==='live_view'&&(!this.runtime.liveData||!['start','stop'].includes(job.mode)||job.bitrate!==250000||(job.mode==='start'&&!this.pairedGuard())||Object.keys(job).some(k=>!['id','kind','mode','bitrate','expected_mac','expected_boot','expires_at'].includes(k))))return;
      if(job.kind==='paired_probe'&&(!this.pairedAvailable()||!this.pairedGuard()||job.bitrate!==250000||job.duration!==60||job.stock_duration!==30||job.mode!=='information'||job.sampling!=='DEFAULT'||job.adapter_vid!=='1A86'||job.adapter_pid!=='7523'))return;
      if(job.kind==='sampling_sweep'&&(![30,60].includes(job.duration)||job.bitrate!==250000||!this.runtime.tuner||!Array.isArray(this.runtime.device.sampling_profiles)||!ByTuning.PLAN.every(p=>this.runtime.device.sampling_profiles.includes(p))))return;
      if(job.kind==='spard_probe'&&(!globalThis.BySpardProbe||![30,120].includes(job.duration)||!['information','listen'].includes(job.mode||'information')||job.adapter_vid!=='1A86'||job.adapter_pid!=='7523'))return;
      if(job.kind==='stop'&&!this.canStop(job))return;
      if(job.kind==='capture'&&(job.bitrate!==250000||![30,60,600].includes(job.duration)))return;
      if(job.kind==='capture'&&job.vehicle!==undefined&&!['phylion_old','spard_new'].includes(job.vehicle))return;
      if(job.kind==='capture'&&job.sampling!==undefined&&job.sampling!=='TRIPLE')return;
      if(job.kind==='flash'&&(!ByFlash.newerVersion(job.firmware_version,job.expected_version)||job.expected_version!==this.runtime.device.version||!/^[a-f0-9]{64}$/.test(job.manifest_sha256)))return;
      this.seen.add(job.id);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value);
      this.lastBridgeKind=stock?'stock':'esp';if(stock)this.stockAwaitingAck=job.id;this.last={id:job.id,kind:job.kind,state:'accepted'};
      this.work=this.execute(job).catch(e=>{if(this.last?.id===job.id)this.last={id:job.id,kind:job.kind,state:'failed',message:String(e.message||e).slice(0,160)};if(this.runningJob?.id===job.id)this.runningJob=null;});
    }
    async checkPermission(job){const r=this.runtime;if(r.store?.settings)r.settings=await r.store.settings();if('expected_bridge_boot'in job)await this.refreshStock();if(!this.ready()||('expected_bridge_boot'in job?(!this.stockReady()||job.expected_bridge_boot!==this.stock.boot):(!this.identityVerified()||job.expected_boot!==r.device.boot))||job.expires_at<Date.now()/1000)throw Error('Удалённое действие отозвано или срок истёк');}
    pairedPause(){return new Promise(resolve=>setTimeout(resolve,250));}
    async runPaired(job){
      const r=this.runtime,state={id:job.id,cancelled:false,deadline:performance.now()+75000};this.pairedState=state;
      let recorder,stockWork,stockResult,stockDone=false,stockError,finished;
      const guard=async(parent=false)=>{if(r.store?.settings)r.settings=await r.store.settings();if(state.cancelled||!this.ready()||r.device.boot!==job.expected_boot||!this.pairedGuard()||performance.now()>state.deadline)throw Error('Парный тест отозван, ридер отключён или срок истёк');if(parent&&(r.recorder!==recorder||r.ending||r.tuner?.active||r.device.can!=='running'))throw Error('Исходная запись парного теста больше не активна');};
      try{
        await this.checkPermission(job);await guard();
        const ports=(await navigator.serial.getPorts()).filter(p=>{const i=p.getInfo();return i.usbVendorId===0x1a86&&i.usbProductId===0x7523;});
        if(ports.length!==1)throw Error('Парный тест требует один разрешённый штатный адаптер 1A86:7523');
        await this.checkPermission(job);await guard();await r.setSampling('DEFAULT');
        await this.checkPermission(job);await guard();
        await r.begin(250000,{duration:60,fixed:true,beforeStart:async()=>{await this.checkPermission(job);await guard();}});
        recorder=r.recorder;if(!recorder||!/^[a-f0-9]{32}$/.test(recorder.session.id||''))throw Error('Нет исходного сеанса записи CAN');
        const paired={schema:1,job_id:job.id,can_session_id:recorder.session.id,can_duration_s:60,stock_duration_s:30,mode:'information',sampling:'DEFAULT'};
        Object.assign(recorder.session.context,{support_job:job.id,paired_probe:paired});r.fixedTest=true;
        this.runningJob={id:job.id,kind:job.kind};this.last={id:job.id,kind:job.kind,state:'started',can_session_id:recorder.session.id};
        await r.event({type:'paired_probe_start',paired_probe:paired,host_utc:new Date().toISOString()});await guard(true);
        stockWork=BySpardProbe.run({duration:30,mode:'information',guard:()=>guard(true),context:{paired_probe:paired}});this.probeWork=stockWork;
        stockWork.then(value=>{stockResult=value;stockDone=true;},error=>{stockError=error;stockDone=true;});
        while(!stockDone){await guard();if(r.recorder!==recorder&&!r.ending&&!r.finishPromise&&recorder.session.reason!=='timer')throw Error('Запись CAN завершилась до конца парного теста');await this.pairedPause();}
        if(stockError)throw stockError;
        if(!/^[a-f0-9]{32}$/.test(stockResult?.receipt?.id||''))throw Error('Нет квитанции диагностического лога адаптера');
        if(r.recorder===recorder)await r.event({type:'paired_probe_stock_complete',paired_probe:paired,stock_receipt_id:stockResult.receipt.id,host_utc:new Date().toISOString()});
        while(r.recorder===recorder||r.ending||r.finishPromise){await guard();if(r.recorder&&r.recorder!==recorder)throw Error('Сеанс записи CAN изменился');if(r.recorder===recorder&&r.remainingMs()===0)finished=await r.finish('timer');else if(r.finishPromise)finished=await r.finishPromise;else await this.pairedPause();}
        finished=finished||recorder.session;await guard();
        if(finished.id!==paired.can_session_id||finished.status!=='complete'||finished.reason!=='timer'||finished.finalization_verified!==true)throw Error('Завершение исходной записи CAN не подтверждено');
        const canReceipt=finished.sent===true&&/^[a-f0-9]{32}$/.test(finished.receipt?.id||'')?finished.receipt.id:null;
        if(this.last?.id===job.id)this.last={id:job.id,kind:job.kind,state:'complete',can_session_id:paired.can_session_id,stock_receipt_id:stockResult.receipt.id,can_finalization_verified:true,can_archive_uploaded:!!canReceipt,...(canReceipt?{can_archive_receipt_id:canReceipt}:{}),received_bytes:stockResult.received_bytes,valid_packets:stockResult.valid_packets};
      }finally{
        state.cancelled=true;
        if(stockWork&&!stockDone)BySpardProbe.cancel();
        try{if(recorder&&r.recorder===recorder)await r.finish('paired_cleanup');else if(r.finishPromise)await r.finishPromise;}
        finally{if(stockWork)await stockWork.catch(()=>{});if(this.probeWork===stockWork)this.probeWork=null;if(this.runningJob?.id===job.id)this.runningJob=null;if(this.pairedState===state)this.pairedState=null;}
      }
    }
    async execute(job){
      const r=this.runtime;
      await this.checkPermission(job);
      if(job.kind==='stop'){if(!this.canStop(job))throw Error('STOP не относится к текущей удалённой проверке');if(this.runningJob?.kind==='battery_information'){const work=this.batteryWork;r.batteryQuery.cancel();if(work)await work.catch(()=>{});this.runningJob=null;this.last={id:job.id,kind:job.kind,state:'complete'};return;}if(this.runningJob?.kind==='paired_probe'&&this.runningJob.id===job.target_job_id){const work=this.pairedWork;if(this.pairedState)this.pairedState.cancelled=true;BySpardProbe.cancel();await r.finish('support_stop');if(work)await work.catch(()=>{});this.runningJob=null;this.last={id:job.id,kind:job.kind,state:'complete'};return;}if(this.runningJob?.kind==='spard_probe'&&this.runningJob.id===job.target_job_id){const work=this.probeWork;BySpardProbe.cancel();if(work)await work.catch(()=>{});this.runningJob=null;this.last={id:job.id,kind:job.kind,state:'complete'};return;}r.cancelScan=true;if(r.tuner?.active&&r.tuner.remoteJob===job.target_job_id)await r.tuner.cancel();else await r.finish('support_stop');this.runningJob=null;this.last={id:job.id,kind:job.kind,state:'complete'};return;}
      if(job.kind==='reader_selftest'){
        if(this.active)throw Error('Ридер занят отдельным тестом');
        this.active=true;this.runningJob={id:job.id,kind:job.kind};this.last={id:job.id,kind:job.kind,state:'started'};
        try{await r.readerSelftest.run({isolationAsserted:job.isolation_asserted,expectedMac:job.expected_mac,expectedBoot:job.expected_boot,beforeStep:()=>this.checkPermission(job)});this.last={id:job.id,kind:job.kind,state:'complete'};}
        finally{this.active=false;if(this.runningJob?.id===job.id)this.runningJob=null;}return;
      }
      if(job.kind==='battery_information'){
        if(this.active||r.recorder||r.operation||r.ending||r.flashBusy||r.tuner?.active||r.scan.active||globalThis.BySpardProbe?.active)throw Error('Ридер занят отдельным тестом');
        this.active=true;this.runningJob={id:job.id,kind:job.kind};this.last={id:job.id,kind:job.kind,state:'started'};
        const work=r.batteryQuery.run({readMode:job.read_mode||'normal',sessionEnded:job.session_ended===true,expectedMac:job.expected_mac,expectedBoot:job.expected_boot,beforeStep:()=>this.checkPermission(job)});this.batteryWork=work;
        try{await work;if(this.last?.id===job.id)this.last={id:job.id,kind:job.kind,state:'complete'};}
        finally{this.active=false;if(this.runningJob?.id===job.id)this.runningJob=null;if(this.batteryWork===work)this.batteryWork=null;}return;
      }
      if(job.kind==='live_view'){
        if(this.active||r.recorder||r.tuner?.active||r.scan.active||r.operation||r.ending||r.flashBusy||globalThis.BySpardProbe?.active)throw Error('Ридер занят отдельным тестом');
        this.active=true;
        try{if(job.mode==='start')await r.liveStart({remote:true,beforeStart:()=>this.checkPermission(job)});else await r.liveStop();this.last={id:job.id,kind:job.kind,state:'complete'};}
        finally{this.active=false;}return;
      }
      if(this.active||globalThis.BySpardProbe?.active||r.tuner?.active||r.recorder||r.scan.active||r.operation||r.ending||r.flashBusy||(!('expected_bridge_boot'in job)&&(r.device.can==='running'||r.device.rx_check?.state==='running')))throw Error('Ридер занят пользователем');
      this.active=true;
      try{
        if(job.kind==='paired_probe'){const work=this.runPaired(job);this.pairedWork=work;try{await work;}finally{if(this.pairedWork===work)this.pairedWork=null;}return;}
        if(job.kind==='spard_probe'){const stock='expected_bridge_boot'in job;this.runningJob={id:job.id,kind:job.kind,...(stock?{bridge_kind:'stock'}:{})};this.last={id:job.id,kind:job.kind,state:'started'};const until=this.mono()+job.duration*1000+15000;const guard=async()=>{if(r.store?.settings)r.settings=await r.store.settings();if(stock)await this.refreshStock();if(!this.ready()||(stock?(!this.stockReady()||job.expected_bridge_boot!==this.stock.boot):(!this.identityVerified()||r.device.boot!==job.expected_boot))||this.mono()>until)throw Error('Удалённая проверка адаптера отозвана или срок истёк');};const work=BySpardProbe.run({duration:job.duration,mode:job.mode||'information',guard});this.probeWork=work;try{const result=await work;if(this.last?.id===job.id)this.last={id:job.id,kind:job.kind,state:'complete',receipt_id:result.receipt.id,received_bytes:result.received_bytes,valid_packets:result.valid_packets};}finally{if(this.runningJob?.id===job.id)this.runningJob=null;if(this.probeWork===work)this.probeWork=null;}return;}
        if(job.kind==='flash'){const result=await new ByRemoteFlash.RemoteFlash(r).install(job);this.last={id:job.id,kind:'flash',state:'complete',version:result.version,boot_verified:result.boot_verified};return;}
        if(job.kind==='sampling_sweep'){
          const until=Date.now()+job.duration*ByTuning.PLAN.length*1000+90000;
          const guard=async()=>{if(r.store?.settings)r.settings=await r.store.settings();if(!this.ready()||r.device.boot!==job.expected_boot||Date.now()>until)throw Error('Удалённый автоподбор отозван или срок серии истёк');};
          await r.tuner.start(job.duration,{beforeStart:guard});r.tuner.remoteJob=job.id;
        }else if(job.kind==='rx_check')await r.checkRx({beforeStart:()=>this.checkPermission(job)});
        else{
          if(job.vehicle)await r.setVehicle(job.vehicle);
          await this.checkPermission(job);
          if(job.sampling){r.device=await r.transport.call('SAMPLE '+job.sampling);if(r.device.can!=='stopped'||r.device.rx_sampling_250k!==job.sampling)throw Error('Ридер не подтвердил настройку выборки');}
          await this.checkPermission(job);
          await r.begin(job.bitrate,{duration:job.duration,fixed:true,beforeStart:()=>this.checkPermission(job)});
          if(r.recorder){r.recorder.session.context.support_job=job.id;r.startClock(job.duration);r.fixedTest=true;await r.event({type:'support_capture',job:job.id,bitrate:job.bitrate,duration:job.duration,sampling:job.sampling||null,host_utc:new Date().toISOString()});}
        }
        this.runningJob={id:job.id,kind:job.kind};this.last={id:job.id,kind:job.kind,state:'started'};
      }finally{this.active=false;}
    }
    observe(){if(this.last?.state!=='started'||this.lastBridgeKind!==(this.stockMode()?'stock':'esp'))return;const r=this.runtime;if(this.last.kind==='sampling_sweep'&&!r.tuner?.active){this.last={...this.last,state:r.tuner?.phase==='complete'?'complete':'failed',message:r.tuner?.error||null};this.runningJob=null;}if(this.last.kind==='capture'&&!r.recorder&&!r.operation&&!r.ending){this.last={...this.last,state:'complete'};this.runningJob=null;}if(this.last.kind==='rx_check'&&['complete','cancelled'].includes(r.device.rx_check?.state)){this.last={...this.last,state:r.device.rx_check.state};this.runningJob=null;}}
  }
  globalThis.BySupport={Support};
})();
