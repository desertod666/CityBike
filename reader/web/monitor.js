/* A bounded diagnostic relay. Full CAN captures remain in the durable recorder. */
'use strict';
(() => {
  class Monitor {
    constructor(store, endpoint, id) {
      this.store=store; this.endpoint=endpoint; this.id=id; this.enabled=false;
      this.sequence=0; this.queue=[]; this.lines=[]; this.device=null; this.pending=null;
      this.dropped=0; this.sampled=0; this.frameSamples=0; this.lastSent=0; this.error='';
    }
    enable(value) {
      this.enabled=!!value;
      if (!this.enabled) { this.controller?.abort(); this.queue=[]; this.pending=null; }
    }
    capture(event) {
      const device=event.device;
      if (device?.type==='status') { this.device=device; return; }
      if (device?.type==='frame') {
        if (this.frameSamples>=4) { this.sampled++; return; }
        this.frameSamples++;
      }
      // USB chunks duplicate the decoded messages and the full recorder's wire log.
      if (event.type==='wire') return;
      let item=JSON.parse(JSON.stringify(event));
      if (JSON.stringify(item).length>(['reader_selftest_result','battery_tx_diagnostic'].includes(device?.type)?4096:2048)) item={type:'monitor_truncated',original_type:event.type,text:JSON.stringify(item).slice(0,1500)};
      this.lines.push(item); if(this.lines.length>100)this.lines.shift();
      if (this.enabled) { this.queue.push(item); if(this.queue.length>40){this.queue.shift();this.dropped++;} }
    }
    snapshot() {
      return {enabled:this.enabled,active:!!this.sending,last_sent:this.lastSent,error:this.error,
        dropped:this.dropped,sampled_out_frames:this.sampled,lines:this.lines.slice(-15)};
    }
    async flush(source='browser-usb',connected=true) {
      const settings=await this.store.settings(); this.enable(settings.monitor_enabled===true);
      const relay=this.support?.relay?.();if(relay){source=relay.source;connected=relay.connected;}
      const device=relay?.device||this.device,control=this.support?.snapshot(),stock=source==='browser-stock';
      if(!this.enabled||this.sending||(stock?device?.product!=='StockCANAdapter':device?.product!=='BafangReader')||device.protocol!==1||(!stock&&!connected&&!this.queue.length&&!this.pending&&!this.support?.runtime?.flashBusy))return;
      if(this.pending&&(this.pending.source!==source||this.pending.connected!==connected||this.pending.device?.boot!==device.boot||this.pending.device?.epoch!==device.epoch||this.pending.bridge?.boot!==relay?.bridge?.boot||this.pending.control?.local_permission?.manual_mode!==control?.local_permission?.manual_mode||this.pending.control?.local_permission?.remote_support_enabled!==control?.local_permission?.remote_support_enabled))this.pending=null;
      this.sending=true;
      try {
        if(!this.pending) {
          // Keep each packet comfortably below the receiver's 32 KiB limit.
          const envelope={schema:1,source,sequence:this.sequence+1,host_utc:new Date().toISOString(),device,control,...(relay?{bridge:relay.bridge}:{}),events:[],dropped:this.dropped,sampled_out_frames:this.sampled,connected};
          const budget=Math.max(0,Math.min(24000,30000-new TextEncoder().encode(JSON.stringify(envelope)).length));
          const events=[]; let size=0;
          while(this.queue.length&&events.length<40) {
            const next=this.queue[0],length=new TextEncoder().encode(JSON.stringify(next)).length;
            if(size+length+1>budget)break;
            this.queue.shift();if(stock&&(next.type==='device'||next.original_type==='device'))continue;events.push(next);size+=length;
          }
          this.pending={schema:1,source,sequence:++this.sequence,host_utc:new Date().toISOString(),device,control,...(relay?{bridge:relay.bridge}:{}),
            events,dropped:this.dropped,sampled_out_frames:this.sampled,connected};
        }
        if((await this.store.settings()).monitor_enabled!==true){this.enable(false);return;}
        const packet=this.pending;
        this.controller=new AbortController();
        const timer=setTimeout(()=>this.controller?.abort(),8000);
        try {
          const operatorToken=this.endpoint==='https://134.98.158.132:18443'?globalThis.ByRemoteConsole?.token:null;
          const sessionKey=(packet.source==='browser-stock'||packet.source==='browser-usb'&&packet.device.product==='BafangReader'&&packet.device.protocol===1&&/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(packet.device.ap_mac?.toLowerCase()||''))?this.support?.key:null;
          const response=await fetch(this.endpoint+'/v1/monitor/'+this.id,{method:'POST',headers:{'Content-Type':'application/json',...(operatorToken?{Authorization:'Bearer '+operatorToken}:{}),...(sessionKey?{'X-Reader-Control':sessionKey}:{})},
            body:JSON.stringify(packet),signal:this.controller.signal,cache:'no-store'});
          const receipt=await response.json();
          if(!response.ok||!receipt.ok||receipt.sequence!==packet.sequence)throw Error('Монитор: сервер не подтвердил пакет');
          if(this.enabled){this.lastSent=Date.now();this.pending=null;this.error='';this.frameSamples=0;this.support?.acknowledge?.(packet);this.support?.receive(receipt.command);}
        } finally { clearTimeout(timer);this.controller=null; }
      } catch(e) { if(this.enabled)this.error=String(e.message||e); }
      finally { this.sending=false; }
    }
  }
  globalThis.ByMonitor={Monitor};
})();
