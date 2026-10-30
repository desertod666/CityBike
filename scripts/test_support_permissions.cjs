'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const c={Date,Set,ByStore:{uuid:()=> 'a'.repeat(32)}};c.globalThis=c;vm.createContext(c);vm.runInContext(fs.readFileSync('web/support.js','utf8'),c);
 const calls=[],settings={enabled:true,monitor_enabled:true,remote_support_enabled:false,manual_mode:true};
 const r={settings,wifi:false,device:{ap_mac:'e0:72:a1:72:38:d9',boot:'B',can:'stopped'},transport:{connected:true,verified:true},scan:{active:false},store:{settings:async()=>({...settings})},startClock(seconds){calls.push('clock '+seconds);},async begin(rate){calls.push('START '+rate);this.recorder={session:{context:{}}};},async event(){},async finish(){calls.push('STOP');this.recorder=null;}};
 const support=new c.BySupport.Support(r),job={id:'b'.repeat(32),kind:'capture',bitrate:250000,duration:30,expected_mac:r.device.ap_mac,expected_boot:'B',expires_at:Date.now()/1000+30};
 support.receive(job);assert.equal(calls.length,0);assert(!support.ready());
 settings.remote_support_enabled=true;support.receive(job);assert.equal(calls.length,0);
 settings.manual_mode=false;settings.enabled=false;support.receive(job);await support.work;assert.deepEqual(calls,['START 250000','clock 30']);assert(r.fixedTest);assert.equal(r.recorder.session.context.support_job,job.id);
 const lease=support.snapshot();assert(lease.lease_expires_at>Date.now()/1000+29);assert.equal(lease.local_permission.manual_mode,false);
 support.receive({...job,id:'c'.repeat(32),kind:'stop',target_job_id:'d'.repeat(32)});assert.equal(calls.length,2);
 support.receive({...job,id:'c'.repeat(32),kind:'stop',target_job_id:job.id});await support.work;assert.equal(calls.at(-1),'STOP');
 // A manual recorder cannot be stopped by a stale or unscoped remote STOP.
 r.recorder={session:{context:{}}};const before=calls.length;support.receive({...job,id:'d'.repeat(32),kind:'stop',target_job_id:job.id});assert.equal(calls.length,before);r.recorder=null;
 // Permission can be revoked after receive but before an async operation starts.
 settings.remote_support_enabled=true;r.settings={...settings};r.store.settings=async()=>({...settings,remote_support_enabled:false});support.receive({...job,id:'e'.repeat(32)});await support.work;assert.equal(support.last.state,'failed');assert.equal(calls.length,before);
 settings.monitor_enabled=false;r.settings={...settings};assert(!support.ready());assert.equal(support.snapshot().lease_expires_at,0);
 console.log('PASS support permissions: upload-only denied, manual hold denied, explicit independent permission, bounded lease, targeted STOP, async revocation, monitor OFF');
})().catch(e=>{console.error(e);process.exitCode=1;});
