'use strict';
const assert=require('node:assert/strict');require('../web/bafang-battery.js');const {canModel}=require('../web/spard-battery.js');
const frame=(id,data,seq)=>({id,data,seq,t_us:seq*1000,age_ms:0,extended:true,rtr:false,dlc:data.length/2});
const input={connected:true,device:{product:'BafangReader',protocol:1,boot:'1234ABCD',epoch:1},snapshot:{schema:1,boot:'1234ABCD',epoch:1,stream_active:true,frames:[frame('041A6400','0A036C39',1),frame('041A6402','A00FA10FA20FA30F',2),frame('041A6403','A40FA50FA60FA70F',3),frame('041A6404','A80FA90F',4)]}};
let m=canModel(input);assert(m.cellComplete&&!m.cellStale);assert.equal(m.cellValues.length,10);
assert(canModel({...input,connected:false}).cellStale,'Disconnect overrides cached stream_active');
assert(canModel({...input,extraAge:6000}).cellStale);
for(const word of ['0000','FFFF']){
 const s=structuredClone(input);s.snapshot.frames[1].data=word+s.snapshot.frames[1].data.slice(4);m=canModel(s);
 assert.equal(m.cellValues[0],null);assert(!m.cellComplete);const decoded=ByBafangBattery.model(s.snapshot);assert.equal(decoded.cells[0].mv,parseInt(word,16));assert.equal(decoded.sum_mv,null);
 assert.equal(ByBafangBattery.cards(s.snapshot).find(c=>c.id==='041A6402').fields[0].value,'—');
}
console.log('PASS cell summary: disconnect/age freshness, consistent zero/FFFF validity, original raw values retained');
