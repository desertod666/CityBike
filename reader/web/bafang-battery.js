/* Passive Bafang V2.5 battery replies. No commands, timers, ports or uploads.
 * Reference p28: 6400 design, 6401 charge history, 6402..6409 cell groups.
 * Scale checked against genuine ESP capture current-bafang-cell-replies.json.
 * A matching layout is not a validation of all Spard/Phylion revisions. */
'use strict';
(() => {
  const FRESH_MS=5000,COHORT_US=100000;
  function known(id){return Number.isInteger(id)&&id>=0&&id<0x20000000&&(id>>>24)===4&&((id>>>16)&7)===2&&((id&65535)===0x6400||(id&65535)===0x6401||(id&65535)>=0x6402&&(id&65535)<=0x6409);}
  function decode(f){
    if(!f||f.extended!==true||f.rtr!==false||typeof f.id!=='string'||!/^[a-f0-9]{1,8}$/i.test(f.id)||!known(parseInt(f.id,16))||!Number.isInteger(f.dlc)||f.dlc<0||f.dlc>8||typeof f.data!=='string'||!/^(?:[a-f0-9]{2})*$/i.test(f.data)||f.data.length!==f.dlc*2)return null;
    const id=parseInt(f.id,16),object=id&65535,bytes=Uint8Array.from(f.data.match(/../g)||[],s=>parseInt(s,16)),word=i=>bytes[i]|bytes[i+1]<<8;
    const result={id:f.id.toUpperCase().padStart(8,'0'),source:4,destination:(id>>>19)&31,object,raw_hex:f.data.toUpperCase(),reference:'Bafang GYE-1--02 V2.5 p28',compatibility:'reference_not_manufacturer_validation'};
    if(object===0x6400){if(f.dlc!==4)return null;return {...result,kind:'design',series:bytes[0],parallel:bytes[1],design_mah:word(2),series_valid:bytes[0]>=1&&bytes[0]<=32};}
    if(object===0x6401){if(f.dlc!==6)return null;return {...result,kind:'charging',cycles:word(0),longest_uncharged_h:word(2),recent_uncharged_h:word(4)};}
    if(f.dlc<2||f.dlc%2)return null;
    return {...result,kind:'cells',first_cell:(object-0x6402)*4+1,raw_cells_mv:Array.from({length:f.dlc/2},(_,i)=>word(i*2))};
  }
  function model(snapshot,extraAge=0){
    if(!Number.isFinite(extraAge)||extraAge<0||!snapshot||snapshot.schema!==1||typeof snapshot.stream_active!=='boolean'||typeof snapshot.boot!=='string'||!/^[A-F0-9]{8}$/.test(snapshot.boot)||!Number.isSafeInteger(snapshot.epoch)||snapshot.epoch<0||!Array.isArray(snapshot.frames)||snapshot.frames.length>64)return null;
    const entries=[];const seen=new Set();
    for(const f of snapshot.frames){const d=decode(f);if(!d)continue;
      if(!Number.isSafeInteger(f.seq)||f.seq<0||!Number.isSafeInteger(f.t_us)||f.t_us<0||!Number.isSafeInteger(f.age_ms)||f.age_ms<0||f.age_ms>86400000||seen.has(d.id))return null;
      // Cached frames inherit snapshot scope; full frame fixtures must agree.
      if(f.boot!==undefined&&f.boot!==snapshot.boot||f.epoch!==undefined&&f.epoch!==snapshot.epoch)return null;
      seen.add(d.id);entries.push({frame:f,decoded:d});
    }
    if(!entries.length)return null;
    const flows=new Map();for(const e of entries){const k=e.decoded.destination;if(!flows.has(k))flows.set(k,[]);flows.get(k).push(e);}
    // Never combine responses addressed to different clients. Prefer the most
    // recently observed valid design response; no synthetic series count.
    const groups=[...flows.values()].sort((a,b)=>{
      const design=x=>x.find(e=>e.decoded.kind==='design'&&e.decoded.series_valid)?.frame.t_us??-1;
      return design(b)-design(a)||Math.max(...b.map(e=>e.frame.t_us))-Math.max(...a.map(e=>e.frame.t_us));
    });
    const selected=groups[0],design=selected.find(e=>e.decoded.kind==='design')||null,charging=selected.find(e=>e.decoded.kind==='charging')||null;
    const cells=[];const needed=[];const count=design?.decoded.series_valid?design.decoded.series:null;
    if(count)for(let i=0;i<count;i++){
      const e=selected.find(e=>e.decoded.object===0x6402+Math.floor(i/4)),raw=e?.decoded.raw_cells_mv[i%4];
      cells.push({index:i+1,mv:raw??null,id:e?.decoded.id??null});if(e&&!needed.includes(e))needed.push(e);
    }
    const complete=!!count&&cells.every(c=>c.mv!==null),cohort=design?[design,...needed]:[],span=cohort.length?Math.max(...cohort.map(e=>e.frame.t_us))-Math.min(...cohort.map(e=>e.frame.t_us)):null;
    const coherent=complete&&span<=COHORT_US,usable=coherent&&cells.every(c=>c.mv>0&&c.mv<65535);
    const age=e=>Math.max(0,e.frame.age_ms)+Math.max(0,extraAge),ageMs=cohort.length?Math.max(...cohort.map(age)):Math.max(...selected.map(age));
    return {boot:snapshot.boot,epoch:snapshot.epoch,destination:selected[0].decoded.destination,design,charging,cells,entries:selected,complete,coherent,span_us:span,age_ms:ageMs,
      stale:snapshot.stream_active!==true||ageMs>FRESH_MS,sum_mv:usable?cells.reduce((n,c)=>n+c.mv,0):null,delta_mv:usable?Math.max(...cells.map(c=>c.mv))-Math.min(...cells.map(c=>c.mv)):null};
  }
  function cards(snapshot,extraAge=0){
    const m=model(snapshot,extraAge);if(!m)return [];
    const n=new Intl.NumberFormat(globalThis.ByI18n?.locale?.()||'ru-RU',{maximumFractionDigits:3}),rows=[];
    const field=(key,name,value,unit='')=>({key,name,value:value===null?'—':n.format(value),unit});
    function card(e,title,fields){const age=e.frame.age_ms+Math.max(0,extraAge);return {id:e.decoded.id,title,fields,age_ms:age,stale:snapshot.stream_active!==true||age>FRESH_MS,observed:true,invalid:false};}
    if(m.design){const e=m.design,d=e.decoded;rows.push(card(e,'Батарея · паспортные данные',[
      field('Series_Count','Последовательных ячеек',d.series),field('Parallel_Count','Параллельных ячеек',d.parallel),field('Design_Capacity_mAh','Номинальная ёмкость',d.design_mah,'мА·ч'),
      field('Cell_Sum_V','Сумма ячеек · расчёт',m.sum_mv===null?null:m.sum_mv/1000,'В'),field('Cell_Delta_mV','Разброс ячеек · расчёт',m.delta_mv,'мВ')
    ]));}
    if(m.charging){const e=m.charging,d=e.decoded;rows.push(card(e,'Батарея · циклы и хранение',[
      field('Cycle_Count','Количество циклов',d.cycles),field('Max_Uncharged_h','Самый долгий перерыв зарядки',d.longest_uncharged_h,'ч'),field('Recent_Uncharged_h','Последний перерыв зарядки',d.recent_uncharged_h,'ч')
    ]));}
    if(m.design?.decoded.series_valid)for(const e of m.entries.filter(e=>e.decoded.kind==='cells')){
      const fields=[];for(let k=0;k<4;k++){const index=e.decoded.first_cell+k;if(index>m.cells.length)break;const raw=e.decoded.raw_cells_mv[k];
        const f=field('Cell_'+index+'_V','Ячейка '+index,raw===undefined||raw===65535?null:raw/1000,'В');if(raw===65535)f.note='raw 0xFFFF · значение не подтверждено';fields.push(f);
      }
      if(fields.length)rows.push(card(e,'Батарея · напряжения ячеек',fields));
    }
    // The design remains a real received message, but calculated fields cannot
    // look fresh when any contributing cell group is stale or incomplete.
    if(rows[0]&&m.design)rows[0].stale=rows[0].stale||m.stale;
    return rows;
  }
  globalThis.ByBafangBattery={known,decode,model,cards,FRESH_MS,COHORT_US};
  if(typeof module!=='undefined')module.exports=globalThis.ByBafangBattery;
})();
