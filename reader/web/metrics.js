/* Source-labelled, unconfirmed SYM values. Never invent battery telemetry. */
'use strict';
(() => {
  const sources={
    speed:[[0x02f83201,'Speed','контроллер']],
    voltage:[[0x04f83401,'Battery_Voltage_V','батарея'],[0x02f83201,'CR_Voltage','контроллер']],
    current:[[0x04f83401,'Battery_Current_A','батарея'],[0x02f83201,'Current','контроллер']],
    temperature:[[0x02f83201,'Controller_Temperature','контроллер']],
    charge:[[0x02f83200,'Remaining_Capacity','контроллер']],
    cadence:[[0x01f83100,'Cadence','датчик'],[0x02f83200,'Pedal_Revolution','контроллер']]
  };
  function pick(name,frames,uptime,hostNow){
    const found=[];
    for(const [id,field,source] of sources[name]||[]){
      const frame=[...frames].reverse().find(f=>parseInt(f.id,16)===id&&f.decoded?.status==='decoded_unconfirmed'&&f.decoded.fields?.[field]);
      if(!frame)continue;
      const signal=frame.decoded.fields[field];
      // Keep raw/SYM calculations in the decoder, but avoid presenting a
      // suspected unavailable reading as a measured quantity. Do not revive
      // an older value from this source when its latest sample is unavailable.
      if(signal.validity==='suspected_unavailable'||!Number.isFinite(signal.value))continue;
      const age=Math.max(Math.max(0,((uptime??frame.t_us)-frame.t_us)/1e6),Math.max(0,(hostNow-(frame.host_seen??hostNow))/1000));
      found.push({frame,signal,source,age,stale:age>3});
    }
    // A fresh controller value wins over an old battery value.
    return found.find(x=>!x.stale)||found[0]||null;
  }
  // UI projection only: the runtime owns the test deadline and finalization.
  class Countdown {
    constructor(now=()=>performance.now()){this.now=now;this.sync({phase:'idle'});}
    sync(value={}){
      const duration=Number(value.duration_ms),remaining=Number(value.remaining_ms);
      if(!['running','finalizing'].includes(value.phase)||!Number.isFinite(duration)||duration<=0||!Number.isFinite(remaining)){
        this.phase='idle';this.duration=0;this.deadline=0;return;
      }
      this.phase=value.phase;this.duration=duration;
      this.deadline=this.now()+Math.max(0,Math.min(duration,remaining));
    }
    view(){
      if(this.phase==='idle')return {phase:'idle',remaining_ms:0,progress:0,label:'—:—'};
      const remaining=this.phase==='finalizing'?0:Math.max(0,this.deadline-this.now());
      const seconds=Math.ceil(remaining/1000),phase=remaining>0?'running':'finalizing';
      return {phase,remaining_ms:remaining,progress:Math.max(0,Math.min(1,1-remaining/this.duration)),
        label:String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')};
    }
  }
  globalThis.ByMetrics={pick,Countdown};
})();
