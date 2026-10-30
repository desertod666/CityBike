'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
let idb;try{idb=require('fake-indexeddb');}catch{idb=require('../qa/browser-test-deps/node_modules/fake-indexeddb');}
function environment(){
  let clock=1000,wall=Date.now(),next=1;const timers=new Map();
  class ClockDate extends Date{static now(){return wall;}}
  const c={console,TextEncoder,TextDecoder,ReadableStream,WritableStream,CompressionStream,Blob,Uint8Array,Uint32Array,DataView,crypto:webcrypto,indexedDB:new idb.IDBFactory(),IDBKeyRange:idb.IDBKeyRange,structuredClone,URL,URLSearchParams,AbortController,performance:{now:()=>clock},Date:ClockDate,btoa:x=>Buffer.from(x,'binary').toString('base64'),setTimeout:(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},navigator:{},location:new URL('https://reader.test/'),history:{replaceState(){}},window:{addEventListener(){}},document:{},ByMonitor:{Monitor:class{enable(v){this.enabled=v;}capture(){}snapshot(){return {};}}},BySupport:{Support:class{observe(){}snapshot(){return {};}}}};
  c.globalThis=c;vm.createContext(c);for(const file of ['store.js','transport.js','tuning.js','browser.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),c);
  return {c,timers,clock:v=>clock=v,wall:v=>wall=v};
}
async function runtime(){
  const e=environment(),r=await new e.c.ByBrowser.Runtime({connection:{transport:'webserial'}},null,{profiles:[]}).init({autoConnect:false}),commands=[];
  r.transport={connected:true,state:{type:'status',product:'BafangReader',boot:'B',can:'stopped',received:0,bitrate:250000,rx_sampling_250k:'TRIPLE',sampling_profiles:['DEFAULT','TRIPLE'],twai_tx_gpio:10,ctx_guard:{policy:'fixed_recessive',valid:true,level:1}},async poll(){return {...this.state};},async call(command){commands.push(command);if(command.startsWith('START'))this.state.can='running';if(command==='STOP')this.state.can='stopped';return {...this.state};},async drain(){return true;},release(){}};
  return {...e,r,commands};
}
const micro=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const watchdog=setTimeout(()=>{console.error('FAIL: lifecycle test did not finish');process.exitCode=1;},10000);
(async()=>{
  let {c,timers}=environment(),wire=[];
  const transport=new c.ByTransport.SerialTransport({});transport.open=true;transport.state={type:'status',boot:'B',can:'stopped',capabilities:['command_ids','stream_end']};transport.writer={async write(bytes){wire.push(new TextDecoder().decode(bytes).trim());}};
  let settled=false;const stop=transport.call('STOP').then(x=>{settled=true;return x;});await micro();
  const id=transport.pending.id;assert.match(wire[0],/^@[a-z0-9_]+ STOP$/);
  transport.receiveResult({type:'status',boot:'B',can:'stopped'});transport.receiveResult({type:'command_result',id:'OTHER',ok:true});await micro();assert(!settled,'Unsolicited status and another command cannot complete STOP');
  transport.receiveResult({type:'command_result',id,command:'STOP',ok:true,boot:'B',final_seq:3,status:{type:'status',boot:'B',can:'stopped',received:3}});assert.equal((await stop).received,3);assert(transport.lastCommand.stream_end);
  transport.state.capabilities=['command_ids'];const stale=transport.call('STATUS');await micro();const staleId=transport.pending.id;const timer=timers.get(transport.pending.timer);timer.fn();await assert.rejects(stale,/неизвестен/);transport.receiveResult({type:'command_result',id:staleId,command:'STATUS',ok:true,boot:'B',status:transport.state});await assert.rejects(transport.call('STOP'),/переподключите/);assert.equal(wire.length,2,'No further command after uncertain timeout');
  const meterEnv=environment(),meter=new meterEnv.c.ByTransport.SerialTransport({});meter.open=meter.connected=meter.verified=true;
  meter.state={...transport.state,boot:'METER',version:'0.6.8'};meter.writer={write:async()=>{}};
  meterEnv.c.ByReaderSelftest={meterAvailable:d=>d.version==='0.6.8'};
  const measure=meter.call('SELFTEST VOLTMETER ISOLATED');await micro();assert.equal(meterEnv.timers.get(meter.pending.timer).ms,12000);
  meter.receiveResult({type:'command_result',id:meter.pending.id,command:'SELFTEST VOLTMETER ISOLATED',ok:true,boot:'METER',status:meter.state});await measure;
  meter.state.version='0.6.7';await assert.rejects(meter.call('SELFTEST VOLTMETER ISOLATED'),/0.6.8/);
  let e=await runtime();await e.r.runTest(30);assert.equal(e.commands[0],'START 250000');assert.equal(e.r.countdown().remaining_ms,30000);const deadline=e.r.deadlineMono;e.clock(11000);await e.r.mark('Pedals',250000);assert.equal(e.r.deadlineMono,deadline,'Marks must not extend a fixed test');assert.equal(e.r.countdown().remaining_ms,20000);e.wall(1);assert.equal(e.r.countdown().remaining_ms,20000,'Wall-clock corrections must not affect countdown');
  e.clock(31000);let releaseStop;const original=e.r.transport.call.bind(e.r.transport);e.r.transport.call=async command=>{if(command==='STOP')await new Promise(resolve=>releaseStop=resolve);return original(command);};const finishing=e.r.finish('timer');await micro();assert.equal(e.r.countdown().phase,'finalizing');assert.equal(e.r.countdown().remaining_ms,0);releaseStop();await finishing;e.r.transport.call=original;assert.equal(e.r.countdown().phase,'idle');let session=(await e.r.store.all('sessions'))[0];assert.equal(session.status,'complete');assert.equal(session.finalization_verified,true);assert.equal(session.capture_integrity.physical_can_completeness,'unverified');
  await e.r.runTest(60);assert.equal(e.r.countdown().remaining_ms,60000);await e.r.finish();
  e=await runtime();await e.r.runTest(600);assert.equal(e.r.countdown().remaining_ms,600000);
  const longDeadline=e.r.deadlineMono;e.clock(301000);await e.r.mark('BMS update started',250000);assert.equal(e.r.deadlineMono,longDeadline);assert.equal(e.r.countdown().remaining_ms,300000);
  await e.r.finish('stop');session=(await e.r.store.all('sessions'))[0];assert.equal(session.status,'complete');assert.equal(session.test_duration_s,600);assert.equal(session.finalization_verified,true);
  for(const seconds of [0,61,601,3600,NaN,Infinity,'600'])await assert.rejects(e.r.runTest(seconds),/Выберите тест/);
  e=await runtime();await e.r.runTest(30);e.r.transport.call=async()=>{throw Error('USB timeout');};await e.r.finish('timer');session=(await e.r.store.all('sessions'))[0];assert.equal(session.status,'interrupted');assert.equal(session.reason,'stop_unconfirmed');assert.equal(session.finalization_verified,false);
  e=await runtime();await e.r.runTest(30);e.r.transport.drain=async()=>false;await e.r.finish();session=(await e.r.store.all('sessions'))[0];assert.equal(session.finalization_verified,false);assert.equal(session.status,'interrupted');
  const defaults=await e.r.store.settings();assert.equal(defaults.remote_support_enabled,false);assert.equal(defaults.monitor_enabled,false);assert.equal(defaults.manual_mode,true);await e.r.configure({enabled:true});assert.equal(e.r.settings.remote_support_enabled,false);assert.equal(e.r.monitor.enabled,false,'Upload permission must not enable monitoring');await e.r.configure({monitor_enabled:true});assert.equal(e.r.monitor.enabled,true);
  e=await runtime();e.r.transport.state.rx_sampling_250k='DEFAULT';const rawCall=e.r.transport.call.bind(e.r.transport);e.r.transport.call=async command=>{if(command.startsWith('SAMPLE ')){e.commands.push(command);e.r.transport.state.rx_sampling_250k=command.slice(7);return {...e.r.transport.state};}return rawCall(command);};
  await assert.rejects(e.r.setSampling('LATE'),/TRIPLE/);await e.r.setSampling('TRIPLE');assert.equal(e.r.device.rx_sampling_250k,'TRIPLE');assert.equal(e.commands.join(','),'SAMPLE TRIPLE','Changing sampling never starts CAN');
  e.r.transport.state.can='running';await assert.rejects(e.r.setSampling('TRIPLE'),/остановите/);assert.equal(e.commands.length,1);e.r.transport.state.can='stopped';e.r.transport.state.rx_sampling_250k=undefined;await assert.rejects(e.r.setSampling('DEFAULT'),/TRIPLE/);assert.equal(e.commands.length,1);
  const quality=e.r.captureQuality({boot:'B',received:100,bus_errors:10,uptime_us:1000000},{boot:'B',received:700,bus_errors:9010,uptime_us:31000000,rx_sampling_250k:'LATE',bitrate:250000});assert.equal(quality.errors_per_second,300);assert.equal(quality.frames_per_second,20);assert.equal(quality.sampling_profile,'LATE');assert.equal(quality.active_traffic_observed,true);assert.equal(quality.error_count_is_lost_frames,false);
  assert.equal(e.r.captureQuality({boot:'A'},{boot:'B'}),null);assert.equal(e.r.captureQuality({boot:'B',received:1,bus_errors:0,uptime_us:0},{boot:'B',received:1,bus_errors:0,uptime_us:30000000}).active_traffic_observed,false);
  // Profile sweeps were retired when TRIPLE/250k was fixed. Keep these
  // lifecycle tests on the supported API, rather than starting old sweeps.
  e=await runtime();await assert.rejects(e.r.api('/api/tuning/start',{duration:30}),/TRIPLE/);
  await assert.rejects(e.r.api('/api/bitrate/scan',{}),/250/);assert.equal(e.commands.length,0);
  console.log('PASS: command IDs, late replies and timeout quarantine; fixed 30/60 second countdown, marks, wall-clock changes, finalization fence, failed STOP/drain; independent permissions; fixed TRIPLE policy and per-test rates');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
