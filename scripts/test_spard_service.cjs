/* Offline decoder boundary checks. No transport/device modules. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const service=require('../web/spard-service.js');
const make=(op,payload)=>{const b=Buffer.concat([Buffer.from([0x68,payload.length+6,(payload.length+6)^255,op]),payload,Buffer.from([0,0x16])]);b[b.length-2]=b.subarray(0,-2).reduce((v,x)=>v^x,0);return b;};
const identity=make(0x30,Buffer.concat([Buffer.alloc(2),Buffer.from('SYNTHETIC-SN'.padEnd(32,'\0')),Buffer.from('TEST-MODEL'.padEnd(32,'\0'))]));
const parameters=make(6,Buffer.alloc(240));
for(const raw of [parameters,identity]){
 for(const options of [undefined,null,{}, {normalServiceContext:true}, {expectedCommand:raw[3]}, {normalServiceContext:1,expectedCommand:raw[3]}, {normalServiceContext:true,expectedCommand:String(raw[3])}]){
  const d=service.decode(raw,options);assert.equal(d.status,'context_required');assert.deepEqual(d.fields,{});assert.equal(d.validated_packet,true);
 }
 const before=Buffer.from(raw),d=service.decode(raw,{normalServiceContext:true,expectedCommand:raw[3]});
 assert.equal(d.status,'decoded');assert.equal(d.live_reply_validation,false);assert.deepEqual(raw,before);
 d.fields={};assert.notDeepEqual(service.decode(raw,{normalServiceContext:true,expectedCommand:raw[3]}).fields,{});
 const opposite=raw[3]===6?0x30:6;assert.equal(service.decode(raw,{normalServiceContext:true,expectedCommand:opposite}).reason,'unexpected_service_reply');
}
for(const bad of [null,{},[0x68],new DataView(new ArrayBuffer(90)),new Uint16Array(90),'GG','6','68 48'])assert.equal(service.decode(bad).status,'invalid');
assert.equal(service.decode('00'.repeat(256)).reason,'invalid_packet_length');
assert.equal(service.decodeParameters(parameters).status,'decoded');assert.equal(service.decodeIdentity(identity).fields.serial_number.text,'SYNTHETIC-SN');
const browser={};vm.createContext(browser);vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/spard-service.js'),'utf8'),browser);
assert.equal(browser.BySpardService.decodeIdentity(identity).fields.model.text,'TEST-MODEL');
assert.equal(browser.BySpardService.decodeIdentity(identity.toString('hex')).fields.model.text,'TEST-MODEL');
assert.equal(browser.BySpardService.decode(parameters).status,'context_required');
console.log('PASS service decoder boundaries: explicit service context, matching operation, cross-realm bytes, bounded hex, immutable input, no direction/live-validation inference');
