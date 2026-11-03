/* Passive receive timing comparison. Each step is an independently finalized archive. */
'use strict';
(() => {
  const PROFILES=['DEFAULT','LATE','TRIPLE','LATE_TRIPLE','SP625','SP625_TRIPLE','SP6875','SP6875_TRIPLE','MID','MID_TRIPLE'];
  const PLAN=['TRIPLE','SP625','SP625_TRIPLE','SP6875','SP6875_TRIPLE','DEFAULT','MID','MID_TRIPLE','TRIPLE'];
  const BATTERY=['04F83400','04F83401','04F83402','04FF1400'];
  const groups=counts=>({battery:BATTERY.reduce((n,id)=>n+(counts?.[id]||0),0),
    controller:Object.entries(counts||{}).filter(([id])=>id.startsWith('02')).reduce((n,[,v])=>n+v,0),
    torque:counts?.['01F83100']||0,hmi:(counts?.['03106300']||0)+(counts?.['03106303']||0)});
  function compare(rows){
    const valid=r=>r.verified===true&&r.quality?.received_frames>0&&Number.isFinite(r.quality?.errors_per_second)&&r.quality.errors_per_second>=0;
    const first=rows[0],last=rows.at(-1);
    if(rows.length!==PLAN.length||!valid(first)||!valid(last)||first.profile!=='TRIPLE'||last.profile!=='TRIPLE')return {candidate:null,reason:'Нет полной серии с двумя контрольными записями TRIPLE.'};
    const rate=(r,key)=>key==='total'?r.quality.frames_per_second:(r.groups[key]||0)/r.quality.elapsed_seconds;
    const ratio=(a,b)=>Math.min(a,b)>0?Math.max(a,b)/Math.min(a,b):a===b?1:Infinity;
    if(ratio(rate(first,'total'),rate(last,'total'))>1.2||['battery','controller','torque','hmi'].some(k=>(rate(first,k)>0)!==(rate(last,k)>0)))return {candidate:null,reason:'Состав или интенсивность CAN изменились между контрольными тестами.'};
    if(ratio(first.quality.errors_per_second,last.quality.errors_per_second)>2)return {candidate:null,reason:'Частота ошибок между контрольными тестами изменилась более чем вдвое.'};
    const baseline=key=>Math.min(rate(first,key),rate(last,key));
    const scored=rows.map(r=>{
      const eligible=valid(r)&&rate(r,'total')>=baseline('total')*.85&&['battery','controller','torque','hmi'].every(k=>!baseline(k)||rate(r,k)>=baseline(k)*.5);
      return {...r,eligible};
    });
    const ranked=scored.filter(r=>r.eligible).sort((a,b)=>a.quality.errors_per_second-b.quality.errors_per_second);
    return {candidate:ranked[0]?.profile||null,reason:ranked.length?'Предварительный кандидат по ошибкам и сохранению состава сообщений. Требует повторной проверки.':'Нет профиля с достаточным приёмом сообщений.',rows:scored};
  }
  class Tuner {
    constructor(runtime){this.runtime=runtime;this.active=false;this.token=Symbol('sampling-sweep');this.rows=[];this.phase='idle';}
    snapshot(){return {active:this.active,id:this.id,phase:this.phase,step:this.step||0,total:PLAN.length,duration:this.duration,profile:this.profile,rows:this.rows,result:this.result,error:this.error,restored:this.restored};}
    context(){return {id:this.id,step:this.step,total:PLAN.length,profile:this.profile,duration_s:this.duration};}
    async start(duration,{beforeStart}={}){
      const r=this.runtime;
      if(![30,60].includes(duration))throw Error('Выберите 30 или 60 секунд на этап');
      if(this.active||r.recorder||r.operation||r.ending||r.finishPromise||r.flashBusy||r.scan.active||r.wifi||!r.transport.connected)throw Error('Подключите USB-ридер и завершите текущую операцию');
      this.active=true;this.phase='preparing';this.error=null;this.result=null;this.restored=null;this.rows=[];this.cancelled=false;this.id=ByStore.uuid();this.duration=duration;this.step=0;
      try{
        await beforeStart?.();const current=await r.transport.poll();r.device=current;
        if(current.can!=='stopped'||current.rx_check?.state==='running')throw Error('Сначала остановите CAN и проверку сигнала');
        if(!Array.isArray(current.sampling_profiles)||!PLAN.every(p=>current.sampling_profiles.includes(p)))throw Error('Для автоподбора установите прошивку ESP32 0.4.8');
        this.boot=current.boot;this.original=current.rx_sampling_250k;this.beforeStart=beforeStart;
        this.work=this.run().catch(e=>{this.error=String(e.message||e);this.phase='failed';}).finally(()=>{this.active=false;});
        return {ok:true,total:PLAN.length,duration};
      }catch(e){this.active=false;this.phase='failed';this.error=e.message;throw e;}
    }
    check(){if(this.cancelled)throw Error('Автоподбор остановлен');if(!this.runtime.transport.connected||this.runtime.device.boot!==this.boot)throw Error('USB отключён или ридер перезапущен');}
    onFinished(session,reason){if(this.waiting){const done=this.waiting;this.waiting=null;done({session,reason});}}
    onFailure(error){if(this.waiting){const done=this.waiting;this.waiting=null;done({error});}}
    async cancel(){
      this.cancelled=true;this.phase='cancelling';
      const r=this.runtime;
      if(r.recorder?.session?.context?.sampling_sweep?.id===this.id)await r.finish('tuning_cancelled');
      return {ok:true};
    }
    async run(){
      const r=this.runtime;
      try{
        for(const [index,profile] of PLAN.entries()){
          await this.beforeStart?.();this.check();this.step=index+1;this.profile=profile;this.phase='preparing';
          await r.setSampling(profile,{tuningToken:this.token});this.check();
          const completion=new Promise(resolve=>{this.waiting=resolve;});
          try{await r.begin(250000,{duration:this.duration,fixed:true,tuningToken:this.token,beforeStart:async()=>{await this.beforeStart?.();this.check();}});}
          catch(e){this.waiting=null;throw e;}
          this.phase='recording';const outcome=await completion;this.check();
          if(outcome.error)throw outcome.error;
          const s=outcome.session;
          if(!s||outcome.reason!=='timer'||s.finalization_verified!==true||s.status!=='complete'||s.gaps||s.capture_integrity?.software_drops)throw Error('Этап прерван или сохранение всех принятых кадров не подтверждено');
          this.rows.push({step:this.step,profile,session:s.id,verified:true,quality:s.capture_quality,id_counts:s.id_counts||{},groups:groups(s.id_counts)});
        }
        this.result=compare(this.rows);this.phase='complete';
      }catch(e){this.error=String(e.message||e);this.phase=this.cancelled?'cancelled':'failed';}
      finally{
        this.waiting=null;
        try{
          if(r.transport.connected&&!r.transport.uncertain&&!r.recorder&&!r.ending&&r.device.boot===this.boot&&r.device.can==='stopped'){
            await r.setSampling(this.original,{tuningToken:this.token});this.restored=true;
          }else this.restored=false;
        }catch(e){this.restored=false;this.error=(this.error?this.error+'; ':'')+'Исходный профиль не восстановлен: '+e.message;}
        try{
          const settings=await r.store.settings();
          const report=await ByStore.Recorder.start(r.store,{...r.context(),kind:'sampling_sweep_summary',sweep_id:this.id},settings);
          await report.write([{type:'sampling_sweep_result',host_utc:new Date().toISOString(),...this.snapshot(),active:false}]);
          await report.finish('stop',settings.enabled);
        }catch(e){this.error=(this.error?this.error+'; ':'')+'Не сохранён итог серии: '+e.message;this.phase='failed';}
      }
    }
  }
  globalThis.ByTuning={PROFILES,PLAN,BATTERY,groups,compare,Tuner};
})();
