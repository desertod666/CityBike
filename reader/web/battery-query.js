/* ESP-only Information00 operation. No stock-adapter objects or custom TX input. */
'use strict';
(function(root){
 const QUALITY_MS=30000,QUIET_QUALITY_MS=5000,MAX_OPERATION_MS=45000;
 const POLICY_CAPABILITY='spard_query_quality_v1';
 function versionAtLeast(value,minimum){
  if(![value,minimum].every(x=>typeof x==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(x)))return false;
  const a=value.split('.').map(Number),b=minimum.split('.').map(Number);
  for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return true;
 }
 function supported(d,quiet=false){return d?.product==='BafangReader'&&d.protocol===1&&versionAtLeast(d.version,quiet?'0.5.7':'0.5.2')&&Array.isArray(d.capabilities)&&['command_ids','spard_information_query',...(quiet?['spard_quiet_query_v1']:[])].every(c=>d.capabilities.includes(c));}
 function qualityError(start,end,tolerant,final=false,quiet=false){
  const frames=end.received-start.received,events=end.bus_errors-start.bus_errors;
  if(!Number.isSafeInteger(frames)||!Number.isSafeInteger(events)||frames<0||events<0)return 'Счётчики CAN изменились; запрос BMS не отправлен';
  if(quiet&&events!==0)return 'Тихий режим требует нулевых ошибок; запрос BMS не отправлен';
  if(events>(tolerant?10:0))return 'Превышен допуск CAN-ошибок; запрос BMS не отправлен';
  if(final&&((!quiet&&frames<100)||events>Math.floor(frames/100)))return 'Недостаточно CAN-данных в пределах допуска; запрос BMS не отправлен';
  return null;
 }
 class Query{
  constructor(runtime,{now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){this.r=runtime;this.now=now;this.sleep=sleep;this.active=false;this.phase='idle';this.latest=null;this.validPackets=0;this.assembler=new root.BySpardCan.Assembler();this.packets=[];this.error='';}
  feed(message){
   if(message?.type==='stream_end'&&this.phase==='querying')this.streamEnd=message;
   if(message?.type==='battery_query_result'&&this.phase==='querying')this.queryResult=message;
   if(message?.type!=='frame')return;
   if(this.latest&&this.latest.boot!==message.boot)this.latest=null;
   for(const p of this.assembler.feed(message)){
    if(!p.xor_valid||p.observed_length!==90||p.command!==0)continue;
    const d=root.BySpardInformation.decode(p.raw_hex);if(d.status!=='decoded')continue;
    const packet={...p,seen:this.now(),origin:'observed'};this.latest=packet;this.validPackets++;
    if(this.phase==='querying'){this.packets.push(packet);if(this.packets.length>4)this.packets.shift();}
   }
  }
  snapshot(){const r=this.r,d=r.device||{},x=this.latest;const same=x&&d.boot===x.boot&&Number.isSafeInteger(d.epoch)&&d.epoch>=x.epoch;
   return {active:this.active,phase:this.phase,read_mode:this.readMode||'normal',error:this.error||null,valid_packets:this.validPackets,remaining_ms:this.active?Math.max(0,Math.ceil((this.deadline||this.now())-this.now())):0,
    information:same?{schema:1,source:'esp_can_std666',origin:x.origin,boot:x.boot,epoch:x.epoch,first_seq:x.first_seq,last_seq:x.last_seq,t_us:x.t_us,fragments:x.fragments,raw_hex:x.raw_hex,age_ms:Math.min(86400000,Math.max(0,Math.round(this.now()-x.seen),Math.round(((d.uptime_us||x.t_us)-x.t_us)/1000)))}:null};}
  cancel(){this.cancelled=true;}
  guard(boot){const r=this.r;
   if(this.cancelled)throw Error('Опрос отменён');
   if(!r.transport.connected||r.transport.uncertain||r.device.boot!==boot||r.device.ap_mac!==this.mac||this.now()>this.expires)throw Error('Связь или загрузка ESP изменилась; опрос прекращён');
  }
  async stopped(boot){const r=this.r,d=await r.transport.call('STOP');r.device=d;
   if(d.boot!==boot||d.can!=='stopped'||d.ctx_guard?.policy!=='fixed_recessive'||d.ctx_guard.valid!==true||d.ctx_guard.level!==1||!await r.transport.drain(d.received||0))throw Error('Остановка и пассивное состояние ESP не подтверждены');return d;
  }
  async run(options={}){
   const r=this.r,mode=options.readMode||'normal';
   if(!['normal','quiet'].includes(mode))throw Error('Неизвестный режим опроса батареи');
   if(mode==='quiet'&&(options.sessionEnded!==true||typeof options.expectedBoot!=='string'||typeof options.expectedMac!=='string'))throw Error('Подтвердите завершение сессии для выбранного ридера');
   if(this.active||r.operation||r.ending||r.recorder||r.flashBusy||r.scan?.active||r.tuner?.active||root.BySpardProbe?.active)throw Error('Завершите текущую операцию перед опросом BMS');
   if(!r.transport.connected||!r.transport.verified||r.transport.uncertain||r.wifi)throw Error('Для опроса нужен подтверждённый USB-ридер ESP');
   this.readMode=mode;this.active=true;r.operation=true;this.cancelled=false;this.phase='preparing';this.error='';this.expires=this.now()+MAX_OPERATION_MS;
   try{return await this.execute(options);}finally{this.active=false;r.operation=false;}
  }
  async execute({beforeStep=async()=>{},expectedBoot,expectedMac}={}){
   const r=this.r,viewing=!!r.liveViewing,wasRemote=!!r.liveRemote;
   let boot=r.device.boot,d,safeStop=false,failure,touched=false;
   try{
    d=await r.transport.poll();r.device=d;boot=d.boot;this.mac=d.ap_mac;
    if(expectedBoot&&d.boot!==expectedBoot||expectedMac&&d.ap_mac!==expectedMac)throw Error('Выбранный ридер изменился; опрос отменён');
    const quiet=this.readMode==='quiet';
    if(quiet&&(!versionAtLeast(d.version,'0.5.7')||!d.capabilities?.includes('spard_quiet_query_v1')))throw Error('Для опроса без сессии нужна прошивка ESP 0.5.7');
    if(!supported(d)||!d.capabilities?.includes('spard_information_query')||!d.capabilities.includes('command_ids'))throw Error('Нужна прошивка ESP с подтверждённым режимом опроса BMS');
    if(d.rx_sampling_250k!=='TRIPLE')throw Error('Нужен фиксированный TRIPLE');
    if(d.can==='running'&&!viewing)throw Error('Приём занят другой операцией');
    await beforeStep();this.guard(boot);
    if(viewing){touched=true;await this.stopped(boot);r.liveViewing=false;r.liveRemote=false;}
    if(r.device.can!=='stopped'||r.device.ctx_guard?.valid!==true)throw Error('Пассивный режим перед проверкой не подтверждён');
    this.phase='qualifying';touched=true;safeStop=false;
    d=await r.transport.call('START 250000');r.device=d;
    if(d.boot!==boot||d.can!=='running'||d.bitrate!==250000||d.ctx_guard?.valid!==true)throw Error('Проверка CAN не запущена');
    const start=d,tolerant=!quiet&&versionAtLeast(d.version,'0.5.3')&&d.capabilities.includes(POLICY_CAPABILITY);this.deadline=this.now()+(quiet?QUIET_QUALITY_MS:QUALITY_MS);
    while(this.now()<this.deadline){await this.sleep(Math.min(200,this.deadline-this.now()));this.guard(boot);await beforeStep();const x=r.device;
     if(x.can!=='running'||x.epoch!==start.epoch)throw Error('Состояние CAN изменилось; запрос BMS не отправлен');
     const quality=qualityError(start,x,tolerant,false,quiet);if(quality)throw Error(quality);
     for(const k of ['rx_missed','rx_overrun','frame_queue_drops','usb_frame_drops','control_drops','stop_discards'])if((x[k]||0)!==(start[k]||0))throw Error('Есть потери данных; запрос BMS не отправлен');
    }
    this.guard(boot);await beforeStep();d=await this.stopped(boot);safeStop=true;
    if(d.epoch!==start.epoch)throw Error('Эпоха CAN изменилась; запрос BMS не отправлен');
    const quality=qualityError(start,d,tolerant,true,quiet);if(quality)throw Error(quality);
    for(const k of ['rx_missed','rx_overrun','frame_queue_drops','usb_frame_drops','control_drops','stop_discards'])if((d[k]||0)!==(start[k]||0))throw Error('Потери при завершении проверки; запрос BMS не отправлен');
    this.guard(boot);await beforeStep();this.phase='querying';this.deadline=this.now()+1000;this.packets=[];this.streamEnd=null;this.queryResult=null;this.assembler=new root.BySpardCan.Assembler();
    const previous=d;safeStop=false;d=await r.transport.call(quiet?'SPARD QUIET INFO':'SPARD INFO');r.device=d;this.guard(boot);await beforeStep();
    if(d.can!=='stopped'||d.mode!=='listen_only'||d.ctx_guard?.policy!=='fixed_recessive'||d.ctx_guard.valid!==true||d.ctx_guard.level!==1||!await r.transport.drain(d.received||0))throw Error('Опрос не подтвердил безопасное завершение');safeStop=true;
    const fence=this.streamEnd;
    if(!fence||fence.boot!==boot||fence.epoch!==d.epoch||fence.final_seq!==d.received||d.epoch!==previous.epoch+1)throw Error('Граница CAN-потока опроса не подтверждена');
    const packet=[...this.packets].reverse().find(p=>p.boot===boot&&p.epoch===d.epoch&&p.first_seq>previous.received&&p.last_seq<=d.received);
    if(!packet)throw Error('Полный проверенный ответ BMS не получен');
    const result=this.queryResult;
    if(!result||quiet&&result.read_mode!=='quiet'||result.boot!==boot||result.epoch!==d.epoch||result.request!=='information00'||result.state!=='complete'||result.tx_attempted!==2||result.tx_acknowledged!==2||result.response_valid!==true||result.ctx_restored!==true||result.driver_retained!==false)throw Error('Результат запроса ESP не подтверждён');
    this.latest={...packet,origin:'esp_query'};this.phase='complete';return this.snapshot().information;
   }catch(e){failure=e;this.phase=this.cancelled?'cancelled':'failed';this.error=String(e.message||e).slice(0,160);throw e;}
   finally{
    try{if(touched&&!safeStop&&r.transport.connected&&!r.transport.uncertain&&r.device.boot===boot){await this.stopped(boot);safeStop=true;}}
    catch(e){safeStop=false;this.error=String(e.message||e).slice(0,160);if(!failure)throw e;}
    finally{r.operation=false;}
    if(viewing&&touched&&!this.cancelled&&safeStop&&r.transport.connected&&!r.transport.uncertain&&r.device.boot===boot&&(!wasRemote||r.settings?.remote_support_enabled===true&&r.settings.manual_mode===false&&r.settings.monitor_enabled===true)){
     try{await r.liveStart({remote:wasRemote});}catch(e){this.error='Просмотр не восстановлен: '+String(e.message||e);}
    }
   }
  }
 }
 root.ByBatteryQuery={versionAtLeast,supported,Query,qualityError,POLICY_CAPABILITY,QUALITY_MS,QUIET_QUALITY_MS,MAX_OPERATION_MS};if(typeof module!=='undefined')module.exports=root.ByBatteryQuery;
})(typeof globalThis!=='undefined'?globalThis:this);
