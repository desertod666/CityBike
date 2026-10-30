'use strict';
const assert=require('node:assert/strict');let counter=0;globalThis.ByStore={uuid:()=> (++counter).toString(16).padStart(32,'0')};require('../web/esp-remote.js');
const {Input,Executor}=ByEspRemote;
(async()=>{
 const calls=[],input=new Input({send:async v=>{calls.push(v);return {};}});
 await input.on();await assert.rejects(input.down(3),/Подтвердите/);assert.equal(calls.some(c=>c.action==='down'),false);
 await input.down(2);await input.tick();await input.tick();await input.up();await input.tick();assert.deepEqual(calls.map(v=>v.action),['on','down','keep','keep','up','ping']);assert.deepEqual(calls.map(v=>v.seq),[1,2,3,4,5,6]);await input.off();assert(!input.armed&&!input.held);
 // A stalled heartbeat must neither delay UP nor deliver a queued DOWN/KEEP.
 let finishPing,released=false,clock=0;const delayed=[];
 const queued=new Input({clock:()=>clock,send:async v=>{delayed.push({...v,afterRelease:released});if(v.action==='ping')await new Promise(r=>finishPing=r);return {handset:{server_time_ms:1700000000000+clock}};}});
 await queued.on();const ping=queued.tick();await new Promise(setImmediate);
 const queuedPress=queued.down(2);const keep=queued.request('keep',{hold:queued.held.hold});released=true;await queued.up();
 assert.equal(delayed.at(-1).action,'up','Release overtakes an in-flight heartbeat');finishPing();await Promise.all([ping,queuedPress,keep]);
 assert(!delayed.some(v=>v.action==='down'||v.action==='keep'),'No ended hold is dispatched');
 released=false;clock=100;await queued.down(2);assert.equal(delayed.at(-1).expires_at_ms,1700000001000);await queued.up();
 let finishDown;const flying=[];const inFlight=new Input({send:async v=>{flying.push(v);if(v.action==='down')await new Promise(r=>finishDown=r);return {};}});
 await inFlight.on();const flight=inFlight.down(1);await new Promise(setImmediate);assert.equal(inFlight.pending,1);await inFlight.up();assert(flying.at(-1).seq>flying.at(-2).seq);finishDown();await flight;assert.equal(inFlight.pending,0);
 let finishOn;const activation=[];const cancelledOn=new Input({send:async v=>{activation.push(v.action);if(v.action==='on')await new Promise(r=>finishOn=r);return {};}});
 const enabling=cancelledOn.on();await new Promise(setImmediate);const disabling=cancelledOn.off();assert.deepEqual(activation,['on']);finishOn();await Promise.all([enabling,disabling]);assert.deepEqual(activation,['on','off']);assert(!cancelledOn.armed,'Late ON acknowledgement cannot rearm after OFF');
 const native=[],r={device:{can:'running',ble_remote:{enabled:true,connected:true,subscribed:true}},transport:{call:async cmd=>{native.push(cmd);return r.device;}},context:()=>({})};const e=new Executor(r);e.nativeSession='a'.repeat(16);e.log={failed:false,begin:async()=>new Promise(resolve=>setTimeout(resolve,40)),released(){},mark:async()=>{}};
 await e.apply({enabled:true,actor:'b'.repeat(16),session:e.nativeSession,hold:'c'.repeat(8),button:2,lease_ms:3000,key_lease_ms:170});assert(!native.some(c=>c.startsWith('REMOTE DOWN')),'An expired input must not transmit after delayed storage preparation');
 // Actual 29 Oct owner capture: a low-lease poll sent UP, the next poll
 // refreshed the SAME hold, and replayed DOWN was rejected by native policy.
 // That rejection used to turn the whole BLE remote off.
 const replayCommands=[],sentHolds=new Set(),remote={enabled:true,connected:true,subscribed:true,button:0};
 const rr={device:{can:'running',ble_remote:remote},transport:{connected:true,call:async cmd=>{
  replayCommands.push(cmd);const p=cmd.split(' ');
  if(p[1]==='DOWN'){if(sentHolds.has(p[3]))throw Error('BLE command rejected (-3)');sentHolds.add(p[3]);remote.button=Number(p[5]);}
  if(p[1]==='UP')remote.button=0;
  if(p[1]==='OFF')Object.assign(remote,{enabled:false,connected:false,subscribed:false});
  return rr.device;
 }},context:()=>({})};
 const replay=new Executor(rr);replay.nativeSession='d'.repeat(16);const markers=[];replay.log={failed:false,begin:async()=>{},released:reason=>markers.push(reason),mark:async(type,v)=>markers.push({type,...v})};
 const desired={enabled:true,session:replay.nativeSession,hold:'a'.repeat(8),button:2,lease_ms:3000,key_lease_ms:900};
 await replay.apply(desired);for(let i=0;i<40;i++)await replay.apply(desired);
 assert.equal(replayCommands.filter(c=>c.startsWith('REMOTE DOWN')).length,1,'Long healthy hold sends one DOWN');
 await replay.apply({...desired,key_lease_ms:300},200);
 assert(markers.some(m=>m?.reason==='input_lease_expired'));
 for(let i=0;i<10;i++)await replay.apply(desired);
 assert.equal(replayCommands.filter(c=>c.startsWith('REMOTE DOWN')).length,1,'Renewed lease must not replay a released hold');
 assert.equal(replayCommands.filter(c=>c.startsWith('REMOTE UP')).length,1);
 assert(!replayCommands.some(c=>c==='REMOTE OFF'));assert(remote.enabled&&remote.connected&&remote.subscribed);
 await replay.apply({...desired,button:0});await replay.apply({...desired,hold:'b'.repeat(8)});
 assert.equal(remote.button,2,'A new deliberate press remains available without cycling BLE');
 // Native watchdog can release independently; it must not be renewed/replayed.
 remote.button=0;await replay.apply({...desired,hold:'b'.repeat(8)});await replay.apply({...desired,hold:'b'.repeat(8)});
 assert.equal(replayCommands.filter(c=>c.startsWith('REMOTE DOWN')).length,2);
 assert(!replayCommands.some(c=>c==='REMOTE OFF'));assert(markers.some(m=>m?.reason==='native_hold_expired'));
 const blocked=new Input({send:async v=>{if(v.action==='keep')throw Error('network');return {};}});await blocked.on();await blocked.down(1);await blocked.tick();assert(!blocked.armed&&!blocked.held);assert.equal(blocked.error,'network');
 // Local USB button leases are independent of server RTT and outage. The
 // server sees ownership heartbeats, never button DOWN/KEEP/UP payloads.
 let now=0,localSeq=1;const ownership=[],local=new ByEspRemote.LocalControl({handset:{session:'e'.repeat(16)},actor:'f'.repeat(16),boot:'12345678',seq:1,clock:()=>now,send:async body=>{ownership.push(body);throw Error('server unavailable');}});
 const press=(action,extra={})=>local.accept({actor:local.actor,seq:++localSeq,expected_boot:local.boot,action,...extra});
 press('down',{hold:'1'.repeat(8),button:2});
 for(let i=0;i<80;i++){now+=100;press('keep',{hold:'1'.repeat(8)});await local.sync();assert.equal(local.snapshot().button,2);assert(local.enabled);}
 assert(ownership.length>0);assert(ownership.every(b=>!b||b.action==='ping'),'No button edges or automatic ON replay through server');
 press('up',{hold:'1'.repeat(8)});assert.equal(local.snapshot().button,0);assert(local.enabled,'Local release preserves BLE mode');
 assert.throws(()=>press('down',{hold:'1'.repeat(8),button:2}),/Отпустите/);
 assert.throws(()=>press('down',{hold:'2'.repeat(8),button:3,confirmed:false}),/Подтвердите/);
 press('down',{hold:'2'.repeat(8),button:3,confirmed:true});press('up',{hold:'2'.repeat(8)});
 press('down',{hold:'3'.repeat(8),button:2});now+=901;assert.equal(local.snapshot().button,0);press('keep',{hold:'3'.repeat(8)});assert.equal(local.snapshot().button,0,'Late KEEP cannot rearm local hold');
 press('up',{hold:'3'.repeat(8)});press('down',{hold:'4'.repeat(8),button:2});
 for(let i=0;i<151;i++){now+=200;press('keep',{hold:'4'.repeat(8)});}
 assert.equal(local.snapshot().button,0,'30-second maximum remains enforced locally');assert(local.enabled);
 local.send=async body=>{if(body)throw Error('owner changed');return {handset:{enabled:true,actor:'a'.repeat(16),session:local.session,button:0,lease_ms:3000}};};now+=600;await local.sync();assert.equal(local.takeover.actor,'a'.repeat(16));
 const releasedLocal=new ByEspRemote.LocalControl({handset:{session:'e'.repeat(16)},actor:'f'.repeat(16),boot:'12345678',seq:1,clock:()=>now,send:async()=>({handset:{enabled:false,reason:'owner_off'}})});
 releasedLocal.accept({actor:releasedLocal.actor,seq:2,expected_boot:releasedLocal.boot,action:'off'});await releasedLocal.sync();now+=600;await releasedLocal.sync();assert(!releasedLocal.takeover,'Own OFF does not report a takeover');
 assert.throws(()=>releasedLocal.accept({actor:releasedLocal.actor,seq:3,expected_boot:'RESET000',action:'ping'}),/передано/);
 // A physical release during slow IndexedDB preparation cancels local DOWN.
 const cancelDevice={boot:'12345678',can:'running',ble_remote:{enabled:true,connected:true,subscribed:true,button:0}},cancelCommands=[];
 const cancelExec=new Executor({device:cancelDevice,transport:{call:async c=>{cancelCommands.push(c);return cancelDevice;}}});
 const cancelLocal=cancelExec.local=new ByEspRemote.LocalControl({handset:{session:'e'.repeat(16)},actor:'f'.repeat(16),boot:cancelDevice.boot,seq:1,send:async()=>({})});cancelExec.nativeSession=cancelLocal.session;
 cancelLocal.accept({actor:cancelLocal.actor,seq:2,expected_boot:cancelLocal.boot,action:'down',hold:'9'.repeat(8),button:2});
 cancelExec.log={begin:async()=>cancelLocal.accept({actor:cancelLocal.actor,seq:3,expected_boot:cancelLocal.boot,action:'up',hold:'9'.repeat(8)}),released(){},mark:async()=>{}};
 await cancelExec.apply(cancelLocal.snapshot());assert(!cancelCommands.some(c=>c.startsWith('REMOTE DOWN')),'Released local input cannot become delayed DOWN');
 console.log('PASS handset input: momentary edges/power confirmation; no replay after release; local USB hold survives server outage, releases without network, expires without renewal, retains 30s bound and respects ownership transfer/boot change');
})().catch(e=>{console.error(e);process.exit(1);});
