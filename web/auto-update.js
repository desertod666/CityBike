/* A waiting worker may activate only after every open diagnostic tab is idle. */
'use strict';
(() => {
  const PREFIX='citybike-update-',CHECK_MS=60000,RESUME_KEY='citybike-update-live-resume';
  let current=null;
  function busyReasons(runtime){
    const r=runtime||{},probe=globalThis.BySpardProbe;
    const unsavedProbe=probe?.last?.upload_status==='failed'&&probe.snapshot?.().cache_saved===false;
    return Object.entries({not_ready:!r.ready,unsaved_probe:unsavedProbe,recording:r.recorder,finalizing:r.ending,
      finish_pending:r.finishPromise,operation:r.operation,api_pending:r.apiActive,polling:r.ticking,flashing:r.flashBusy,
      uploading:r.uploading,upload_check:r.uploadChecking,scanning:r.scan?.active,tuning:r.tuner?.active,
      support_running:r.support?.active,stock_ack:r.support?.stockAwaitingAck,support_pending:['accepted','started'].includes(r.support?.last?.state),
      stock_running:probe?.active,adapter_busy:globalThis.ByAdapter?.busy,files_busy:globalThis.ByFiles?.busy,
      remote_request:globalThis.ByRemoteConsole?.busy,ble_remote:globalThis.ByBleRemote?.busy,esp_remote:globalThis.ByEspRemote?.busy,
      can_active:r.transport?.connected&&(r.device?.can!=='stopped'||r.device?.rx_check?.state==='running')})
      .filter(([,value])=>!!value).map(([key])=>key);
  }
  class AutoUpdate {
    constructor(runtime,{serviceWorker=navigator.serviceWorker,reload=()=>location.reload(),notice=()=>{},interval=CHECK_MS}={}){
      this.runtime=runtime;this.sw=serviceWorker;this.reload=reload;this.notice=notice;this.interval=interval;
      this.hold=null;this.reloading=false;this.checking=false;this.lastError='';this.lastCheck=null;
    }
    busy(){return busyReasons(this.runtime).length>0;}
    snapshot(){return {state:this.reloading?'reloading':this.hold?'holding':this.checking?'checking':this.registration?.waiting?'waiting':this.lastError?'error':this.registration?'current':'starting',
      last_error:this.lastError||null,last_check_utc:this.lastCheck,controlled:!!this.sw?.controller,waiting:!!this.registration?.waiting,
      busy_reasons:busyReasons(this.runtime).slice(0,20)};}
    release(token){
      if(!this.hold||this.hold!==token)return;
      if(this.committing||this.preparing){this.cancelAfterCommit=token;return;}
      if(this.resume){this.runtime.updateResume=this.resume;this.resume=null;try{globalThis.sessionStorage?.removeItem(RESUME_KEY);}catch{}}
      this.hold=null;this.runtime.updateHold=false;
      if(typeof document!=='undefined')document.body.inert=false;
    }
    async message(event){
      const m=event.data,reply=event.ports?.[0];
      if(!m||typeof m.type!=='string'||!m.type.startsWith(PREFIX))return;
      if(event.source!==this.registration?.waiting&&event.source!==this.candidate)return;
      if(m.type===PREFIX+'cancel'){this.release(m.token);return;}
      if(!reply||typeof m.token!=='string')return;
      if(m.type===PREFIX+'prepare'){
        const reasons=busyReasons(this.runtime),r=this.runtime;
        const passive=reasons.length===1&&reasons[0]==='can_active'&&r.liveViewing===true&&r.device?.can==='running'&&r.device?.rx_check?.state!=='running'&&typeof r.liveStop==='function';
        if(this.hold||reasons.length&&!passive){reply.postMessage({ok:false,token:m.token});return;}
        this.hold=m.token;this.candidate=event.source;this.runtime.updateHold=true;
        if(typeof document!=='undefined')document.body.inert=true;
        this.preparing=true;
        try{
          // A different tab may have refused the previous barrier before the
          // runtime had a chance to resume. Preserve that intent on retries.
          const resume=passive?{boot:r.device.boot,mac:r.device.ap_mac,remote:r.liveRemote===true,expires_at_ms:Date.now()+120000}:r.updateResume;
          if(resume){
            if(!/^[A-F0-9]{8}$/.test(resume.boot)||typeof resume.mac!=='string'||!globalThis.sessionStorage)throw Error('Cannot preserve live view');
            // Prove storage availability before interrupting the passive stream.
            globalThis.sessionStorage.setItem(RESUME_KEY,JSON.stringify(resume));this.resume=resume;r.updateResume=null;
            if(passive)await r.liveStop();
          }
          reply.postMessage({ok:!this.busy(),token:m.token,reload_on_controllerchange:true});
        }catch(e){this.lastError=String(e?.message||e);reply.postMessage({ok:false,token:m.token});this.cancelAfterCommit=m.token;}
        finally{this.preparing=false;if(this.cancelAfterCommit){const token=this.cancelAfterCommit;this.cancelAfterCommit=null;this.release(token);}}
        return;
      }
      if(m.type===PREFIX+'commit'){
        if(this.hold!==m.token||this.busy()){reply.postMessage({ok:false,token:m.token});return;}
        this.committing=true;
        try{
          // The hold stops polls, remote jobs, new tests and file sends before USB release.
          await this.runtime.writes;
          await this.runtime.transport?.close?.();
          reply.postMessage({ok:true,token:m.token,reload_on_controllerchange:true});
        }catch{reply.postMessage({ok:false,token:m.token});}
        finally{this.committing=false;if(this.cancelAfterCommit){const token=this.cancelAfterCommit;this.cancelAfterCommit=null;this.release(token);}}
      }
    }
    async check(){
      if(this.checking||this.reloading||this.hold)return;
      this.checking=true;this.lastCheck=new Date().toISOString();
      try{
        await this.registration.update();this.lastError='';
        const worker=this.registration.waiting;
        if(worker){this.candidate=worker;this.notice(this.busy()?'Обновление сайта ждёт завершения текущей работы':'Устанавливаю обновление сайта…');worker.postMessage({type:PREFIX+'request'});}
      }catch(e){this.lastError=String(e?.message||e).slice(0,160);/* Keep the installed page and its data when offline. */}
      finally{this.checking=false;}
    }
    async start(){
      this.hadController=!!this.sw.controller;
      this.sw.addEventListener('message',event=>this.message(event));
      this.sw.addEventListener('controllerchange',()=>{
        this.runtime.offlineReady=true;
        // First installation only supplies offline support; it needs no reload.
        this.hadController=true;
        if(this.hold&&!this.reloading){this.reloading=true;this.notice('Сайт обновлён. Восстанавливаю подключение…');this.reload();}
      });
      this.registration=await this.sw.register('/sw.js',{updateViaCache:'none'});
      await this.sw.ready;this.runtime.offlineReady=!!this.sw.controller;
      const watch=()=>{
        const worker=this.registration.installing;if(!worker)return;
        worker.addEventListener('statechange',()=>{if(worker.state==='installed')this.check();if(worker.state==='redundant'&&this.hold)this.release(this.hold);});
      };
      this.registration.addEventListener('updatefound',watch);watch();
      this.timer=setInterval(()=>this.check(),this.interval);
      if(typeof window!=='undefined')window.addEventListener('online',()=>this.check());
      if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')this.check();});
      await this.check();return this;
    }
  }
  globalThis.ByAutoUpdate={AutoUpdate,RESUME_KEY,get holding(){return !!current?.hold;},snapshot(){return current?.snapshot()||null;},async start(runtime,options){current=new AutoUpdate(runtime,options);try{return await current.start();}catch(e){current.lastError=String(e?.message||e).slice(0,160);throw e;}}};
})();
