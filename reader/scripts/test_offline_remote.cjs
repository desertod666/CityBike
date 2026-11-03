'use strict';
const assert=require('node:assert/strict');
const {Remote,ActionLog}=require('../web/offline-remote.js');
function setup(){let at=0,tail=Promise.resolve();const calls=[],marks=[];
 const r={clock:()=>at,session:'a'.repeat(32),closed:false,transport:{connected:true},device:{boot:'12345678',can:'running',capabilities:['ble_remote_wifi_v1'],ble_remote:{enabled:false,connected:true,subscribed:true,button:0,transport:'wifi',session:'a'.repeat(16)}},newToken:()=> 'b'.repeat(32),serial:fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;},async refresh(){},async api(){this.device.can='running';},release(){this.remote.revoke();},async rawRequest(p,b){calls.push(b);if(b.action==='on')r.device.ble_remote.enabled=true;if(b.action==='off')r.device.ble_remote.enabled=false;if(b.action==='down')r.device.ble_remote.button=b.button;if(b.action==='up')r.device.ble_remote.button=0;return {ok:true,t_us:at*1000};}};
 const log={rows:[],async begin(){marks.push('persist-before-down');},mark(name){marks.push(name);},released(){},async tick(){},feed(){}};
 const remote=r.remote=new Remote(r,{log});return {r,remote,calls,marks,clock:n=>{at=n;}};
}
(async()=>{
 const a=setup();assert.equal(a.calls.length,0);await a.remote.on();assert(a.remote.armed);
 await a.remote.down(2);assert.equal(a.calls.at(-1).action,'down');assert.equal(a.calls.at(-1).button,2);assert.equal(a.marks[0],'persist-before-down');
 a.clock(200);await a.remote.tick();assert(a.calls.some(x=>x.action==='keep'));await a.remote.up();assert.equal(a.calls.at(-1).action,'up');assert(!a.remote.held);
 await assert.rejects(a.remote.down(3));await a.remote.down(3,true);assert(a.calls.at(-1).confirmed);await a.remote.up();
 await a.remote.down(2);a.clock(31000);await a.remote.tick();assert(!a.remote.held);const downCount=a.calls.filter(x=>x.action==='down').length;await a.remote.tick();assert.equal(a.calls.filter(x=>x.action==='down').length,downCount,'Timed out hold never replays DOWN');
 await a.remote.off();assert(!a.remote.armed);
 const b=setup();await b.remote.on();let release;const gate=new Promise(r=>release=r);b.r.serial(()=>gate);const down=b.remote.down(2);await Promise.resolve();const up=b.remote.up();release();await down.catch(()=>{});await up;assert(!b.calls.some(x=>x.action==='down'),'Release before queued dispatch cancels DOWN');
 const c=setup();await c.remote.on();c.remote.log.begin=async()=>{throw Error('quota');};await assert.rejects(c.remote.down(2));assert(!c.calls.some(x=>x.action==='down'),'No key without persisted log');
 const d=setup();let restore;d.r.refresh=()=>new Promise(r=>restore=r);const enabling=d.remote.on();d.remote.revoke();restore();await enabling;assert(!d.calls.length&&!d.remote.armed,'A cancelled ON never reaches the radio');
 const e=setup();await e.remote.on();e.r.device.boot='87654321';e.r.transport.connected=false;await e.remote.tick();assert(!e.remote.armed);
 let now=0,saved;const db={transaction(){const tx={objectStore(){return {put(value){saved=structuredClone(value);queueMicrotask(()=>tx.oncomplete());}};}};return tx;}};
 const log=new ActionLog(()=>now);log.database=async()=>db;log.feed({type:'frame',seq:1});now=5000;await log.begin(2,'12345678');assert(saved.rows.every(x=>x.seq!==1),'Expired pre-trigger frames excluded');assert(saved.rows.some(x=>x.action==='press_requested'));
 for(let n=0;n<9000;n++)log.feed({type:'frame',seq:n+2});await log.flush();assert.equal(log.rows.length,8192);assert(log.dropped>0);const data=(await log.download().text()).trim().split('\n').map(JSON.parse);assert(data.at(-1).incomplete);
 log.released(2);now+=3001;await log.tick();assert(!log.active);
 console.log('PASS offline BLE controls: persisted CAN window, momentary edges, power confirmation, delayed DOWN/ON cancellation, no replay, failed storage, loss of connection and bounded log');
})().catch(e=>{console.error(e);process.exit(1);});
