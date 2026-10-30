'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
global.ByStore={uuid:()=> '0123456789abcdef0123456789abcdef'};
require('../web/transport.js');require('../web/browser.js');
(async()=>{
 const r=new ByBrowser.Runtime({connection:{},app:{}},null,null),commands=[];
 r.settings={duration:60};
 const state={product:'BafangReader',protocol:1,boot:'ABCD1234',can:'stopped',bitrate:0,rx_sampling_250k:'DEFAULT',sampling_profiles:['DEFAULT','TRIPLE'],rx_check:{state:'idle'},twai_tx_gpio:10,ctx_guard:{policy:'fixed_recessive',valid:true,level:1}};
 r.transport={connected:true,poll:async()=>({...state}),call:async c=>{commands.push(c);if(c==='SAMPLE TRIPLE')state.rx_sampling_250k='TRIPLE';else if(c==='START 250000'){state.can='running';state.bitrate=250000;}else if(c==='STOP')state.can='stopped';else throw Error(c);return {...state};},drain:async()=>true};
 await r.liveStart();assert.deepEqual(commands,['SAMPLE TRIPLE','START 250000']);assert(r.liveViewing);
 await assert.rejects(r.begin(500000),/250/);assert.equal(commands.length,2,'Invalid rate must not interrupt running view');
 await assert.rejects(r.setSampling('DEFAULT'),/TRIPLE/);await assert.rejects(r.api('/api/tuning/start',{duration:30}),/TRIPLE/);await assert.rejects(r.api('/api/bitrate/scan',{}),/250/);
 await r.liveStop();commands.length=0;await r.liveStart();assert.deepEqual(commands,['START 250000']);
 for(const c of ['START 125000','START 500000','SAMPLE DEFAULT','SAMPLE SP625','CAN TX'])assert(!ByTransport.allowed(c),c);
 assert(ByTransport.allowed('SAMPLE TRIPLE'));assert(ByTransport.allowed('START 250000'));
 for(const mac of ['02:13:24:35:46:58','a4:cf:12:ab:cd:ee']){
  let currentMac=mac,controller;const sent=[];
  const status=()=>({type:'status',product:'BafangReader',protocol:1,ap_mac:currentMac,boot:'A1B2C3D4',can:'stopped',received:0});
  const port={getInfo:()=>({usbVendorId:0x303a,usbProductId:0x1001}),async open(){this.readable=new ReadableStream({start(c){controller=c;}});this.writable=new WritableStream({write(b){sent.push(new TextDecoder().decode(b).trim());controller.enqueue(new TextEncoder().encode(JSON.stringify(status())+'\n'));}});},async setSignals(){},async close(){}};
  Object.defineProperty(global,'navigator',{configurable:true,value:{serial:{getPorts:async()=>[port]}}});
  const t=new ByTransport.SerialTransport({wire:async()=>{},event:async()=>{},message:async()=>{},lost(){}});await t.connect({prompt:false});assert(t.verified);assert.equal(t.expectedMac,mac);assert(!sent.some(c=>c.startsWith('START')));
  currentMac='02:00:00:00:00:02';await assert.rejects(t.poll());assert(!t.verified);await t.close();
 }
 const c={crypto:webcrypto,Uint8Array,TextDecoder,Map,Set,Error};c.globalThis=c;vm.createContext(c);vm.runInContext(fs.readFileSync('web/flash-core.js','utf8'),c);
 const data=new Uint8Array([1,2,3]),files=[];for(const[name,offset]of [['bootloader.bin',0],['partitions.bin',0x8000],['firmware.bin',0x10000]])files.push({name,offset,size:3,sha256:await c.ByFlash.digest(data)});
 const manifest={schema:1,product:'BafangReader',chip:'esp32c3',flash_size:'4MB',version:'0.4.9',device_policy:'any_esp32c3',files};c.ByFlash.validate(manifest);
 for(const mac of ['02:13:24:35:46:58','a4:cf:12:ab:cd:ee'])assert(c.ByFlash.permitted(manifest,mac));
 let writes=0;const loader={chip:{CHIP_NAME:'ESP32-C3',readMac:async()=> '02:00:00:00:00:04'},detectChip:async()=>{},getSecurityInfo:async()=>({parsedFlags:{SECURE_BOOT_EN:false},flashCryptCnt:0}),writeFlash:async()=>writes++};
 await assert.rejects(c.ByFlash.install(loader,{manifest,files:files.map(f=>({data,address:f.offset}))},()=>'',()=>{},{expectedMac:'02:00:00:00:00:02'}));assert.equal(writes,0);
 console.log('PASS fixedTRIPLE250 starts/reconnect, no rate/sweep mutations, two unregistered USB MACs, selected-device swap rejection, universalC3 flasher with selected-board binding');
})().catch(e=>{console.error(e);process.exitCode=1;});
