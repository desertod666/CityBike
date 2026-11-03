'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let bundle, busy = false, uploader, selectedPort = null, selectedInfo = null, refreshing = false;
  const terminal = [];
  const log = data => { terminal.push(String(data)); if(terminal.length>200)terminal.shift(); $('log').textContent = ($('log').textContent + (globalThis.ByI18n?.t?.(String(data))||String(data)) + '\n').slice(-16000); };
  const registered = () => selectedInfo && ByFlash.permitted(bundle?.manifest,selectedInfo.mac);
  function controls() {
    $('selectPort').disabled = busy || !bundle || !$('detached').checked || typeof ByFlash.identify !== 'function' || !!uploader?.updateHold;
    $('install').disabled = busy || !bundle || !$('detached').checked || !selectedPort || !registered() || selectedInfo.secure_boot || selectedInfo.flash_encryption;
    $('detached').disabled = busy;
    if(selectedInfo) $('deviceInfo').textContent = selectedInfo.chip + ' · MAC ' + selectedInfo.mac + (registered()?' · плата разрешена':' · плата не подходит для этого образа') + (selectedInfo.secure_boot||selectedInfo.flash_encryption?' · включена защита, запись недоступна':'');
  }
  function setBusy(value){busy=value;if(uploader)uploader.flashBusy=value;controls();}
  async function journal(kind,outcome) {
    try {
      const settings = uploader ? await uploader.store.settings() : null;
      if(!settings?.enabled)return;
      const report = await ByStore.Recorder.start(uploader.store,{kind,version:bundle?.manifest.version},settings);
      await report.write([{type:kind,host_utc:new Date().toISOString(),...outcome,terminal:terminal.slice(-60)}]);
      await report.finish('stop',true); uploader.upload().catch(()=>{});
    } catch(e) { log('Журнал: '+e.message); }
  }
  async function loaderFor(port) {
    const {ESPLoader,Transport,md5} = await import('/esp-flasher.js');
    const transport = new Transport(port,false);
    const loader = new ESPLoader({transport,baudrate:115200,romBaudrate:115200,debugLogging:false,terminal:{clean(){},writeLine:log,write:log}});
    return {loader,transport,md5};
  }
  $('detached').addEventListener('change',controls);
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='Идёт работа с ESP32';}});
  $('backLink').addEventListener('click',e=>{if(busy)e.preventDefault();});
  $('selectPort').addEventListener('click',async()=>{
    if(busy||!bundle||!$('detached').checked)return;
    selectedPort=null;selectedInfo=null;setBusy(true);
    let transport,outcome;
    try {
      // Keep the picker directly inside the click gesture, before storage/network work.
      const port = await navigator.serial.requestPort({filters:[{usbVendorId:0x303a,usbProductId:0x1001}]});
      const usb=port.getInfo();
      if(usb.usbVendorId!==0x303a||usb.usbProductId!==0x1001)throw Error('Нужен ESP32 USB Serial/JTAG');
      $('state').textContent='Читаю модель и MAC платы. Прошивка не записывается.';
      const work=await loaderFor(port);transport=work.transport;
      const info=await ByFlash.identify(work.loader);
      selectedPort=port;selectedInfo=info;outcome={success:true,...info,flash_written:false};
      log('ПЛАТА: '+info.chip+'; MAC: '+info.mac+'; прошивка не записывалась');
      $('state').textContent=registered()?'Плата определена. Нажмите «Прошить ESP32».':'Плата определена, но не подходит для этого образа ESP32-C3.';
    } catch(e) {
      outcome={success:false,error:String(e.message||e),flash_written:false};
      if(e.name!=='NotFoundError'){$('state').textContent='Плата не выбрана: '+e.message;log(e.message);}else $('state').textContent='Выбор устройства отменён. Можно выбрать ESP32 снова.';
    } finally {
      if(transport)await transport.disconnect().catch(()=>{});
      setBusy(false);if(outcome)await journal('firmware_identification',outcome);
    }
  });
  $('install').addEventListener('click',async()=>{
    if(busy||!bundle||!$('detached').checked||!selectedPort||!registered())return;
    setBusy(true);let transport,outcome;
    try {
      $('state').textContent='Запись прошивки. USB не отключать.';
      const work=await loaderFor(selectedPort);transport=work.transport;
      const result=await ByFlash.install(work.loader,bundle,work.md5,(index,written,total)=>{$('progress').value=((index+written/total)/bundle.files.length)*100;},{expectedMac:selectedInfo.mac});
      outcome={success:true,version:result.version,mac:result.mac,boot_verified:false};if(uploader)await uploader.store.setting('usbAutoConnect',true);$('progress').value=100;
      $('state').textContent='Прошивка '+result.version+' записана и проверена. Вернитесь к диагностике и подключите ESP32. Если USB не появился — нажмите RESET.';
    } catch(e) {outcome={success:false,error:String(e.message||e)};$('state').textContent='Обновление не завершено: '+e.message;log(e.message);}
    finally {if(transport)await transport.disconnect().catch(()=>{});selectedPort=null;setBusy(false);await journal('firmware_update',outcome);}
  });
  // Refresh a compatible package if firmware policy changes while the page is open.
  // Existing downloaded images are reused only when their full file metadata agrees.
  setInterval(async()=>{
    if(busy||refreshing||!selectedPort||!selectedInfo||registered())return;
    refreshing=true;
    try {
      const response=await fetch('/firmware/manifest.json',{cache:'no-store'});if(!response.ok)return;
      const manifest=ByFlash.validate(await response.json());
      if(!ByFlash.permitted(manifest,selectedInfo.mac))return;
      if(JSON.stringify(manifest.files)===JSON.stringify(bundle.manifest.files)&&manifest.version===bundle.manifest.version)bundle={...bundle,manifest};
      else bundle=await ByFlash.download();
      $('version').textContent=bundle.manifest.version;controls();
      if(registered())$('state').textContent='Новый ридер привязан. Можно нажать «Прошить ESP32».';
    }catch(e){log('Проверка привязки: '+e.message);}finally{refreshing=false;}
  },5000);
  (async()=>{
    try {
      if(!window.isSecureContext||!navigator.serial)throw Error('Нужен Chrome/Edge на ПК с разрешённым Web Serial и HTTPS');
      if(document.permissionsPolicy?.allowsFeature&&!document.permissionsPolicy.allowsFeature('serial'))throw Error('Политика браузера запрещает доступ к USB Serial');
      uploader=await new ByBrowser.Runtime({connection:{transport:'webserial'},app:{version:'0.4.9'}},null,null).init({autoConnect:false});
      if('serviceWorker'in navigator&&globalThis.ByAutoUpdate)await ByAutoUpdate.start(uploader,{notice:message=>{$('state').textContent=message;}});
      bundle=await ByFlash.download();$('version').textContent=bundle.manifest.version;
      $('state').textContent=typeof ByFlash.identify==='function'?'Файлы прошивки проверены. Подтвердите отсоединение CAN и нажмите «Выбрать ESP32 / COM».':'Обновляется интерфейс прошивки. Страница перезагрузится автоматически, когда остальные вкладки освободят ридер.';controls();
    }catch(e){$('state').textContent=e.message;}
  })();
})();
