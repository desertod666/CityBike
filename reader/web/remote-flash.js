/* Authorized reader-only update over the same already-granted USB port. */
'use strict';
(() => {
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  class RemoteFlash {
    constructor(runtime,load=()=>import('/esp-flasher.js')){this.runtime=runtime;this.load=load;}
    async install(job){
      const r=this.runtime;
      if(globalThis.ByEspRemote?.busy)throw Error('Сначала выключите пульт ESP32');
      if(location.origin!==ByBrowser.SERVER||r.wifi||!r.transport.connected||!r.transport.verified||r.recorder||r.tuner?.active||r.scan.active||r.operation||r.flashBusy||r.device.can!=='stopped'||r.device.rx_check?.state==='running')throw Error('Для обновления нужен свободный подтверждённый USB-ридер и остановленный CAN');
      if(!ByFlash.newerVersion(job.firmware_version,job.expected_version)||job.expected_version!==r.device.version||!/^[a-f0-9]{64}$/.test(job.manifest_sha256))throw Error('Не подтверждён пакет обновления');
      const priorAuto=r.autoConnect;let transport,loader,report,result,outcome;
      const terminal=[],log=value=>{terminal.push(String(value).slice(0,300));if(terminal.length>80)terminal.shift();};
      r.flashBusy=true;r.autoConnect=false;
      try{
        // Let a STATUS operation already in flight complete before releasing USB.
        while(r.ticking)await pause(20);
        const settings=await r.store.settings();r.settings=settings;if(settings.remote_support_enabled!==true||settings.manual_mode!==false||settings.monitor_enabled!==true)throw Error('Удалённая поддержка выключена или идут ручные испытания');
        report=await ByStore.Recorder.start(r.store,{...r.context(),kind:'firmware_update',support_job:job.id,from:r.device.version,target:job.firmware_version,attached_bus:true},settings);
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
        let bundle;try{bundle=await ByFlash.download(fetch,{signal:controller.signal});}finally{clearTimeout(timer);}
        if(bundle.manifest.version!==job.firmware_version||bundle.manifest_sha256!==job.manifest_sha256)throw Error('Пакет прошивки изменился; запись отменена');
        const library=await this.load();
        const stopped=await r.transport.call('STOP');r.device=r.transport.state;
        if(stopped.can!=='stopped'||stopped.boot!==job.expected_boot)throw Error('Состояние ридера изменилось до обновления');
        const permissions=await r.store.settings();r.settings=permissions;if(permissions.remote_support_enabled!==true||permissions.manual_mode!==false||permissions.monitor_enabled!==true||job.expires_at<Date.now()/1000)throw Error('Разрешение на обновление отозвано до записи');
        const port=r.transport.port;
        await r.transport.close();
        transport=new library.Transport(port,false);
        loader=new library.ESPLoader({transport,baudrate:115200,romBaudrate:115200,debugLogging:false,terminal:{clean(){},write:log,writeLine:log}});
        const writeFlash=loader.writeFlash.bind(loader);
        loader.writeFlash=async options=>{const current=await r.store.settings();r.settings=current;if(current.remote_support_enabled!==true||current.manual_mode!==false||current.monitor_enabled!==true||job.expires_at<Date.now()/1000)throw Error('Разрешение отозвано до физической записи');return writeFlash(options);};
        r.support.last={id:job.id,kind:'flash',state:'started',phase:'write'};
        r.monitor.capture({type:'support_flash',state:'started',target:job.firmware_version,host_utc:new Date().toISOString()});
        result=await ByFlash.install(loader,bundle,library.md5,()=>{}, {attachedBus:true});
        await transport.disconnect().catch(()=>{});transport=null;
        r.support.last={id:job.id,kind:'flash',state:'started',phase:'verify_boot'};
        const until=Date.now()+45000;
        while(Date.now()<until){
          // Once the write starts, complete recovery and verification even if permission is revoked.
          // Revocation prevents the next job; it must not interrupt a flash write.
          r.transport.retryAt=0;
          const status=await r.transport.restore();
          if(status){r.device=status;if(status.version!==job.firmware_version||status.can!=='stopped')throw Error('После обновления пришла другая версия или CAN не остановлен');outcome={success:true,boot_verified:true,...result,boot:status.boot};break;}
          await pause(1000);
        }
        if(!outcome)throw Error('Файлы записаны; USB после перезапуска пока не подтверждён');
        return outcome;
      }catch(e){
        outcome={success:false,boot_verified:false,files_written:!!result,error:String(e.message||e),tx_guard:result?.tx_guard};
        if(loader?.readerMacVerified&&!result)try{await loader.after('hard_reset');}catch{}
        throw e;
      }finally{
        if(transport)await transport.disconnect().catch(()=>{});
        if(report)try{await report.write([{type:'firmware_result',host_utc:new Date().toISOString(),...outcome,terminal}]);await report.finish('stop',true);}catch(e){r.uploadError='Журнал обновления: '+e.message;}
        r.flashBusy=false;r.autoConnect=priorAuto;
      }
    }
  }
  globalThis.ByRemoteFlash={RemoteFlash};
})();
