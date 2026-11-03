'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 let enabled=false,requests=[],fail=true,clock=0;
 const c={performance:{now:()=>clock},TextEncoder,AbortController,setTimeout,clearTimeout,Date,JSON,fetch:async(url,options)=>{
   requests.push({url,body:JSON.parse(options.body)});if(fail)throw Error('offline');return {ok:true,json:async()=>({ok:true,sequence:JSON.parse(options.body).sequence})};
 }};c.globalThis=c;vm.createContext(c);vm.runInContext(fs.readFileSync('web/monitor.js','utf8'),c);
 const m=new c.ByMonitor.Monitor({settings:async()=>({enabled:false,monitor_enabled:enabled})},'https://test.invalid','a'.repeat(32));
 m.capture({type:'device',device:{type:'status',product:'BafangReader',protocol:1,version:'0.4.1',ap_mac:'e0:72:a1:72:38:d9',can:'stopped'}});
 m.capture({type:'device',device:{type:'log',message:'off'}});await m.flush();assert.equal(requests.length,0);
 enabled=true;m.enable(true);
 for(let i=0;i<10000;i++)m.capture({type:'device',device:{type:'frame',seq:i}});
 assert.equal(m.sampled,9996);assert.equal(m.queue.length,4);
 for(let i=0;i<120;i++)m.capture({type:'device',device:{type:'log',message:'SDK '+i}});
 m.capture({type:'invalid_line',raw:'x'.repeat(60000)});assert(m.queue.length<=40);assert(m.lines.length<=100);assert(m.dropped>0);
 await m.flush();assert.equal(requests.length,1);assert(m.pending);const packet=JSON.stringify(requests[0].body);assert(Buffer.byteLength(packet)<32768);assert.equal(requests[0].body.device.can,'stopped');
 m.capture({type:'device',device:{type:'error',message:'later'}});clock=3600000;fail=false;await m.flush();
 assert.deepEqual(requests[1].body.events,requests[0].body.events,'Retry preserves diagnostic events');
 assert.equal(requests[1].body.device_age_ms,3600000,'Retry preserves original measurement age');assert.equal(requests[1].body.sequence,2);
 assert.equal(m.pending,null);assert(m.lastSent);assert.equal(m.error,'');
 m.capture({type:'device',device:{...m.device,uptime_us:2000000}});await m.flush();assert.equal(requests[2].body.sequence,3);assert.equal(requests[2].body.device_age_ms,0);assert(requests[2].body.events.some(e=>e.device?.message==='later'));
 let started;const ready=new Promise(r=>started=r);
 c.fetch=async(url,options)=>{requests.push({url});started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));};
 const sending=m.flush();await ready;enabled=false;m.enable(false);await sending;assert.equal(m.pending,null);const count=requests.length;await m.flush();assert.equal(requests.length,count);assert.equal(m.error,'');
 enabled=true;m.enable(true);m.device={product:'Other',protocol:1};await m.flush();assert.equal(requests.length,count);
 m.device={type:'status',product:'BafangReader',protocol:1,ap_mac:'e0:72:a1:72:38:d9'};m.support={runtime:{flashBusy:true},ready:()=>false,identityVerified:()=>false,snapshot:()=>({version:2,ready:false,updating:true}),receive(){}};
 c.fetch=async(url,options)=>{requests.push({url,headers:options.headers,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,sequence:JSON.parse(options.body).sequence})};};
 await m.flush('browser-usb',false);assert.equal(requests.at(-1).body.connected,false);assert.equal(requests.at(-1).body.control.updating,true);assert(!('X-Reader-Control' in requests.at(-1).headers));
 m.support.key='e'.repeat(64);await m.flush('browser-usb',false);assert.equal(requests.at(-1).headers['X-Reader-Control'],m.support.key);assert.equal(requests.at(-1).body.connected,false);assert.equal(requests.at(-1).body.control.ready,false);
 // Both bounded native hardware traces survive the monitor's ordinary2KiB truncation.
 const trace={type:'battery_tx_diagnostic',boot:'1234ABCD',rmt_trace:{channels:[{symbols_hex:'F'.repeat(512)},{symbols_hex:'0'.repeat(512)}]},gpio_trace:{test_padding:'x'.repeat(1800)}};
 m.capture({type:'device',device:trace});assert.equal(m.queue.at(-1).device.type,'battery_tx_diagnostic');
 m.capture({type:'device',device:{...trace,gpio_trace:{test_padding:'x'.repeat(5000)}}});assert.equal(m.queue.at(-1).type,'monitor_truncated');
 // Upload permission alone never enables monitoring.
 const off=new c.ByMonitor.Monitor({settings:async()=>({enabled:true,monitor_enabled:false})},'https://test.invalid','b'.repeat(32));off.device=m.device;const countOff=requests.length;await off.flush();assert.equal(requests.length,countOff);
 // The owner credential authenticates only the configured VPS bridge request.
 c.ByRemoteConsole={token:'private-synthetic-owner-key'};
 const trusted=new c.ByMonitor.Monitor({settings:async()=>({monitor_enabled:true})},'https://134.98.158.132:18443','c'.repeat(32));trusted.device=m.device;
 await trusted.flush();assert.equal(requests.at(-1).headers.Authorization,'Bearer private-synthetic-owner-key');assert(!JSON.stringify(requests.at(-1).body).includes(c.ByRemoteConsole.token));
 // Optional history can be paused by the receiver's disk reserve. Its live
 // receipt must advance this existing client to a fresh hardware STATUS,
 // rather than repeatedly sending the previous packet until USB appears stale.
 c.fetch=async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,headers:options.headers,body});return {ok:true,json:async()=>({ok:true,sequence:body.sequence,monitor_saved:false,storage_warning:'monitor_free_space_reserve'})};};
 trusted.device={...trusted.device,uptime_us:1000000};await trusted.flush();
 const reserveSequence=requests.at(-1).body.sequence;assert.equal(trusted.pending,null);assert.equal(trusted.error,'');
 trusted.device={...trusted.device,uptime_us:2000000};await trusted.flush();
 assert.equal(requests.at(-1).body.sequence,reserveSequence+1);assert.equal(requests.at(-1).body.device.uptime_us,2000000);assert.equal(trusted.pending,null);
 await m.flush('browser-usb',false);assert(!requests.at(-1).headers.Authorization,'No credential forwarding to another endpoint');
 console.log('PASS: monitor opt-in/OFF abort, bounded SDK queue, CAN sampling, size cap, retry identity, no other-device forwarding, honest disconnected heartbeat during firmware update');
})().catch(e=>{console.error(e);process.exitCode=1;});
