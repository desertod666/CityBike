'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class TestFile extends Blob{constructor(parts,name,options){super(parts,options);this.name=name;}}
function env({revoke=false,ambiguous=false,busy=false}={}){
 let clock=0,opened=0,closed=0,writes=[],queue=[],resolveRead,done=false,uploaded,checks=0;
 const packet=Buffer.alloc(90);packet[0]=0x68;packet[1]=90;packet[2]=165;packet[4]=0x20;packet[5]=0x10;packet[71]=10;for(let i=0;i<88;i++)packet[88]^=packet[i];packet[89]=0x16;
 const push=value=>{if(resolveRead){const resolve=resolveRead;resolveRead=null;resolve({value,done:false});}else queue.push(value);};
 const reader={read(){if(queue.length)return Promise.resolve({value:queue.shift(),done:false});if(done)return Promise.resolve({done:true});return new Promise(resolve=>resolveRead=resolve);},async cancel(){done=true;if(resolveRead){resolveRead({done:true});resolveRead=null;}},releaseLock(){}};
 const port={getInfo:()=>({usbVendorId:0x1a86,usbProductId:0x7523}),async open(options){if(busy)throw Error('Port is busy');opened++;assert.equal(options.baudRate,9600);assert.equal(options.dataBits,8);},readable:{getReader:()=>reader},writable:{getWriter:()=>({async write(bytes){writes.push(Buffer.from(bytes));if(bytes[3]===0)push(Uint8Array.from(packet));},releaseLock(){}})},async close(){closed++;}};
 const c=vm.createContext({console,Date,Uint8Array,File:TestFile,setTimeout,localStorage:{setItem(){}},performance:{now:()=>clock}});vm.runInContext(fs.readFileSync('web/spard-probe.js','utf8'),c);
 const options={serial:{getPorts:async()=>ambiguous?[port,port]:[port]},now:()=>clock,wait:async ms=>{clock+=ms;await Promise.resolve();},guard:async()=>{checks++;if(revoke&&writes.length>=2)throw Error('Permission revoked');},upload:async file=>{uploaded=JSON.parse(await file.text());return {id:'a'.repeat(32)};}};
 return {c,options,get writes(){return writes;},get opened(){return opened;},get closed(){return closed;},get uploaded(){return uploaded;}};
}
(async()=>{
 let e=env();const result=await e.c.BySpardProbe.run(e.options);assert.equal(result.valid_packets,3);assert.equal(e.opened,1);assert.equal(e.closed,1);assert.equal(e.writes.length,4);
 assert.equal(e.writes[0].toString('hex'),'680cf3025590d0030055d616');assert(e.writes.slice(1).every(x=>x.toString('hex')==='680cf3000000000000009716'));
 for(const bytes of e.writes){assert.equal(bytes[0],0x68);assert.equal(bytes[1]^bytes[2],255);assert.equal(bytes.slice(0,-2).reduce((a,b)=>a^b,0),bytes.at(-2));}
 assert.equal(e.uploaded.is_raw_can_log,false);assert.equal(e.uploaded.status,'complete');assert.equal(e.uploaded.packets.length,3);assert.equal(e.c.BySpardProbe.active,false);
 e=env({revoke:true});await assert.rejects(e.c.BySpardProbe.run(e.options),/Permission revoked/);assert.equal(e.writes.length,2);assert.equal(e.closed,1);assert.equal(e.uploaded.status,'failed');assert.equal(e.c.BySpardProbe.active,false);
 for(const opts of [{ambiguous:true},{busy:true}]){e=env(opts);await assert.rejects(e.c.BySpardProbe.run(e.options));assert.equal(e.writes.length,0);assert.equal(e.c.BySpardProbe.active,false);assert.equal(e.uploaded.status,'failed');}
 const parser=new e.c.BySpardProbe.Packets();parser.feed(Uint8Array.from([1,2,3,0x68,12,0xf3]));parser.feed(Uint8Array.from([0,0,0,0,0,0,0,0x97,0x16]));assert.equal(parser.packets.length,1);assert.equal(parser.packets[0].bytes,12);
 console.log('PASS stock probe: exact four allowlisted USB writes, 9600 8N1, 30s bound, stream reassembly, revocation cleanup, busy/ambiguous port refusal, separate USB log and failure receipt');
})().catch(e=>{console.error(e);process.exitCode=1;});
