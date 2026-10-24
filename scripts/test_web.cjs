// Synthetic vectors only. No browser display is treated as observed bus data.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {decode}=require('../web/decoder.js'),schema=JSON.parse(fs.readFileSync(__dirname+'/../web/decoder_reference.json'));
const frame=(id,data,extra={})=>({id,data,extended:true,rtr:false,dlc:data.length/2,...extra});
let result=decode(frame('02F83201','C409E80380144146'),schema);
assert.equal(result.status,'decoded_unconfirmed');assert.equal(result.fields.Speed.value,25);assert.equal(result.fields.Motor_Temperature.value,30);assert.equal(result.fields.Controller_Temperature.value,25);
result=decode(frame('04F83401','9CFF100E28'),schema);assert.equal(result.fields.Battery_Current_A.value,-1);
assert.equal(decode(frame('03106300','A503FF80'),schema).fields.Mode.value,10);
assert.equal(decode(frame('01F83100','E8035AFF'),schema).fields.Cadence.value,90);
assert.equal(decode(frame('04F83400','1027881364325A'),schema).fields.SOH.value,90);
assert.equal(decode(frame('123','FF',{extended:false}),schema).status,'unknown');
assert.equal(decode(frame('02F83201','',{rtr:true,dlc:8}),schema).status,'rtr');
assert.equal(decode(frame('02F83201','00'),schema).status,'invalid');
assert.equal(decode(frame('02F83201','00'.repeat(8),{extended:false}),schema).status,'invalid');
console.log('Browser decoder: synthetic vectors PASS');
