/* Read-only, unconfirmed SYM decoder. Original payload always stays intact. */
(function (root) {
  const DECODER_VERSION = 'sym-evidence-2-v25';
  const REFERENCE={document:'GYE-1--02 V2.5',sha256:'33864de4e080df20579623e574af38a55e19b2561e1d55c7491eb69bb0979705',compatibility:'unconfirmed'};
  const INSTRUCTIONS=['write_or_public_post','read','normal_reply','error_reply','long_start','long_transfer','long_end','warning'];
  const WARNING_V25={"0":"No current warning reported","3":"Brake already applied","4":"Throttle fault","5":"Throttle not returned to zero","6":"Undervoltage","7":"Overvoltage","8":"Motor Hall signal wiring fault","9":"Motor phase wiring fault","16":"Motor overtemperature protection","17":"Motor temperature sensor fault","18":"Current sensor fault","20":"Controller overtemperature protection","21":"Controller temperature sensor fault","33":"Speed sensor fault","35":"Headlight fault","37":"Torque sensor signal fault","38":"Torque sensor signal fault","39":"Overcurrent","48":"HMI/controller communication fault","49":"Low voltage protection","50":"Overvoltage protection","51":"Brake detection circuit fault","53":"15 V supply detection fault","54":"Key detection circuit fault","65":"Battery total voltage too high","66":"Battery total voltage too low","67":"Battery cell current too high","69":"Battery temperature too high","70":"Battery temperature too low","71":"Battery SOC too high","72":"Battery SOC too low","97":"Transmission stuck","98":"Transmission cannot reset","113":"Electronic lock stuck","129":"Bluetooth module fault"};
  const WARNING_SYM={"0":["No current warning reported"],"27":["Overcurrent"],"7":["Overvoltage"],"6":["Undervoltage"],"3":["Brake already applied"],"5":["Throttle not returned to zero","Throttle fault"],"31":["Low voltage protection"],"32":["Overvoltage protection"],"8":["Motor Hall signal wiring fault"],"9":["Motor phase wiring fault"],"10":["Motor overtemperature protection"],"11":["Motor temperature sensor fault"],"14":["Controller overtemperature protection"],"15":["Controller temperature sensor fault"],"12":["Current sensor fault"],"23":["Headlight fault"],"33":["Brake detection circuit fault"],"35":["15 V supply detection fault"],"36":["Key detection circuit fault"],"21":["Speed sensor fault"]};
  function warningReference(raw){
    if(!Number.isInteger(raw)||raw<0||raw>255)throw Error('A warning is one raw byte');
    const primary=WARNING_V25[raw]??null,legacy=WARNING_SYM[raw]||[];
    return {raw_hex:raw.toString(16).toUpperCase().padStart(2,'0'),decimal:raw,v25:primary,legacy_sym:[...legacy],source_agreement:primary!==null&&legacy.length===1?primary===legacy[0]:null,enum_ambiguous:legacy.length>1,reference:{...REFERENCE,pages:[20,21]},vehicle_validated:false,scope:'current_wire_warning_only',stored_pcb_history_read:false,all_components_healthy_proven:false};
  }
  function interpretId(id){const cmd=(id>>>16)&7;return {source:(id>>>24)&31,destination:(id>>>19)&31,instruction:cmd,instruction_name:INSTRUCTIONS[cmd],public_post:((id>>>19)&31)===31&&cmd===0,object_hex:[5,6].includes(cmd)?null:(id&65535).toString(16).toUpperCase().padStart(4,'0'),sequence:[5,6].includes(cmd)?id&65535:null,evidence:{...REFERENCE,pages:[11,12,18,19]}};}
  function referenceField(raw,value,unit,pages,validity='unconfirmed'){return {raw,value,unit,validity,evidence:{reason:'bafang_v25_reference_not_vehicle_validation',confirmed:false,reference:{...REFERENCE,pages}}};}
  function wheelFields(data){const limit=data[0]+data[1]*256,word=data[2]+data[3]*256,circumference=data[4]+data[5]*256;return {Speed_Limit_kmh:referenceField(limit,limit/100,'km/h',[23,24]),Wheel_Code:referenceField(word,(word>>>4)+(word&15)/10,'code',[23,24],(word&15)<=9?'unconfirmed':'suspected_unavailable'),Wheel_Circumference_mm:referenceField(circumference,circumference,'mm',[24])};}

  function decode(frame, schema) {
    const metadata = {decoder_version:DECODER_VERSION,reference_sha256:schema?.sha256};
    try {
      if (typeof frame.id !== 'string' || !/^(?:0[xX])?[0-9a-fA-F]{1,8}$/.test(frame.id)) throw Error('Формат ID');
      const id = Number.parseInt(frame.id, 16), hex = frame.data;
      if (typeof frame.extended !== 'boolean' || typeof frame.rtr !== 'boolean' || !Number.isInteger(frame.dlc) || frame.dlc < 0 || frame.dlc > 8) throw Error('Флаги / DLC');
      if (!Number.isInteger(id) || id < 0 || id > (frame.extended ? 0x1fffffff : 0x7ff)) throw Error('ID / extended');
      if (typeof hex !== 'string' || !/^(?:[0-9a-fA-F]{2})*$/.test(hex) || hex.length !== (frame.rtr ? 0 : frame.dlc * 2)) throw Error('Длина DATA');
      metadata.source_node = frame.extended ? (id >>> 24) & 31 : null;
      metadata.source_node_evidence = frame.extended ? 'published_identifier_layout_unconfirmed' : 'not_applicable_standard_id';
      if(frame.extended)metadata.reference_layout=interpretId(id);
      if (frame.rtr) return {...metadata,status:'rtr'};
      if(id===0x02f83203){if(!frame.extended||frame.dlc!==6)throw Error('Объект колеса V2.5 требует 6 байт');return {...metadata,status:'decoded_unconfirmed',message:'CR_Wheel_Reference_V25',mapping_source:'bafang_v25',fields:wheelFields(hex.match(/../g).map(x=>parseInt(x,16)))};}
      const msg = schema.messages.find(m => Number.parseInt(m.id, 16) === id);
      if (!msg) return {...metadata,status:'unknown'};
      if (!frame.extended || frame.dlc !== msg.picture_bytes) throw Error('Длина / флаги SYM');
      const data = hex.match(/../g)?.map(x => parseInt(x, 16)) || [], fields = {};
      for (const s of msg.signals) {
        if (s.byte_order !== 'little_endian' || !['unsigned','signed'].includes(s.type)) throw Error('Неподдерживаемое поле SYM; сырые данные сохранены');
        let raw = s.bits_lsb0.reduce((v, bit, i) => v + ((data[Math.floor(bit / 8)] >> (bit % 8)) & 1) * 2 ** i, 0);
        if (s.type === 'signed' && raw >= 2 ** (s.bit_length - 1)) raw -= 2 ** s.bit_length;
        let validity='unconfirmed',reason='sym_mapping_not_independently_validated';
        if(id===0x02f83200&&s.name==='Remaining_Distance'&&raw===65535){validity='suspected_unavailable';reason='remaining_distance_raw_ffff_unverified';}
        else if(id===0x02f83201&&s.name==='Motor_Temperature'&&raw===0){validity='suspected_unavailable';reason='motor_temperature_raw_zero_unverified';}
        else if(id===0x02f83201&&s.name==='Speed'&&raw===65535){validity='suspected_unavailable';reason='bafang_v25_speed_ffff_special_value';}
        fields[s.name] = {raw, value: raw * s.factor + s.offset, unit: s.unit,validity,evidence:{reason,confirmed:false}};
      }
      if(id===0x04f83401)fields.Battery_Current_A.reference_sign_convention='positive_charge_negative_discharge_bafang_v25_unconfirmed';
      if(id===0x02ff1200)Object.assign(fields.Error,{raw_hex:hex.slice(0,2).toUpperCase(),decimal:data[0],meaning:'raw_only_conflicting_reference_dictionaries',reference_warning:warningReference(data[0])});
      return {...metadata,status:'decoded_unconfirmed',message:msg.name,fields};
    } catch (error) { return {...metadata,status:'invalid',reason:error.message}; }
  }
  root.BafangDecoder = {decode,DECODER_VERSION,interpretId,warningReference};
  if (typeof module !== 'undefined') module.exports = {decode,DECODER_VERSION,interpretId,warningReference};
})(typeof globalThis !== 'undefined' ? globalThis : this);
