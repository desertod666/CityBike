/* Firmware writes are only called by the explicit browser install action. */
'use strict';
(() => {
  const layout = new Map([['bootloader.bin', [0, 0x8000]], ['partitions.bin', [0x8000, 0x1000]], ['firmware.bin', [0x10000, 0x200000]]]);
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  function newerVersion(next,current){
    if(typeof next!=='string'||typeof current!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(next)||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(current))return false;
    const a=next.split('.').map(Number),b=current.split('.').map(Number);
    for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];
    return false;
  }
  function validate(manifest) {
    if (manifest?.schema !== 1 || manifest.product !== 'BafangReader' || manifest.chip !== 'esp32c3' || manifest.flash_size !== '4MB' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw Error('Неверный пакет прошивки ридера');
    if (manifest.device_policy!=='any_esp32c3' && (!Array.isArray(manifest.allowed_macs) || !manifest.allowed_macs.length || manifest.allowed_macs.some(x => !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(x)))) throw Error('Нет проверенного адреса ридера');
    if (manifest.files?.length !== layout.size || new Set(manifest.files.map(f => f.name)).size !== layout.size) throw Error('Неполный пакет прошивки');
    for (const file of manifest.files) {
      const spec = layout.get(file.name);
      if (!spec || file.offset !== spec[0] || !Number.isInteger(file.size) || file.size <= 0 || file.size > spec[1] || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Неверный образ или адрес записи');
    }
    return manifest;
  }
  const permitted=(manifest,mac)=>/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(mac||'')&&(manifest?.device_policy==='any_esp32c3'||manifest?.allowed_macs?.includes(mac));
  async function download(fetcher = fetch, {signal} = {}) {
    const response = await fetcher('/firmware/manifest.json', {cache: 'no-store',signal});
    if (!response.ok) throw Error('Пакет прошивки сейчас недоступен');
    const manifestBytes = new Uint8Array(await response.arrayBuffer());
    const manifest = validate(JSON.parse(new TextDecoder().decode(manifestBytes))), files = [];
    for (const file of manifest.files) {
      const response = await fetcher('/firmware/' + file.name, {cache: 'no-store',signal});
      if (!response.ok) throw Error('Не удалось скачать ' + file.name);
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length !== file.size || await digest(data) !== file.sha256) throw Error('Проверка SHA-256 не пройдена: ' + file.name);
      files.push({data, address: file.offset});
    }
    return {manifest, files,manifest_sha256:await digest(manifestBytes)};
  }
  async function txRecessive(loader) {
    // ESP32-C3 pinned IDF 5.5 soc/gpio_reg.h: GPIO base0x60004000,
    // ENABLE +0x20, IN +0x3c. GPIO4 IO_MUX is0x60009014, input enable bit9.
    // Only the input-buffer bit may be enabled temporarily; never change output,
    // pull resistors or pin routing. Restore the original input-buffer bit.
    // The genuine SN65HVD230's open D input is recessive (TI table3).
    if(typeof loader.readReg!=='function')throw Error('Нет проверки CTX; обновление подключённого ридера отменено');
    const original=await loader.readReg(0x60009014),mux=(original>>>12)&7,wasEnabled=!!(original&512);
    if(![0,1].includes(mux)||(await loader.readReg(0x60004020)&16))throw Error('GPIO4 управляется выходом; запись отменена');
    let changed=false;
    try{
      if(!wasEnabled){if(typeof loader.writeReg!=='function')throw Error('Не прочитан вход GPIO4');await loader.writeReg(0x60009014,512,512);changed=true;if(!(await loader.readReg(0x60009014)&512))throw Error('Не включён вход GPIO4');}
      const samples=[];
      for(let i=0;i<3;i++){
        const enable=await loader.readReg(0x60004020),input=await loader.readReg(0x6000403c);
        samples.push({output_enabled:!!(enable&16),level:(input>>>4)&1,mux_function:mux,input_was_enabled:wasEnabled});
        if((enable&16)||!(input&16))throw Error('CTX/GPIO4 не подтверждён как свободный HIGH; запись отменена');
      }
      return samples;
    }finally{if(changed)await loader.writeReg(0x60009014,original&512,512);}
  }
  async function identify(loader) {
    // ROM identification only: no RAM stub, flash write, erase or eFuse change.
    await loader.detectChip('default_reset');
    if (loader.chip?.CHIP_NAME !== 'ESP32-C3') throw Error('Выбран другой чип; нужен ESP32-C3');
    if (loader.secureDownloadMode) throw Error('Защищённый режим загрузчика не поддерживается');
    const mac = (await loader.chip.readMac(loader)).toLowerCase();
    if (!/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(mac)) throw Error('Не удалось прочитать MAC платы');
    const security = await loader.getSecurityInfo();
    return {chip:'ESP32-C3',mac,secure_boot:!!security.parsedFlags.SECURE_BOOT_EN,flash_encryption:!!security.flashCryptCnt};
  }
  async function install(loader, bundle, md5, progress, {attachedBus=false,expectedMac} = {}) {
    validate(bundle.manifest);
    if (bundle.files?.length !== bundle.manifest.files.length) throw Error('Неполный набор скачанных файлов');
    // Revalidate immediately before any USB interaction, including a RAM stub.
    for (let i = 0; i < bundle.files.length; i++) {
      const file = bundle.files[i], expected = bundle.manifest.files[i];
      if (file.address !== expected.offset || file.data.length !== expected.size || await digest(file.data) !== expected.sha256) throw Error('Образ прошивки изменился после загрузки');
    }
    await loader.detectChip('default_reset');
    if (loader.chip?.CHIP_NAME !== 'ESP32-C3') throw Error('Выбран другой чип; запись отменена');
    if (loader.secureDownloadMode) throw Error('Защищённый режим загрузчика не поддерживается');
    const mac = (await loader.chip.readMac(loader)).toLowerCase();
    if (expectedMac !== undefined && mac !== expectedMac) throw Error('Подключена другая плата; выберите ESP32 заново');
    if (!permitted(bundle.manifest,mac)) throw Error('Это другой ESP32: ' + mac + '. Запись отменена');
    const security = await loader.getSecurityInfo();
    if (security.parsedFlags.SECURE_BOOT_EN || security.flashCryptCnt) throw Error('На чипе включена защита прошивки; запись отменена');
    loader.readerMacVerified=true;
    if (loader.chip.postConnect) await loader.chip.postConnect(loader);
    const tx_guard=attachedBus?{rom:await txRecessive(loader)}:null;
    await loader.runStub();
    if(attachedBus)tx_guard.stub=await txRecessive(loader);
    if (await loader.detectFlashSize() !== '4MB') throw Error('Размер flash отличается от 4 МБ; запись отменена');
    await loader.writeFlash({fileArray: bundle.files, flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep', eraseAll: false, compress: true, calculateMD5Hash: md5, reportProgress: progress});
    await loader.after('hard_reset');
    return {version: bundle.manifest.version, mac,tx_guard};
  }
  globalThis.ByFlash = {validate, permitted, download, identify, install, digest,txRecessive,newerVersion};
})();
