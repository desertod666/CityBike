'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
require(root+'/web/decoder.js');require(root+'/web/bafang-battery.js');require(root+'/web/can-live.js');require(root+'/web/spard-can.js');require(root+'/web/spard-information.js');
const {OfflineReader}=require(root+'/web/offline.js'),schema=JSON.parse(fs.readFileSync(root+'/web/decoder_reference.json'));
const clone=x=>JSON.parse(JSON.stringify(x));
const state=()=>({device:{product:'BafangReader',protocol:1,boot:'12345678',epoch:0,can:'stopped',ap_mac:'01:23:45:67:89:ab',version:'0.6.9'},network:{saved_ssid:'Reader',saved_channel:6}});
const frame=(seq,more={})=>({type:'frame',boot:'12345678',epoch:1,seq,t_us:seq*1000,id:'02F83201',data:'00000000C40E4E01',dlc:8,extended:true,rtr:false,...more});
(async()=>{
 let clock=0,serial=0,current=state(),pending=[],writes=[];
 const request=async(p,body)=>{if(body){writes.push([p,clone(body)]);if(body.command==='START 250000'){current.device.can='running';current.device.epoch++;}if(body.command==='STOP')current.device.can='stopped';return {ok:true};}
  if(p==='/api/state')return clone(current);if(p.startsWith('/api/frames')){const cursor=Number(p.split('=')[1]);return {boot:current.device.boot,latest:128,oldest:1,missed:0,frames:pending.filter(f=>f.seq>cursor).slice(0,64)};}throw Error(p);};
 const r=new OfflineReader(schema,{request,clock:()=>clock,newToken:()=>String(++serial).padStart(32,'0')});
 await r.tick();assert(r.transport.connected);assert.deepEqual(writes,[],'Loading must never start CAN');
 await r.api('/api/live/start');assert(r.owns&&r.liveViewing);assert.deepEqual(writes,[['/api/command',{command:'START 250000'}]]);
 pending=Array.from({length:128},(_,i)=>frame(i+1));await r.tick();assert.equal(r.cursor,64,'Cursor follows delivered frames, not batch latest');await r.tick();assert.equal(r.cursor,128);assert.equal(r.liveData.count,128);
 clock=2500;await r.tick();assert.equal(writes.at(-1)[0],'/api/lease');
 const before=r.cursor;r.feed({boot:'87654321',frames:[frame(129)]});assert.equal(r.cursor,before);r.feed({boot:'12345678',frames:Array(65).fill(frame(129))});assert.equal(r.cursor,before);
 const packet=Buffer.from('685AA500E10FDF0FE20FE10FE10FE10FE20FE10FE10FE10F000000000000000000000000121717BE05BE0565055E000000000000000000240000000000000000012B00CC5F2E010A6400080A1B100D0A0000009F02006A0BAB16','hex');
 let seq=129;for(let i=0;i<packet.length;i+=8){const raw=packet.subarray(i,i+8);r.feed({boot:'12345678',frames:[frame(seq++,{id:'00000666',extended:false,data:raw.toString('hex'),dlc:raw.length})]});}
 assert.equal(r.battery.fields.cells_mv.length,10);assert.equal(r.battery.fields.full_charge_capacity_mah,14700);
 current.device.boot='87654321';current.device.epoch=0;await r.refresh();assert(!r.owns&&!r.mayOwn);assert.equal(r.cursor,0);assert.equal(r.battery,null);assert.equal(r.liveData.frames.size,0);
 const mark=writes.length;await assert.rejects(r.api('/api/live/stop'));assert.equal(writes.length,mark,'Cannot stop another connection');
 await assert.rejects(r.saveWifi('bad\nname',6));assert.equal(writes.length,mark);
 current.device.can='running';await assert.rejects(r.saveWifi('Reader',6));assert.equal(writes.length,mark);
 current.device.can='stopped';await r.saveWifi('Reader 2',11);assert.deepEqual(writes.at(-1),['/api/command',{command:'WIFI 11 Reader 2'}]);
 assert(writes.every(([p,b])=>p==='/api/lease'||/^(START 250000|STOP|WIFI 11 Reader 2)$/.test(b.command)),'No actuator, bootloader or query commands');
 const fail=new OfflineReader(schema,{request:async(p,b)=>{if(b)throw Error('offline');return state();},newToken:()=> 'a'.repeat(32)});await fail.tick();await assert.rejects(fail.api('/api/live/start'));assert(!fail.owns&&fail.mayOwn);assert(!fail.operation);
 const html=fs.readFileSync(root+'/web/offline-index.html','utf8');assert(!/remote-console|spard-probe|flash-core|support\.js|files\.js|browser\.js/.test(html));assert(!html.includes('id="canLivePanel"'));
 let language='en';global.ByPreferences={snapshot:()=>({language})};const i18n=require(root+'/web/offline-i18n.js');assert.equal(i18n.t('Свободная память'),'Free memory');assert.equal(i18n.t('Температура батареи'),'Battery temperature');language='nb';assert.equal(i18n.t('Свободная память'),'Ledig minne');assert(!/[А-Яа-яЁё]/.test(i18n.t('Ридер ESP32')));
 console.log('PASS offline portal: passive boot, explicit read/stop ownership, 128-frame cursor, cells, reset, leases, failed commands, Wi-Fi validation and three-language subset');
})().catch(e=>{console.error(e);process.exit(1);});
