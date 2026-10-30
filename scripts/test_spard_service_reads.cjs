'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class TestFile extends Blob{constructor(parts,name,options){super(parts,options);this.name=name;}}
const packet=(command,payload)=>{const b=Buffer.concat([Buffer.from([0x68,payload.length+6,(payload.length+6)^255,command]),payload,Buffer.from([0,0x16])]);b[b.length-2]=b.subarray(0,-2).reduce((a,x)=>a^x,0);return b;};
const info=packet(0,Buffer.alloc(84));info[71]=10;info[88]=info.subarray(0,88).reduce((a,x)=>a^x,0);
const identity=packet(0x30,Buffer.concat([Buffer.alloc(2),Buffer.from('SYNTHETIC-SN'.padEnd(32,'\0')),Buffer.from('TEST-MODEL'.padEnd(32,'\0'))]));
const parameters=packet(6,Buffer.alloc(240));
function env(fault=''){
 let clock=0,resolveRead,done=false,opened=0,closed=0,uploaded,queue=[];const writes=[];
 const push=b=>{if(resolveRead){const f=resolveRead;resolveRead=null;f({value:Uint8Array.from(b),done:false});}else queue.push(Uint8Array.from(b));};
 const reader={read(){if(queue.length)return Promise.resolve({value:queue.shift(),done:false});if(done)return Promise.resolve({done:true});return new Promise(f=>resolveRead=f);},async cancel(){done=true;resolveRead?.({done:true});resolveRead=null;},releaseLock(){}};
 const port={getInfo:()=>({usbVendorId:0x1a86,usbProductId:0x7523}),async open(){opened++;},async close(){closed++;},readable:{getReader:()=>reader},writable:{getWriter:()=>({releaseLock(){},async write(b){
   writes.push(Buffer.from(b).toString('hex'));
   if(b[3]===2){if(fault==='old_service')push(identity);if(fault==='old_info')push(info);return;}
   if(b[3]===0){
    if(['no_info','old_info'].includes(fault))return;
    const raw=Buffer.from(info);if(fault==='bad_info')raw[88]^=1;
    push(raw);if(fault==='partial_tail')push(Buffer.from([0x68,0x48]));return;
   }
   assert([6,0x30].includes(b[3]));
   if(['no_reply','old_service'].includes(fault))return;
   let raw=Buffer.from(b[3]===6?parameters:identity);
   if(fault==='bad_reply')raw[raw.length-2]^=1;
   if(fault==='wrong_reply')raw=Buffer.from(b[3]===6?identity:parameters);
   if(fault==='echo')raw=Buffer.from(b);
   if(fault==='partial_reply')raw=raw.subarray(0,-1);
   push(raw.subarray(0,11));push(raw.subarray(11));
  }})}};
 const c=vm.createContext({console,Date,Uint8Array,File:TestFile,setTimeout,performance:{now:()=>clock},localStorage:{setItem(){}}});
 for(const name of ['spard-information','spard-service','spard-probe'])vm.runInContext(fs.readFileSync('web/'+name+'.js','utf8'),c);
 if(fault==='no_decoder')vm.runInContext('globalThis.BySpardService=undefined',c);
 const options={serial:{getPorts:async()=>[port]},mode:'identity',duration:30,now:()=>clock,wait:async ms=>{clock+=ms;await Promise.resolve();},guard:async()=>{if(writes.length===2&&fault==='revoke')throw Error('Permission revoked');if(writes.length===2&&fault==='cancel')c.BySpardProbe.cancel();},upload:async file=>{uploaded=JSON.parse(await file.text());return {id:'a'.repeat(32)};}};
 return {c,options,writes,get opened(){return opened;},get closed(){return closed;},get uploaded(){return uploaded;},get clock(){return clock;}};
}
(async()=>{
 for(const mode of ['identity','parameters']){
  const e=env();await e.c.BySpardProbe.run({...e.options,mode});
  assert.equal(e.opened,1);assert.equal(e.closed,1);assert.equal(e.writes.length,3);
  assert.deepEqual(e.writes.slice(0,2),['680cf3025590d0030055d616','680cf3000000000000009716']);
  assert.equal(e.writes[2],mode==='identity'?'680cf330000000000000a716':'680cf3060000000000009116');
  const s=e.uploaded.service_read;assert.equal(s.kind,mode);assert.equal(s.normal_information.bytes,90);
  assert.equal(s.reply.bytes,mode==='identity'?72:246);assert.equal(s.decoded.status,'decoded');assert.equal(s.decoded.live_reply_validation,false);assert.equal(s.live_write_verified,false);
  assert.equal(e.uploaded.read_query_count,2);assert.equal(e.uploaded.capture_status,'complete');assert.equal(e.uploaded.is_raw_can_log,false);assert(e.clock<30000);
  assert.equal(e.c.BySpardProbe.active,false);
 }
 for(const fault of ['no_info','bad_info','old_info','partial_tail','revoke','cancel']){
  const e=env(fault);await assert.rejects(e.c.BySpardProbe.run(e.options));assert.equal(e.writes.length,2,fault);assert.equal(e.closed,1);assert.equal(e.uploaded.capture_status,'failed');assert.equal(e.uploaded.service_read.reply,null);
 }
 for(const fault of ['no_reply','bad_reply','wrong_reply','echo','partial_reply','old_service']){
  const e=env(fault);await assert.rejects(e.c.BySpardProbe.run(e.options));assert.equal(e.writes.length,3,fault);assert.equal(e.closed,1);assert.equal(e.uploaded.capture_status,'failed');assert.equal(e.uploaded.service_read.reply,null);assert.equal(e.c.BySpardProbe.active,false);
 }
 for(const options of [{mode:'write'},{mode:0x30},{mode:'31'},{mode:'identity',duration:120}]){
  const e=env();await assert.rejects(e.c.BySpardProbe.run({...e.options,...options}));assert.equal(e.writes.length,0);assert.equal(e.opened,0);
 }
 const e=env('no_decoder');await assert.rejects(e.c.BySpardProbe.run(e.options));assert.equal(e.opened,0);assert.equal(e.writes.length,0);
 console.log('PASS stock service reads: fixed00preflight+one06/30, exact response scope, no stale/echo/corrupt/partial acceptance, absent/failed preflight blocks request, cancellation/revocation, bounded timeout, no retries/writes/ESP commands');
})().catch(error=>{console.error(error);process.exitCode=1;});
