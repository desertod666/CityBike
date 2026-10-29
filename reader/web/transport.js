'use strict';
(() => {
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const allowed=c=>typeof c==='string'&&/^(?:REMOTE OFF|REMOTE ON [a-f0-9]{16}|REMOTE ALIVE [a-f0-9]{16} [1-9][0-9]{0,9}|REMOTE (?:KEEP|UP) [a-f0-9]{16} [a-f0-9]{8} [1-9][0-9]{0,9}|REMOTE DOWN [a-f0-9]{16} [a-f0-9]{8} [1-9][0-9]{0,9} [123]|HELP|STATUS|RXCHECK|STOP|SPARD INFO|SPARD QUIET INFO|SELFTEST ISOLATED|SAMPLE TRIPLE|START 250000|GUARD (?:ON|OFF)|LED (?:LOW|HIGH|AUTO|ACTIVE LOW|ACTIVE HIGH)|WIFI (?:[1-9]|10|11) [A-Za-z0-9 ._-]{1,32})$/.test(c);
  const b64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
  async function http(path,body,token,identity){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);try{const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Reader-UI':'1','X-Reader-Session':token,...(identity?{'X-Reader-Identity':identity}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('Ридер: HTTP '+r.status);const result=await r.json();if(result.ok===false)throw Error(result.error||'Команда отклонена');return result;}finally{clearTimeout(timeout);}}
  class SerialTransport {
    constructor(events){this.events=events;this.connected=false;this.state={};this.tail=Promise.resolve();this.decoder=new TextDecoder();this.buffer='';this.latest=0;this.commandSeq=0;this.commandPrefix=ByStore.uuid().slice(0,12);this.uncertain=false;this.lastCommand=null;}
    connect({prompt=true}={}){if(this.connected)return Promise.resolve(this.state);if(this.connecting)return this.connecting;this.connecting=this.openPort(prompt).finally(()=>{this.connecting=null;});return this.connecting;}
    async openPort(prompt){
      if(!navigator.serial){if(!prompt)return null;throw Error('Для USB откройте эту HTTPS-страницу в Chrome или Edge на ПК');}
      if(this.open||this.reader||this.writer)await this.close();
      const compatible=p=>{const i=p.getInfo();return i.usbVendorId===0x303a&&i.usbProductId===0x1001;};
      const ports=navigator.serial.getPorts?await navigator.serial.getPorts():[];
      let selected=this.port&&ports.includes(this.port)?this.port:null;
      if(!selected){const matches=ports.filter(compatible);if(matches.length===1)selected=matches[0];}
      if(!selected&&prompt)selected=await navigator.serial.requestPort({filters:[{usbVendorId:0x303a,usbProductId:0x1001}]});
      if(!selected)return null;
      if(!compatible(selected))throw Error('Выбрано другое устройство');
      this.port=selected;this.expectedMac=null;this.buffer='';this.decoder=new TextDecoder();this.latest=0;this.state={};this.uncertain=false;this.lastCommand=null;
      // Never reset DTR/RTS to force a busy port. The OS lock is respected.
      await selected.open({baudRate:115200,bufferSize:65536});this.open=true;
      try{
        await selected.setSignals({dataTerminalReady:false,requestToSend:false});
        this.reader=selected.readable.getReader();this.writer=selected.writable.getWriter();this.pumpPromise=this.pump();
        const status=await this.call('STATUS');
        if(status.product!=='BafangReader'||status.protocol!==1||!/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(status.ap_mac?.toLowerCase()||'')||['00:00:00:00:00:00','ff:ff:ff:ff:ff:ff'].includes(status.ap_mac?.toLowerCase()))throw Error('Это не наш подтверждённый ESP32 CAN-ридер');
        this.expectedMac=status.ap_mac.toLowerCase();
        await this.call('STOP');try{await this.call('GUARD ON');}catch{this.guardMissing=true;}
        this.verified=true;this.connected=true;return this.state;
      }catch(e){this.verified=false;await this.close();throw e;}
    }
    async restore(){if(this.connected||this.connecting||Date.now()<(this.retryAt||0))return null;try{const state=await this.connect({prompt:false});if(state){this.failures=0;this.retryAt=0;}else this.retryAt=Date.now()+3000;return state;}catch(e){this.retryAt=Date.now()+Math.min(15000,2000*2**Math.min(this.failures||0,3));this.failures=(this.failures||0)+1;this.reconnectError=String(e.message||e);return null;}}
    receiveResult(message){
      const p=this.pending;if(!p)return;
      const finish=(error,status)=>{this.pending=null;clearTimeout(p.timer);if(error)p.reject(error);else{this.lastCommand={id:p.id,command:p.command,correlated:p.correlated,boot:status.boot,final_seq:message.final_seq,stream_end:!!p.correlated&&p.command==='STOP',ok:true};p.resolve(status);}};
      if(p.correlated){
        if(message.type!=='command_result'||message.id!==p.id)return;
        if(message.command!==p.command||(p.boot&&message.boot!==p.boot)){this.uncertain=true;finish(Error('Ридер перезапущен или ответ не соответствует команде'));return;}
        if(!message.ok){finish(Error(message.error||message.message||'Команда отклонена'));return;}
        const status=message.status;
        if(!status||status.type!=='status'||status.boot!==message.boot){this.uncertain=true;finish(Error('Нет итогового состояния команды'));return;}
        this.state=status;finish(null,status);return;
      }
      if(message.type==='error'){finish(Error(message.message||'Команда отклонена'));return;}
      if(message.type!=='status')return;
      if(p.boot&&message.boot!==p.boot){this.uncertain=true;finish(Error('Ридер перезапущен во время команды'));return;}
      if(p.command==='STOP'&&message.can!=='stopped')return;
      if(p.command.startsWith('START ')&&(message.can!=='running'||message.bitrate!==Number(p.command.slice(6))))return;
      if(p.command.startsWith('SAMPLE ')&&message.rx_sampling_250k!==p.command.slice(7))return;
      finish(null,message);
    }
    async pump(){let failure;try{while(this.open){const {value,done}=await this.reader.read();if(done)break;if(value){await this.events.wire({type:'wire',encoding:'base64',data:b64(value),host_utc:new Date().toISOString()});this.buffer+=this.decoder.decode(value,{stream:true});while(this.buffer.includes('\n')){const at=this.buffer.indexOf('\n'),line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);let message;try{message=JSON.parse(line);}catch{await this.events.event({type:'invalid_line',raw:line,host_utc:new Date().toISOString()});continue;}if(message.type==='status'&&this.expectedMac&&message.ap_mac?.toLowerCase()!==this.expectedMac)throw Error('Выбранный USB-ридер изменился');if(message.type==='status')this.state=message;if(message.type==='frame')this.latest=message.seq;await this.events.message(message);this.receiveResult(message);}if(this.buffer.length>65536){await this.events.event({type:'transport_resync',raw:this.buffer,host_utc:new Date().toISOString()});this.buffer='';}}}}catch(e){failure=e;}finally{const unexpected=this.open;this.open=false;this.connected=false;this.verified=false;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('USB отключён'));this.pending=null;}if(unexpected)this.events.lost(failure||Error('USB отключён'));}}
    call(command){if(!allowed(command))return Promise.reject(Error('Команда запрещена'));const operation=async()=>{if(!this.open)throw Error('USB отключён');if(this.uncertain)throw Error('Исход предыдущей команды неизвестен; переподключите USB');if(command==='SELFTEST ISOLATED'&&(!this.verified||!this.connected||!globalThis.ByBatteryQuery?.versionAtLeast(this.state.version,'0.5.5')||!this.state.capabilities?.includes('command_ids')||!this.state.capabilities.includes('isolated_twai_selftest_v1')||this.state.rx_sampling_250k!=='TRIPLE'))throw Error('Самотест требует подтверждённый USB ESP 0.5.5');if(command==='SPARD QUIET INFO'&&(!this.verified||!this.connected||!globalThis.ByBatteryQuery?.supported(this.state,true)||!this.state.capabilities?.includes('command_ids')||!this.state.capabilities.includes('spard_quiet_query_v1')||this.state.rx_sampling_250k!=='TRIPLE'))throw Error('Опрос тихой линии требует подтверждённый USB ESP 0.5.7');if(command==='SPARD INFO'&&(!this.verified||!this.connected||!globalThis.ByBatteryQuery?.supported(this.state)||!this.state.capabilities?.includes('command_ids')||!this.state.capabilities.includes('spard_information_query')||this.state.rx_sampling_250k!=='TRIPLE'))throw Error('Самостоятельный опрос требует подтверждённый USB ESP 0.5.2+');const correlated=Array.isArray(this.state.capabilities)&&this.state.capabilities.includes('command_ids'),id=correlated?this.commandPrefix+'_'+(++this.commandSeq):null;return new Promise((resolve,reject)=>{const p={resolve,reject,command,id,correlated,boot:this.state.boot};p.timer=setTimeout(()=>{if(this.pending!==p)return;this.pending=null;this.uncertain=true;reject(Error('Нет ответа USB; исход команды неизвестен: '+command));},4000);this.pending=p;this.writer.write(new TextEncoder().encode((correlated?'@'+id+' ':'')+command+'\n')).catch(e=>{if(this.pending===p)this.pending=null;clearTimeout(p.timer);this.uncertain=true;reject(e);});});};const result=this.tail.then(operation);this.tail=result.catch(()=>{});return result;}
    async poll(){if(this.open)await this.call('STATUS');return this.state;}
    async drain(latest){const until=performance.now()+2500;while(this.latest<latest&&performance.now()<until)await pause(20);return this.latest>=latest;}
    async close(){this.connected=false;this.open=false;this.verified=false;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('USB закрыт'));this.pending=null;}try{await this.reader?.cancel();await this.pumpPromise;}catch{}try{this.reader?.releaseLock();}catch{}try{this.writer?.releaseLock();}catch{}this.reader=null;this.writer=null;this.pumpPromise=null;try{await this.port?.close();}catch{}}
    release(){try{this.writer?.write(new TextEncoder().encode('STOP\n'));}catch{}}
  }
  class WiFiTransport {
    constructor(events){this.events=events;this.token=ByStore.uuid();this.connected=false;this.cursor=0;this.state={};this.active=false;this.boot=null;}
    async connect(){const state=await http('/api/state');this.state=state.device;if(this.state?.product!=='BafangReader'||this.state.protocol!==1)throw Error('Это не наш CAN-ридер');this.expectedMac=this.state.ap_mac;this.connected=true;this.active=true;this.cursor=this.state.received||0;this.boot=this.state.boot;this.startSocket();return this.state;}
    async call(command){if(!allowed(command))throw Error('Команда запрещена');if(command.startsWith('REMOTE ')||command==='SPARD INFO'||command==='SPARD QUIET INFO'||command==='SELFTEST ISOLATED')throw Error('Активная проверка доступна только по USB');if(command.startsWith('GUARD '))return this.state;if(!this.connected)throw Error('Wi-Fi ридер отключён');await http('/api/command',{command},this.token,this.expectedMac);return this.poll();}
    async poll(){const s=await http('/api/state');if(s.device?.product!=='BafangReader'||s.device.protocol!==1||s.device.ap_mac!==this.expectedMac){this.connected=false;throw Error('Сеть или устройство изменились; команды не отправляются');}this.state=s.device;this.connected=true;if(this.state.can==='running')try{await http('/api/lease',{token:this.token},this.token);}catch(e){if(!String(e).includes('404'))this.leaseError=String(e);}return this.state;}
    async batch(batch){if(this.boot&&this.boot!==batch.boot){this.cursor=0;await this.events.event({type:'device_reset',boot:batch.boot,host_utc:new Date().toISOString()});}this.boot=batch.boot;if(batch.missed)await this.events.event({type:'transport_gap',count:batch.missed,host_utc:new Date().toISOString()});for(const frame of batch.frames){if(frame.seq>this.cursor){await this.events.message(frame);this.cursor=frame.seq;}}}
    startSocket(){if(!this.active)return;let received=false;const socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/stream');this.socket=socket;const ask=()=>{if(this.active&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({after:this.cursor}));};socket.onopen=ask;socket.onmessage=async event=>{try{received=true;await this.batch(JSON.parse(event.data));this.socketTimer=setTimeout(ask,10);}catch(e){this.events.lost(e);socket.close();}};socket.onerror=()=>socket.close();socket.onclose=()=>{if(this.active){this.fallback=true;this.pollFrames();}};this.socketTimer=setTimeout(()=>{if(!received&&socket.readyState!==WebSocket.OPEN)socket.close();},3000);}
    async pollFrames(){if(!this.active)return;try{if(!this.connected)await this.poll();const batch=await http('/api/frames?after='+this.cursor);await this.batch(batch);this.frameTimer=setTimeout(()=>this.pollFrames(),batch.frames.length>=64?10:100);}catch(e){this.connected=false;this.events.lost(e);this.frameTimer=setTimeout(()=>this.pollFrames(),1000);}}
    async drain(latest){const until=performance.now()+2000;while(this.cursor<latest&&performance.now()<until)await pause(20);return this.cursor>=latest;}
    release(){navigator.sendBeacon('/api/release',JSON.stringify({token:this.token}));}
    async close(){this.active=false;clearTimeout(this.socketTimer);clearTimeout(this.frameTimer);this.socket?.close();this.connected=false;}
  }
  globalThis.ByTransport={SerialTransport,WiFiTransport,allowed,http,pause};
})();
