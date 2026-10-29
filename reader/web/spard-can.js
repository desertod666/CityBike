/* Bounded CAN packet assembly only. Never opens a port or transmits a frame. */
'use strict';
(function(root){
 const MAX_GAP_US=100000,MAX_FRAGMENTS=255,MAX_DIAGNOSTICS=16;
 const header=b=>b.length>=3&&b[0]===0x68&&b[1]>=6&&(b[1]^b[2])===255;
 const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
 const bytes=s=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
 const safe=x=>Number.isSafeInteger(x)&&x>=0;
 class Assembler{
  constructor(){this.pending=null;this.scope=null;this.previousSeq=null;this.events=[];this.diagnostics=[];this.counts={valid:0,incomplete:0,invalid:0,orphan:0};}
  note(reason,f){this.diagnostics.push({reason,seq:f?.seq??null});if(this.diagnostics.length>MAX_DIAGNOSTICS)this.diagnostics.shift();}
  close(reason,boundary=true){
   if(!this.pending)return;
   const p=this.pending;this.pending=null;const raw=Uint8Array.from(p.data),declared=raw[1],whole=raw.length===declared;
   let xor=0;for(let i=0;i<raw.length-2;i++)xor^=raw[i];
   const valid=whole&&raw[raw.length-1]===0x16&&xor===raw[raw.length-2];
   this.counts[valid?'valid':whole?'invalid':'incomplete']++;
   this.events.push({status:valid?'checksum_valid':whole?'complete_unverified':'incomplete',reason,declared_length:declared,observed_length:raw.length,raw_hex:hex(raw),xor_valid:valid,command:raw.length>3?raw[3]:null,boot:p.frames[0].boot,epoch:p.frames[0].epoch,first_seq:p.frames[0].seq,last_seq:p.frames.at(-1).seq,t_us:p.frames.at(-1).t_us,fragments:p.frames.length,direction:'unknown_shared_can_id'});
   if(!valid){
    // A legitimate binary payload may contain another header. Recover only
    // after the outer packet fails, never pre-empt a valid outer packet.
    const next=p.frames.findIndex((f,i)=>i>0&&header(bytes(f.data)));
    if(next>0){for(const f of p.frames.slice(next))this.payload(f);if(boundary&&this.pending)this.close(reason);}
   }
  }
  payload(f){
   const b=bytes(f.data);
   if(!this.pending){if(!header(b)){this.counts.orphan++;this.note('orphan_fragment',f);return;}this.pending={data:[],frames:[]};}
   const p=this.pending;
   if(p.frames.length>=MAX_FRAGMENTS){this.close('fragment_limit');return;}
   p.data.push(...b);p.frames.push({boot:f.boot,epoch:f.epoch,seq:f.seq,t_us:f.t_us,data:f.data});
   if(p.data.length>=p.data[1])this.close(p.data.length===p.data[1]?'declared_length_reached':'length_overrun',false);
  }
  feed(f){
   this.events=[];
   if(!f||f.type!=='frame')return [];
   if(typeof f.boot!=='string'||!/^[A-F0-9]{8}$/.test(f.boot)||![f.epoch,f.seq,f.t_us].every(safe)||typeof f.id!=='string'||!/^[A-Fa-f0-9]{1,8}$/.test(f.id)||typeof f.extended!=='boolean'||typeof f.rtr!=='boolean'||!Number.isInteger(f.dlc)||f.dlc<0||f.dlc>8||typeof f.data!=='string'||!/^(?:[A-Fa-f0-9]{2})*$/.test(f.data)||f.data.length!==(f.rtr?0:f.dlc*2)||parseInt(f.id,16)>=(f.extended?0x20000000:0x800)){
    this.close('invalid_frame');this.note('invalid_frame',f);return this.events;
   }
   const scope=f.boot+':'+f.epoch;
   if(scope!==this.scope){this.close('scope_changed');this.scope=scope;this.previousSeq=null;}
   if(this.previousSeq!==null){
    if(f.seq<=this.previousSeq){this.close('duplicate_or_reordered_frame');this.note('duplicate_or_reordered_frame',f);return this.events;}
    if(f.seq!==this.previousSeq+1)this.close('saved_sequence_gap');
   }
   this.previousSeq=f.seq;
   if(parseInt(f.id,16)!==0x666||f.extended||f.rtr)return this.events;
   if(f.dlc===0){this.close('empty_fragment');this.note('empty_fragment',f);return this.events;}
   if(this.pending){const delta=f.t_us-this.pending.frames.at(-1).t_us;if(delta<0||delta>MAX_GAP_US)this.close('timeout_or_clock_reset');}
   this.payload(f);return this.events;
  }
  finish(reason='capture_ended'){this.events=[];this.close(reason);return this.events;}
 }
 root.BySpardCan={Assembler,MAX_GAP_US,MAX_FRAGMENTS,MAX_DIAGNOSTICS};
 if(typeof module!=='undefined')module.exports=root.BySpardCan;
})(typeof globalThis!=='undefined'?globalThis:this);
