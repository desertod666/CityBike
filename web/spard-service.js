/* Normal-service Spard reply decoder only. No transport or TX.
 * Layouts from supplied PC executable and BMS2.4. Complete real06/30 reply
 * validation remains pending. A caller must establish normal diagnostic context;
 * shared68 framing also carries firmware update traffic. No direction inference.
 */
'use strict';
(function(root){
const TABLES={"OVT":[100,200,300,400,600,800,1000,2000,3000,4000,6000,8000,10000,20000,30000,40000],"UVT":[100,200,300,400,600,800,1000,2000,3000,4000,6000,8000,10000,20000,30000,40000],"OCD1V":[20,30,40,50,60,70,80,90,100,110,120,130,140,160,180,200],"OCD1T":[50,100,200,400,600,800,1000,2000,4000,6000,8000,10000,15000,20000,30000,40000],"OCD2V":[30,40,50,60,70,80,90,100,120,140,160,180,200,300,400,500],"OCD2T":[10,20,40,60,80,100,200,400,600,800,1000,2000,4000,8000,10000,20000],"SCV":[50,80,110,140,170,200,230,260,290,320,350,400,500,600,800,1000],"SCT":[0,64,128,192,256,320,384,448,512,576,640,704,768,832,896,960],"OCCV":[20,30,40,50,60,70,80,90,100,110,120,130,140,160,180,200],"OCCT":[10,20,40,60,80,100,200,400,600,800,1000,2000,4000,8000,10000,20000]};
const FIELDS=[[0,"ShutDTime","s","u"],[1,"DC_Parameter","mAh","u"],[2,"BalEndV","mV","u"],[3,"ChgEndCur","mA","u"],[4,"ChgEndolV","mV","u"],[5,"ChgEndDel","s","u"],[6,"CfgOption",null,"u"],[8,"MNFDate",null,"u"],[9,"SlfDsqBalV","mV","u"],[10,"BalStartV","mV","u"],[11,"BalDelay","s","u"],[12,"SlfDsgDel",null,"u"],[14,"SOCC","mA","u"],[15,"SOCCD","ms","quarter_second"],[16,"FCC_Parameter","mAh","u"],[23,"SampleRV",null,"f32"],[24,"CellNum",null,"u"],[25,"OV","mV","x5"],[26,"OVR","mV","x5"],[27,"OVT","ms","table"],[28,"UV","mV","x20"],[29,"UVR","mV","x20"],[30,"UVT","ms","table"],[31,"BALV","mV","x20"],[32,"PREV","mV","x20"],[33,"LZV","mV","x20"],[34,"PFV","mV","x20"],[35,"OCD1V","A","current_table"],[36,"OCD1T","ms","table"],[37,"OCD2V","A","current_table"],[38,"OCD2T","ms","table"],[39,"SCV","A","current_table"],[40,"SCT","us","table"],[41,"OCCV","A","current_table"],[42,"OCCT","ms","table"],[43,"EOTC","C","s32"],[44,"EOTCR","C","s32"],[45,"EUTC","C","s32"],[46,"EUTCR","C","s32"],[47,"EOTD","C","s32"],[48,"EOTDR","C","s32"],[49,"EUTD","C","s32"],[50,"EUTDR","C","s32"]];
function decode(input, options={}){
 const result={schema:1,status:'invalid',validated_packet:false,fields:{},warnings:[],layout_evidence:'supplied_PC_and_BMS2.4_static_analysis',live_reply_validation:false};
 let raw;
 if(typeof input==='string'&&input.length>510)return {...result,reason:'invalid_packet_length'};
 if(typeof input==='string'&&/^(?:[0-9a-fA-F]{2})+$/.test(input))raw=Uint8Array.from(input.match(/../g),x=>parseInt(x,16));
 else if(ArrayBuffer.isView(input)&&Object.prototype.toString.call(input)==='[object Uint8Array]')raw=input;
 else return {...result,reason:'bytes_required'};
 if(raw.length<6||raw.length>255)return {...result,reason:'invalid_packet_length'};
 if(raw[0]!==0x68||raw[raw.length-1]!==0x16)return {...result,reason:'invalid_header_or_footer'};
 if(raw[1]!==raw.length||raw[2]!== (raw[1]^255))return {...result,reason:'invalid_length_or_complement'};
 let sum=0;for(const b of raw.subarray(0,-2))sum^=b;
 if(sum!==raw[raw.length-2])return {...result,reason:'invalid_xor_checksum'};
 const hex=a=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
 Object.assign(result,{validated_packet:true,raw_hex:hex(raw),command:raw[3]});
 if(options?.normalServiceContext!==true||!Number.isInteger(options?.expectedCommand)||![6,0x30].includes(options.expectedCommand))return {...result,status:'context_required',reason:'explicit_normal_service_and_expected_command_required'};
 if(raw[3]!==options.expectedCommand)return {...result,reason:'unexpected_service_reply'};
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
 if(raw[3]===6&&raw.length===246){
  const words=Array.from({length:60},(_,i)=>view.getUint32(4+i*4,true)),sample=view.getFloat32(96,true);
  Object.assign(result,{status:'decoded',kind:'parameters',words_raw:words});
  for(const [index,name,unit,transform] of FIELDS){let value=words[index],reason=null;
   if(transform==='table'||transform==='current_table'){
    if(value>=16){value=null;reason='lookup_index_outside_16_entries';}
    else{value=TABLES[name][value];if(transform==='current_table'){
     if(!Number.isFinite(sample)||sample<=0){value=null;reason='invalid_sample_resistance';}
     else{value=Math.fround(value/sample);if(!Number.isFinite(value)){value=null;reason='nonfinite_derived_current';}}
    }}
   }else if(transform==='f32'){value=sample;if(!Number.isFinite(value)){value=null;reason='nonfinite_float';}}
   else if(transform==='s32')value=value>=0x80000000?value-0x100000000:value;
   else if(transform==='x5'||transform==='x20')value=Math.imul(value,transform==='x5'?5:20)>>>0;
   else if(transform==='quarter_second')value=(Math.imul(value,1000)>>>0)>>>2;
   result.fields[name]={word:index,offset:4+index*4,raw:words[index],value,unit};
   if(reason){result.fields[name].reason=reason;result.warnings.push(name+':'+reason);}
  }
  result.limitations=['Parameters FCC is separate from Information FCC.','Supplied BMS2.4 can mask words45/46 and zero the parameter payload according to internal state; a reply does not guarantee a full persistent configuration dump.'];
  if(words.every(x=>x===0))result.warnings.push('parameter_payload_all_zero');
  return result;
 }
 if(raw[3]===0x30&&raw.length===72){
  Object.assign(result,{status:'decoded',kind:'identity',reserved_hex:hex(raw.subarray(4,6))});
  if(raw[4]!==0||raw[5]!==0)result.warnings.push('nonzero_identity_reserved_bytes');
  for(const [name,offset] of [['serial_number',6],['model',38]]){
   const data=raw.subarray(offset,offset+32),zero=data.indexOf(0),prefix=zero<0?data:data.subarray(0,zero),tail=data.subarray(prefix.length);
   const printable=prefix.length>0&&prefix.every(c=>c>=32&&c<=126)&&tail.every(c=>c===0);
   result.fields[name]={offset,bytes:32,raw_hex:hex(data),text:printable?String.fromCharCode(...prefix):null};
   if(!printable)result.warnings.push(name+':not_plain_ascii_with_optional_zero_padding');
  }
  return result;
 }
 return {...result,reason:'unsupported_normal_service_command_or_length'};
}
const decodeParameters=input=>decode(input,{normalServiceContext:true,expectedCommand:6});
const decodeIdentity=input=>decode(input,{normalServiceContext:true,expectedCommand:0x30});
root.BySpardService={decode,decodeParameters,decodeIdentity};if(typeof module!=='undefined')module.exports=root.BySpardService;
})(typeof globalThis!=='undefined'?globalThis:this);
