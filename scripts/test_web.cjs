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
// Observed raw controller payload; these expectations test the unconfirmed SYM
// interpretation, not a physically verified battery state of charge.
result=decode(frame('02F83200','61000000EE022413'),schema);
assert.equal(result.status,'decoded_unconfirmed');assert.equal(result.fields.Remaining_Capacity.value,97);assert.equal(result.fields.Pedal_Revolution.value,0);assert.equal(result.fields.Torque_Sensor_Voltage.value,750);
assert.equal(decode(frame('02F83206','03'),schema).fields.Mode.value,3);
assert.equal(decode(frame('02F83203','C409A0010308'),schema).status,'decoded_unconfirmed');
assert.equal(decode(frame('02F83201','',{rtr:true,dlc:8}),schema).status,'rtr');
assert.equal(decode(frame('02F83201','00'),schema).status,'invalid');
assert.equal(decode(frame('02F83201','00'.repeat(8),{extended:false}),schema).status,'invalid');
assert.equal(decode(frame('02F83201trailing','00'.repeat(8)),schema).status,'invalid');
assert.equal(decode(frame('02F83201','C409E80380144146'),schema).fields.Motor_Temperature.unit,'°C');
const unsupported=JSON.parse(JSON.stringify(schema));
unsupported.messages.find(m=>m.id==='0x02F83201').signals[0].byte_order='big_endian';
assert.equal(decode(frame('02F83201','00'.repeat(8)),unsupported).status,'invalid');
// Candidate unavailable encodings retain the exact SYM calculation and raw
// payload; qualification is evidence metadata, not a claimed sentinel map.
const original=frame('02F83201','00000000C40E4E00'),before=JSON.stringify(original);
result=decode(original,schema);assert.equal(JSON.stringify(original),before);
assert.equal(result.decoder_version,'sym-evidence-2-v25');assert.equal(result.source_node,2);
assert.equal(result.source_node_evidence,'published_identifier_layout_unconfirmed');
assert.equal(result.fields.Motor_Temperature.raw,0);assert.equal(result.fields.Motor_Temperature.value,-40);
assert.equal(result.fields.Motor_Temperature.validity,'suspected_unavailable');
assert.deepEqual(result.fields.Motor_Temperature.evidence,{reason:'motor_temperature_raw_zero_unverified',confirmed:false});
assert.equal(result.fields.Controller_Temperature.validity,'unconfirmed');
result=decode(frame('02F83200','61000000EE02FFFF'),schema);
assert.equal(result.fields.Remaining_Distance.raw,65535);assert.equal(result.fields.Remaining_Distance.value,655.35);
assert.equal(result.fields.Remaining_Distance.validity,'suspected_unavailable');
assert.equal(result.fields.Remaining_Distance.evidence.reason,'remaining_distance_raw_ffff_unverified');
assert.equal(decode(frame('02F83201','00000000C40E4E01'),schema).fields.Motor_Temperature.validity,'unconfirmed');
assert.equal(decode(frame('123','FF',{extended:false}),schema).source_node,null);
require('../web/metrics.js');
const metricFrame=(value,validity,t_us=1000000)=>({id:'02F83201',t_us,host_seen:10,decoded:{status:'decoded_unconfirmed',fields:{CR_Voltage:{value,validity}}}});
assert.equal(ByMetrics.pick('voltage',[metricFrame(40,'suspected_unavailable')],1000000,10),null);
assert.equal(ByMetrics.pick('voltage',[metricFrame(40,'unconfirmed'),metricFrame(41,'suspected_unavailable',1100000)],1100000,10),null,'Do not resurrect the older value');
assert.equal(ByMetrics.pick('voltage',[metricFrame(40,'unconfirmed')],1000000,10).signal.value,40);
console.log('Browser decoder: synthetic vectors PASS');
