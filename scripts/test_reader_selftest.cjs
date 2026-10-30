'use strict';
require('../web/battery-query.js');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {Test,validate}=require('../web/reader-selftest.js');
const fixtureFile=process.env.CITYBIKE_SELFTEST_FIXTURE||'pc/fixtures/reader-selftest-055.json',fixture=JSON.parse(fs.readFileSync(fixtureFile)),fixtures=fixture.results;
function scenario(options={}){
 const native=structuredClone(fixtures[options.retained?2:options.failed?1:0]);
 let d={type:'status',product:'BafangReader',protocol:1,version:fixture.version||'0.5.5',boot:native.boot,ap_mac:'02:13:24:35:46:58',can:options.live?'running':'stopped',epoch:native.epoch-1,received:37,rx_sampling_250k:'TRIPLE',capabilities:['command_ids','isolated_twai_selftest_v1'],ctx_guard:{policy:'fixed_recessive',valid:true,level:1}};
 const r={device:structuredClone(d),liveViewing:!!options.live,scan:{active:false},tuner:{active:false}},commands=[];
 const t=r.transport={verified:true,connected:true,uncertain:false,state:structuredClone(d),async poll(){return structuredClone(d);},async drain(){return !options.drainFail;},async call(command){
  commands.push(command);if(command==='STOP'){d.can='stopped';return t.state=structuredClone(d);}
  assert.equal(command,options.meter?'SELFTEST VOLTMETER ISOLATED':'SELFTEST ISOLATED');t.pending={command,id:'fixture_1'};native.id=t.pending.id;
  if(options.wrongBoot)native.boot='00000000';if(options.wrongId)native.id='old_1';if(options.wrongEpoch)native.epoch++;
  r.readerSelftest.feed(native);d.epoch++;
  if(options.retained)d.ctx_guard.valid=false;
  const status=structuredClone(d);t.state=status;
  r.readerSelftest.feed({type:'command_result',id:t.pending.id,command,boot:d.boot,status});t.pending=null;
  if(options.failed||options.retained)throw Error('Native test failed');return status;
 }};
 if(options.meter){d.version='0.6.8';d.capabilities.push('isolated_gpio_voltmeter_v1');native.gpio_probe={attempted:true,passed:true,ctx_restored:true,reason:'gpio_loopback_verified',driver_installed:false,low_hold_us:8000000,tx:[1,0,1],rx:[1,0,1],low_rc:0,high_rc:0,rx_config_rc:0,rx_config_valid:true};native.stage3_ecc={after_event:0,captured_before_cleanup:true,last:null};native.test_frame_dlc=8;native.stages.forEach(x=>x.rx_frame={id:0x666,extended:false,rtr:false,dlc:8,data:'0000000000000000'});r.device=structuredClone(d);}
 r.readerSelftest=new Test(r);return {r,commands,d,native};
}
(async()=>{
 let s=scenario({live:true});await s.r.readerSelftest.run({isolationAsserted:true});assert.equal(s.r.readerSelftest.phase,'complete');assert(!s.r.liveViewing&&!s.r.operation);assert.deepEqual(s.commands,['STOP','SELFTEST ISOLATED']);
 for(const options of [{failed:true},{retained:true},{wrongBoot:true},{wrongId:true},{wrongEpoch:true},{drainFail:true}]){
  s=scenario(options);await assert.rejects(()=>s.r.readerSelftest.run({isolationAsserted:true}));assert(!s.r.operation&&!s.r.readerSelftest.active);assert.equal(s.r.readerSelftest.phase,'failed');
  if(options.drainFail)assert(!s.commands.includes('SELFTEST ISOLATED'));
 }
 for(const options of [{},{isolationAsserted:false},{isolationAsserted:1},{isolationAsserted:true,expectedBoot:'BADBOOT'},{isolationAsserted:true,expectedMac:'02:00:00:00:00:00'}]){
  s=scenario();await assert.rejects(()=>s.r.readerSelftest.run(options));assert.equal(s.commands.length,0);
 }
 for(const mode of ['wifi','unverified','busy','old']){
  s=scenario();if(mode==='wifi')s.r.wifi=true;if(mode==='unverified')s.r.transport.verified=false;if(mode==='busy')s.r.operation=true;if(mode==='old')s.d.version='0.5.4';
  await assert.rejects(()=>s.r.readerSelftest.run({isolationAsserted:true}));assert(!s.commands.includes('SELFTEST ISOLATED'));
 }
 const base=scenario();for(const fixture of fixtures){const value=structuredClone(fixture);assert(validate(value,base.d,value.id));}
 for(const mutate of [v=>v.stages[0].bus_errors=1,v=>v.stages[2].passed=false,v=>v.stages[0].transmit_rc=-1,v=>v.stages[0].echo_received=false,v=>v.ctx_restored=false,v=>v.stages.pop(),v=>v.ack_required=true]){
  const v=structuredClone(fixtures[0]);mutate(v);assert.equal(validate(v,base.d,v.id),null);
 }
 const modern=JSON.parse(fs.readFileSync('pc/fixtures/reader-selftest-056.json')).results[0],d={...base.d,version:'0.6.7',boot:modern.boot,epoch:modern.epoch-1};
 modern.gpio_probe={attempted:true,passed:true,ctx_restored:true,reason:'gpio_loopback_verified',driver_installed:false,low_hold_us:100,tx:[1,0,1],rx:[1,0,1],low_rc:0,high_rc:0};
 modern.stage3_ecc={after_event:5,captured_before_cleanup:true,last:{source:'single_HAL_ECC_read',scope:'boot_history',event:6,t_us:123,raw:129,type:2,direction:0,segment:1,saturated:false}};
 assert(validate(modern,d,modern.id));
 for(const mutate of [v=>delete v.gpio_probe,v=>delete v.stage3_ecc,v=>v.gpio_probe.rx[1]=1,v=>v.gpio_probe.driver_installed=true,v=>v.gpio_probe.high_rc=-1,v=>v.stage3_ecc.captured_before_cleanup=false,v=>v.stage3_ecc.last.type=1,v=>v.stage3_ecc.after_event=6]){
  const v=structuredClone(modern);mutate(v);assert.equal(validate(v,d,v.id),null);
 }
 s=scenario({meter:true});await s.r.readerSelftest.run({isolationAsserted:true,voltmeter:true});assert.equal(s.r.readerSelftest.phase,'complete');assert.deepEqual(s.commands,['STOP','SELFTEST VOLTMETER ISOLATED']);
 s=scenario();await assert.rejects(()=>s.r.readerSelftest.run({isolationAsserted:true,voltmeter:true}));assert.equal(s.commands.length,0);
 s=scenario({meter:true});s.d.capabilities=[];s.r.device=structuredClone(s.d);await assert.rejects(()=>s.r.readerSelftest.run({isolationAsserted:true,voltmeter:true}));assert.equal(s.commands.length,0);
 console.log('PASS actual-C selftest result/browser integration: success, causal failure, retained driver, isolation/scope/correlation/USB/busy/final-state guards, no resume or battery requests');
})().catch(e=>{console.error(e);process.exitCode=1;});
