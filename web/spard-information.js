/* Offline stock Spard Information decoding. No serial/CAN I/O or commands. */
(function(root){
  'use strict';
  const SCHEMA=1,DECODER_VERSION='spard-information-1',PACKET_LENGTH=90;
  const EVIDENCE={
    schema:SCHEMA,decoder_version:DECODER_VERSION,
    basis:'static_stock_exe_parser_and_three_complete_checksum_valid_adapter_replies',
    parser:'BaseInfoParser@0x41A358',
    framing:['Get_Data@0x416971-0x416AB8','SocCalcXor@0x57D4B8-0x57D539'],
    cell_count:'0x41A3B4-0x41A3E7: byte71 -> CellNum',
    cells_mv:'0x41A3ED-0x41A499: LE16 slots at4+2*i, active count at71',
    cell_sum_mv:'0x41A490-0x41A49C: calculated sum of active cells, not an independent pack measurement',
    temperatures_c:'0x41ABA0-0x41AD7E: signed bytes36..38; Celsius UI labels',
    design_capacity_mah:'0x41AD86-0x41ADFC: LE16@39 x10; mAh UI label@0x4B49F6',
    full_charge_capacity_mah:'0x41AE02-0x41AE70: LE16@41 x10; stock local truncates to16bits',
    remaining_capacity_mah:'0x41AE74-0x41AF14: LE16@43 x10; mAh UI label@0x4B47C2',
    soc_percent:'0x41B012-0x41B10D: LE16@45 -> progressBar_SOC, no scale',
    current_ma:'0x41B1CC-0x41B31B: signed LE32@47; mA UI label@0x4C0F47',
    cycle_count:'0x41B323-0x41B40C: LE16@51 -> CycleCount',
    balance_mask:'0x41B414-0x41B47F: LE16@53; bit names unassigned',
    firmware_version:'0x41B733-0x41B7F9: signed byte55, hexadecimal text, dot inserted at1; 0x24 ->2.4',
    device_id_raw:'0x41B486-0x41B557: LE32@56 -> Idcode',
    allow_sleep_delay_raw:'0x41B55D-0x41B5C8: LE16@60 -> DelayForSleep; unit unknown',
    battery_status_bytes:'0x41BA87-0x41BB2C: raw bytes62..64; individual bit meanings not decoded',
    pack_status_raw:'0x41BB32-0x41BBCF: LE16@65 -> Pack_Status; individual bit meanings not decoded',
    soh_percent:'0x41B608-0x41B676 and0x41B946-0x41BA82: wire byte72; zero has a separate derived stock fallback',
    battery_address_raw:'0x41B5CF-0x41B602: byte73 -> Bat_Addr',
    rtc_components:'0x41BC6D-0x41C04B: year=2018+byte74; unsigned bytes75..79; clock/timezone unverified',
    maximum_charging_interval_raw:'0x41C2A7-0x41C369: LE16@80; unit unknown',
    secondary_voltage_mv:'0x41C466-0x41C4D1: LE16@82; mV UI label@0x4B4CC3',
    secondary_current_ma:'0x41C4D8-0x41C543 and0x41C629-0x41C6D4: signed LE16@84; mA UI label@0x4B4C65',
    secondary_temperature_c:'0x41C54A-0x41C5CD: trunc(signed16(LE16@86-2731)/10); stock blank if -273',
    unknown_payload:'bytes67..70 retained as raw without an assigned meaning',
    stock_parser_conflict:'0x41C37E-0x41C3E1 reads88..89 as charging interval, but these are XOR/footer in a90-byte packet; omitted'
  };
  const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const s16=value=>(value&32768)?value-65536:value;
  function decode(input){
    const result={schema:SCHEMA,decoder_version:DECODER_VERSION,status:'invalid',validated_packet:false,
      checksum_valid:false,fields:{},evidence:JSON.parse(JSON.stringify(EVIDENCE)),warnings:[]};
    let raw;
    if(typeof input==='string'){
      if(!/^(?:[0-9a-fA-F]{2})*$/.test(input))return {...result,reason:'invalid_hex',raw_hex:null};
      raw=Uint8Array.from(input.match(/../g)||[],x=>parseInt(x,16));
    }else if(input instanceof Uint8Array||Object.prototype.toString.call(input)==='[object Uint8Array]'){
      raw=new Uint8Array(input);
    }else return {...result,reason:'bytes_required',raw_hex:null};
    result.raw_hex=toHex(raw);
    if(raw.length!==PACKET_LENGTH)return {...result,reason:'information_packet_must_be_exactly_90_bytes'};
    if(raw[0]!==0x68||raw[89]!==0x16)return {...result,reason:'invalid_header_or_footer'};
    if(raw[1]!==raw.length||raw[2]!==((raw[1]^255)&255))return {...result,reason:'invalid_length_or_complement'};
    let checksum=0;for(let i=0;i<raw.length-2;i++)checksum^=raw[i];
    if(checksum!==raw[88])return {...result,reason:'invalid_xor_checksum'};
    result.validated_packet=result.checksum_valid=true;
    if(raw[3]!==0)return {...result,reason:'not_information_command'};
    const count=raw[71];
    if(count<1||count>16)return {...result,reason:'cell_count_outside_stock_16_slot_layout'};
    const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),u16=offset=>view.getUint16(offset,true);
    const cells=Array.from({length:count},(_,i)=>u16(4+2*i));
    const temperatures=[36,37,38].map(offset=>view.getInt8(offset));
    const fullCapacity=u16(41)*10,secondaryTemp=Math.trunc(s16((u16(86)-2731)&65535)/10)||0;
    const versionHex=raw[55]<128?raw[55].toString(16):null;
    const firmware=versionHex===null?null:versionHex.slice(0,1)+'.'+versionHex.slice(1);
    const fields={
      cell_count:count,cells_mv:cells,cell_sum_mv:cells.reduce((sum,value)=>sum+value,0),
      min_cell_mv:Math.min(...cells),max_cell_mv:Math.max(...cells),delta_cell_mv:Math.max(...cells)-Math.min(...cells),
      temperatures_c:temperatures,design_capacity_mah:u16(39)*10,full_charge_capacity_mah:fullCapacity,
      remaining_capacity_mah:u16(43)*10,soc_percent:u16(45),current_ma:view.getInt32(47,true),
      cycle_count:u16(51),balance_mask:u16(53),firmware_version:firmware,firmware_version_raw:raw[55],
      device_id_raw:view.getUint32(56,true),allow_sleep_delay_raw:u16(60),
      battery_status_bytes:Array.from(raw.slice(62,65)),pack_status_raw:u16(65),soh_percent:raw[72],battery_address_raw:raw[73],
      rtc_components:{year:2018+raw[74],month:raw[75],day:raw[76],hour:raw[77],minute:raw[78],second:raw[79]},
      maximum_charging_interval_raw:u16(80),secondary_voltage_mv:u16(82),secondary_current_ma:view.getInt16(84,true),
      secondary_temperature_c:secondaryTemp===-273?null:secondaryTemp,secondary_temperature_raw:u16(86)
    };
    const derived={cell_sum_mv:'sum_of_reported_cells_not_separately_measured_pack_voltage'};
    if(raw[72]===0&&fields.design_capacity_mah!==0){
      derived.stock_soh_display_percent=(fullCapacity&65535)/fields.design_capacity_mah*100;
      result.warnings.push('stock_soh_fallback_is_derived_not_reported_soh');
    }
    if(fullCapacity>65535){
      derived.stock_full_charge_capacity_display_mah=fullCapacity&65535;
      result.warnings.push('stock_full_charge_capacity_ui_truncates_to_16_bits');
    }
    if(secondaryTemp===-273)result.warnings.push('secondary_temperature_blank_in_stock_ui');
    if(firmware===null)result.warnings.push('signed_char_firmware_format_not_interpreted');
    if(fields.soc_percent>100||fields.soh_percent>100)result.warnings.push('reported_percentage_outside_0_to_100_retained_raw');
    return {...result,status:'decoded',command:0,fields,derived,
      unknown_ranges:[{offset:67,length:4,raw_hex:toHex(raw.slice(67,71))}],
      limitations:['Stock parser layout confirmed; physical calibration is not independently established.',
        'Serial adapter packets are not a raw CAN log; no CAN ID or sender is inferred.',
        'Current charge/discharge polarity and individual status-bit meanings remain unconfirmed.',
        'RTC components are reported by the BMS, without a verified timezone or clock accuracy.',
        'Bytes88/89 are framing and are never interpreted as a charging interval.']};
  }
  root.BySpardInformation={decode,SCHEMA,DECODER_VERSION};
  if(typeof module!=='undefined')module.exports={decode,SCHEMA,DECODER_VERSION};
})(typeof globalThis!=='undefined'?globalThis:this);
