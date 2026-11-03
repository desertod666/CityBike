'use strict';
const assert=require('node:assert/strict');globalThis.ByStore={uuid:()=> 'a'.repeat(32)};require('../web/browser.js');
(async()=>{
 const r=new ByBrowser.Runtime({connection:{}},null,null),commands=[];
 r.settings={remote_support_enabled:true,manual_mode:false,monitor_enabled:true};
 r.device={boot:'1234ABCD',ap_mac:'02:00:00:00:00:01',can:'stopped',rx_sampling_250k:'TRIPLE',twai_tx_gpio:10,ctx_guard:{policy:'fixed_recessive',valid:true,level:1}};
 r.transport={connected:true,poll:async()=>({...r.device}),call:async c=>{commands.push(c);return {...r.device,can:c.startsWith('START')?'running':'stopped'};}};
 const resume=()=>({boot:r.device.boot,mac:r.device.ap_mac,remote:false,expires_at_ms:Date.now()+60000});
 r.updateResume=resume();await r.resumeLiveAfterUpdate();assert.deepEqual(commands,['START 250000']);assert(r.liveViewing);assert.equal(r.updateResume,null);
 for(const mutate of [v=>v.boot='FFFFFFFF',v=>v.mac='02:00:00:00:00:02',v=>v.expires_at_ms=Date.now()-1,v=>v.expires_at_ms=Date.now()+3600000]){
  r.device.can='stopped';r.liveViewing=false;r.updateResume=resume();mutate(r.updateResume);await r.resumeLiveAfterUpdate();assert.equal(commands.length,1);assert.equal(r.updateResume,null);
 }
 r.updateResume=resume();r.transport.connected=false;await r.resumeLiveAfterUpdate();assert(r.updateResume,'Retain intent while USB is reconnecting');r.transport.connected=true;await r.resumeLiveAfterUpdate();assert.equal(commands.length,2);
 r.device.can='stopped';r.updateResume={...resume(),remote:true};r.settings.manual_mode=true;await r.resumeLiveAfterUpdate();assert.equal(commands.length,2,'Revoked remote permission blocks resume');
 r.updateResume=resume();r.device.ble_remote={enabled:true};await r.resumeLiveAfterUpdate();assert.equal(commands.length,2,'Never interrupt a BLE remote session');
 console.log('PASS passive update resume: same boot/MAC only, expires, waits for USB, respects permission and BLE, starts only fixed passive CAN');
})().catch(e=>{console.error(e);process.exitCode=1;});
