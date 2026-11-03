/* Bounded stock-adapter diagnostic. USB packets are not labelled raw CAN frames. */
'use strict';
(() => {
  const VID=0x1a86,PID=0x7523;
  const CONFIG=Uint8Array.from([0x68,0x0c,0xf3,0x02,0x55,0x90,0xd0,0x03,0x00,0x55,0xd6,0x16]);
  const READ=Uint8Array.from([0x68,0x0c,0xf3,0,0,0,0,0,0,0,0x97,0x16]);
  // CheckIntoQueue0041585A/004162F0 + sendReadCMD00419C4E, supplied host EXE.
  // Fixed normal-service reads only; no write, storage, reset or update opcode.
  const SERVICE_READS=Object.freeze({
    identity:{command:0x30,bytes:72,request:[0x68,0x0c,0xf3,0x30,0,0,0,0,0,0,0xa7,0x16]},
    parameters:{command:6,bytes:246,request:[0x68,0x0c,0xf3,6,0,0,0,0,0,0,0x91,0x16]}
  });
  const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
  let active=false,cancelled=false,last=null,latestInformation=null;
  let progress={phase:'idle',duration_s:0,deadline_mono:null,received_bytes:0,request_count:0},clock=()=>performance.now();
  const notify=(type,detail)=>{if(typeof window!=='undefined'&&typeof CustomEvent!=='undefined')window.dispatchEvent(new CustomEvent(type,{detail}));};
  const snapshot=()=>({...progress,active,remaining_ms:active&&progress.deadline_mono!==null?Math.max(0,progress.deadline_mono-clock()):0,latest_information:latestInformation});
  class Packets {
    constructor(onPacket=()=>{}){this.buffer=[];this.packets=[];this.discarded=0;this.onPacket=onPacket;}
    feed(bytes){this.buffer.push(...bytes);let offset=0;while(this.buffer.length-offset>=3){
      const b=this.buffer,n=b[offset+1];if(b[offset]!==0x68||n<6||(n^b[offset+2])!==255){offset++;this.discarded++;continue;}
      if(b.length-offset<n)break;
      const raw=b.slice(offset,offset+n);let xor=0;for(const x of raw.slice(0,-2))xor^=x;
      if(raw[n-1]!==0x16||xor!==raw[n-2]){offset++;this.discarded++;continue;}
      const packet={bytes:n,raw_hex:hex(raw),checksum_valid:true};this.packets.push(packet);this.onPacket(packet);offset+=n;
    }this.buffer=this.buffer.slice(offset);}
  }
  const defaultWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function run({serial=navigator.serial,guard=async()=>{},update=()=>{},now=()=>performance.now(),wait=defaultWait,upload,duration=30,mode='information',context}={}){
    if(!['information','listen','identity','parameters'].includes(mode))throw Error('Неизвестный режим адаптера');
    if(![30,120].includes(duration))throw Error('Проверка адаптера: 30 или 120 секунд');
    const service=Object.prototype.hasOwnProperty.call(SERVICE_READS,mode)?SERVICE_READS[mode]:null;
    if(service&&(duration!==30||!globalThis.BySpardService?.decode||!globalThis.BySpardInformation?.decode))throw Error('Обновите страницу для дополнительного чтения Spard');
    let paired;
    if(context!==undefined){const p=context?.paired_probe;if(!p||Object.keys(context).length!==1||Object.keys(p).sort().join(',')!=='can_duration_s,can_session_id,job_id,mode,sampling,schema,stock_duration_s'||p.schema!==1||!/^[a-f0-9]{32}$/.test(p.job_id||'')||!/^[a-f0-9]{32}$/.test(p.can_session_id||'')||p.can_duration_s!==60||p.stock_duration_s!==30||p.mode!=='information'||p.sampling!=='DEFAULT'||duration!==30||mode!=='information')throw Error('Неверный контекст парного теста');paired={...p};}
    if(globalThis.ByAutoUpdate?.holding)throw Error('Сайт обновляется; дождитесь подключения');
    if(active)throw Error('Штатный адаптер уже занят диагностикой');
    const oldResult=globalThis.document?.getElementById('spardServiceResult');
    if(oldResult){oldResult.hidden=true;oldResult.textContent='';}
    active=true;cancelled=false;clock=now;progress={phase:'opening',mode,duration_s:duration,deadline_mono:null,received_bytes:0,request_count:0};notify('spard-probe-progress',snapshot());
    let port,reader,writer,readTask,opened=false,closing=false,readFailure=null,bytes=0,recorded=0,failure=null,uploadOk=false,uploadFailure=null;
    const events=[],started_utc=new Date().toISOString();let origin=now();
    progress.started_utc=started_utc;
    const parser=new Packets(packet=>{packet.session_started_utc=started_utc;packet.received_utc=new Date().toISOString();packet.elapsed_ms=Math.max(0,now()-origin);if(packet.bytes===90&&packet.raw_hex.slice(6,8)==='00'){latestInformation={...packet};notify('spard-information',latestInformation);}});
    const serviceRead=service?{kind:mode,normal_information:null,reply:null,decoded:null,live_write_verified:false}:null;
    const emit=(type,fields={})=>events.push({type,elapsed_ms:Math.max(0,now()-origin),...fields});
    const status=text=>{update(text);const e=typeof document!=='undefined'&&document.getElementById('spardAdapterStatus');if(e)e.textContent=text;};
    const permission=async()=>{if(cancelled)throw Error('Диагностика адаптера остановлена');await guard();if(globalThis.ByAutoUpdate?.holding)throw Error('Сайт обновляется; дождитесь подключения');if(cancelled)throw Error('Диагностика адаптера остановлена');if(readFailure)throw Error('Чтение адаптера: '+readFailure);};
    const saveLast=()=>{progress.cache_saved=false;try{if(typeof localStorage!=='undefined'){localStorage.setItem('citybike-spard-probe-last',JSON.stringify(last));progress.cache_saved=true;}}catch{}};
    try{
      await permission();
      const ports=(await serial.getPorts()).filter(p=>{const i=p.getInfo();return i.usbVendorId===VID&&i.usbProductId===PID;});
      if(ports.length!==1)throw Error(ports.length?'Найдено несколько CH340. Оставьте подключённым один штатный адаптер.':'Сначала нажмите «Определить адаптер Spard» и выберите COM4.');
      port=ports[0];status('Открываю штатный адаптер. Программа Spard должна освободить COM4…');
      await permission();await port.open({baudRate:9600,dataBits:8,stopBits:1,parity:'none',flowControl:'none',bufferSize:65536});opened=true;
      origin=now();progress.phase='reading';progress.deadline_mono=origin+duration*1000;reader=port.readable.getReader();writer=port.writable.getWriter();emit('opened',{baudrate:9600,usb_vid:'1A86',usb_pid:'7523'});
      readTask=(async()=>{try{while(true){const {value,done}=await reader.read();if(done){if(!closing)readFailure='USB-поток адаптера закрыт';break;}if(!value?.length)continue;bytes+=value.length;progress.received_bytes=bytes;const kept=value.subarray(0,Math.max(0,2*1024*1024-recorded));recorded+=kept.length;if(kept.length)emit('usb_rx',{bytes:kept.length,data_hex:hex(kept),...(kept.length!==value.length?{received_chunk_bytes:value.length,truncated:true}:{})});if(kept.length!==value.length)throw Error('Достигнут предел записи USB; не сохранено '+(bytes-recorded)+' байт');parser.feed(kept);}}catch(error){if(!closing)readFailure=String(error.message||error);}})();
      let configured=false,sent=0,nextRead=10000,normalAt=null,normalStart=0,serviceAt=null,serviceStart=0;
      const queryBudget=mode==='information'?(duration-15)/5:0;
      while(now()-origin<duration*1000){
        await permission();if(readFailure)throw Error('Чтение адаптера: '+readFailure);
        const elapsed=now()-origin;
        if(!configured&&elapsed>=5000){await permission();await writer.write(CONFIG);emit('usb_tx',{purpose:'stock_adapter_CAN250k_configuration',data_hex:hex(CONFIG)});configured=true;}
        if(configured&&sent<queryBudget&&elapsed>=nextRead){await permission();await writer.write(READ);emit('usb_tx',{purpose:'stock_read_information',data_hex:hex(READ)});sent++;progress.request_count=sent;nextRead=now()-origin+5000;}
        if(service&&configured){
          if(normalAt===null&&elapsed>=10000){
            await permission();normalAt=now()-origin;normalStart=parser.packets.length;
            await writer.write(READ);emit('usb_tx',{purpose:'stock_normal_information_preflight',data_hex:hex(READ)});
            sent++;progress.request_count=sent;
          }
          if(normalAt!==null&&!serviceRead.normal_information){
            const candidate=parser.packets.slice(normalStart).find(p=>p.elapsed_ms>=normalAt&&p.elapsed_ms-normalAt<=2000&&p.bytes===90&&globalThis.BySpardInformation.decode(p.raw_hex).status==='decoded');
            if(candidate)serviceRead.normal_information={...candidate};
            else if(now()-origin-normalAt>=2000)throw Error('Обычный ответ батареи не получен; дополнительный запрос не отправлен');
          }
          if(serviceRead.normal_information&&serviceAt===null){
            await permission();
            if(parser.buffer.length)throw Error('Незавершённый ответ адаптера; дополнительный запрос не отправлен');
            serviceAt=now()-origin;serviceStart=parser.packets.length;
            const request=Uint8Array.from(service.request);
            await writer.write(request);emit('usb_tx',{purpose:'stock_read_'+mode,data_hex:hex(request)});
            sent++;progress.request_count=sent;
          }
          if(serviceAt!==null){
            for(const packet of parser.packets.slice(serviceStart)){
              if(packet.elapsed_ms<serviceAt||packet.elapsed_ms-serviceAt>5000||packet.bytes!==service.bytes)continue;
              const decoded=globalThis.BySpardService.decode(packet.raw_hex,{normalServiceContext:true,expectedCommand:service.command});
              if(decoded.status!=='decoded')continue;
              serviceRead.reply={...packet};serviceRead.decoded=decoded;break;
            }
            if(serviceRead.reply){notify('spard-service',serviceRead);break;}
            if(now()-origin-serviceAt>=5000)throw Error('Полный ответ на дополнительный запрос Spard не получен');
          }
        }
        status((mode==='listen'?'Наблюдение линии · осталось ':'Штатный адаптер · осталось ')+Math.ceil((duration*1000-elapsed)/1000)+' с · принято '+bytes+' байт · целых пакетов '+parser.packets.length);
        await wait(Math.min(500,Math.max(0,duration*1000-(now()-origin))));
      }
      emit('capture_end',{read_queries:sent,received_bytes:bytes});progress.phase='saving';
    }catch(error){failure=String(error.message||error);emit('capture_error',{message:failure});}
    finally{
      closing=true;
      if(reader){try{await reader.cancel();}catch{}try{await readTask;}catch{}try{reader.releaseLock();}catch{}}
      if(writer){try{writer.releaseLock();}catch{}}
      if(opened)try{await port.close();}catch(error){const message=String(error.message||error);emit('close_error',{message});if(!failure)failure=message;}
      if(readFailure&&!failure)failure=readFailure;
      progress.phase=failure?'failed':'uploading';
      if(service&&!serviceRead.reply&&!failure)failure='Полный ответ на дополнительный запрос Spard не получен';
      last={schema:1,mode,...(service?{service_read:serviceRead}:{}),...(paired?{context:{paired_probe:paired}}:{}),hardware_listen_only:'not_verified',duration_s:duration,read_query_count:progress.request_count,status:failure?'failed':'complete',capture_status:failure?'failed':'complete',upload_status:'pending',error:failure,kind:'spard_adapter_usb_diagnostic',source:'stock_adapter_USB_serial',is_raw_can_log:false,started_utc,ended_utc:new Date().toISOString(),usb_vid:'1A86',usb_pid:'7523',serial_baudrate:9600,configured_can_bitrate:250000,received_bytes:bytes,recorded_bytes:recorded,dropped_bytes:bytes-recorded,capture_truncated:recorded!==bytes,packets:parser.packets,unparsed_bytes:parser.discarded,partial_hex:hex(parser.buffer),events};
      saveLast();
    }
    try{
    const file=new File([JSON.stringify(last,null,2)+'\n'],'Spard-USB-probe-'+Date.now()+'.json',{type:'application/json'});
    const receipt=upload?await upload(file):await new ByFiles.FileUploader().send(file);
    uploadOk=true;last.upload_status='complete';last.receipt=receipt;saveLast();
    if(failure)throw Error(failure+' · диагностический лог отправлен, код '+receipt.id);
    status((mode==='listen'?'Наблюдение линии завершено:':'Проверка адаптера завершена:')+' '+last.received_bytes+' байт, '+last.packets.length+' целых пакетов. Лог отправлен, код '+receipt.id);
    return {receipt,received_bytes:last.received_bytes,valid_packets:last.packets.length};
    }catch(error){if(!uploadOk){uploadFailure=String(error.message||error);last.upload_status='failed';last.upload_error=uploadFailure;last.status='upload_failed';last.error=failure?failure+' · Отправка: '+uploadFailure:uploadFailure;saveLast();status('Не удалось отправить диагностический лог: '+uploadFailure);}throw error;}finally{active=false;progress.phase=failure||uploadFailure?'failed':'complete';notify('spard-probe-progress',snapshot());}
  }
  globalThis.BySpardProbe={run,Packets,snapshot,get active(){return active;},get last(){return last;},cancel(){cancelled=true;}};
  if(typeof document!=='undefined'){
    window.addEventListener('spard-service',event=>{
      const box=document.getElementById('spardServiceResult'),data=event.detail?.decoded;
      if(!box||data?.status!=='decoded')return;
      box.hidden=false;box.textContent=JSON.stringify({source:'stock_adapter_USB_serial',kind:event.detail.kind,received_utc:event.detail.reply.received_utc,session_started_utc:event.detail.reply.session_started_utc,continuous_reading:false,decoded:data},null,2);
    });
    const button=document.getElementById('probeSpardAdapter');
    button?.addEventListener('click',async()=>{const s=document.getElementById('spardAdapterStatus');button.disabled=true;try{
      if(typeof browserRuntime!=='undefined'&&(browserRuntime?.recorder||browserRuntime?.tuner?.active||browserRuntime?.flashBusy))throw Error('Сначала завершите текущий тест ESP32');
      const box=document.getElementById('spardServiceResult');if(box){box.hidden=true;box.textContent='';}
      const mode=document.getElementById('spardReadMode')?.value||'information';
      await run({mode});
    }catch(error){s.textContent=String(error.message||error)+' · Если COM4 занят, закройте его в Spard.';}finally{button.disabled=false;}});
    document.getElementById('listenSpardAdapter')?.addEventListener('click',async()=>{const s=document.getElementById('spardAdapterStatus');try{
      if(typeof browserRuntime!=='undefined'&&(browserRuntime?.recorder||browserRuntime?.tuner?.active||browserRuntime?.flashBusy))throw Error('Сначала завершите текущий тест ESP32');
      await run({mode:'listen'});
    }catch(error){s.textContent=String(error.message||error);}});
    document.getElementById('stopSpardProbe')?.addEventListener('click',()=>{cancelled=true;});
    window.addEventListener('beforeunload',e=>{if(active){e.preventDefault();e.returnValue='Проверка адаптера ещё идёт';}});
  }
})();
