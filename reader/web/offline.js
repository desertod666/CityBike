/* Local reader only: bounded live preview, no USB, cloud, uploads or motor commands. */
'use strict';
(() => {
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const now=()=>performance.now();
  const tr=s=>globalThis.ByI18n?.t(s)||s;
  const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  class OfflineReader {
    constructor(schema,{request,clock=now,newToken=token}={}){
      this.schema=schema;this.clock=clock;this.newToken=newToken;this.session=newToken();
      const rawRequest=request||this.http.bind(this);this.tail=Promise.resolve();
      this.request=(...args)=>{const next=this.tail.then(()=>rawRequest(...args));this.tail=next.catch(()=>{});return next;};
      this.transport={connected:false};this.device={};this.liveData=new ByCanLive.Cache(schema,clock);this.spard=new BySpardCan.Assembler();
      this.cursor=0;this.owns=false;this.mayOwn=false;this.liveViewing=false;this.operation=false;this.lastState=-Infinity;this.lastLease=0;
      this.lost=0;this.error='';this.battery=null;this.closed=false;
    }
    async http(path,body){
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
      try{
        const response=await fetch(path,{method:body===undefined?'GET':'POST',cache:'no-store',signal:abort.signal,
          headers:body===undefined?{}:{'Content-Type':'application/json','X-Reader-UI':'1','X-Reader-Session':this.session,'X-Reader-Identity':this.device.ap_mac||''},
          body:body===undefined?undefined:JSON.stringify(body)});
        if(!response.ok)throw Error('HTTP '+response.status);
        const data=await response.json();if(data.ok===false)throw Error(data.error||'Request rejected');return data;
      }finally{clearTimeout(timer);}
    }
    setState(data){
      const d=data?.device;
      if(d?.product!=='BafangReader'||d.protocol!==1||!Number.isSafeInteger(d.epoch)||!/^[A-F0-9]{8}$/.test(d.boot||'')||! /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(d.ap_mac||''))throw Error('Неверный ответ ридера');
      const changed=this.device.boot!==d.boot||this.device.ap_mac!==d.ap_mac;
      if(changed){this.owns=false;this.mayOwn=false;this.session=this.newToken();this.cursor=0;this.battery=null;this.spard=new BySpardCan.Assembler();this.liveData.reset(d.boot,d.epoch);}
      else if(this.device.epoch!==d.epoch){this.cursor=0;this.battery=null;this.spard=new BySpardCan.Assembler();this.liveData.reset(d.boot,d.epoch);}
      this.device=d;this.network=data.network;this.transport.connected=true;this.lastState=this.clock();this.liveViewing=this.owns&&d.can==='running';
      if(d.can!=='running'){this.owns=false;this.mayOwn=false;this.liveViewing=false;}
      return data;
    }
    async refresh(){return this.setState(await this.request('/api/state'));}
    feed(data){
      if(data.boot!==this.device.boot||!Array.isArray(data.frames)||data.frames.length>64)return;
      this.lost+=Number.isSafeInteger(data.missed)&&data.missed>0?data.missed:0;
      for(const f of data.frames){
        if(!ByCanLive.valid(f)||f.boot!==this.device.boot||f.epoch!==this.device.epoch||f.seq<=this.cursor)continue;
        this.cursor=f.seq;this.liveData.ingest(f);
        for(const packet of this.spard.feed(f)){
          if(packet.status!=='checksum_valid'||packet.command!==0||packet.declared_length!==90)continue;
          const decoded=BySpardInformation.decode(packet.raw_hex);
          if(decoded.status==='decoded')this.battery={fields:decoded.fields,seen:this.clock(),boot:f.boot,epoch:f.epoch};
        }
      }
    }
    async tick(){
      if(this.closed||this.operation)return;
      try{
        if(this.clock()-this.lastState>=1000)await this.refresh();
        if(this.device.can==='running')this.feed(await this.request('/api/frames?after='+this.cursor));
        if(this.owns&&this.clock()-this.lastLease>=2000){await this.request('/api/lease',{token:this.session});this.lastLease=this.clock();}
        this.error='';
      }catch(e){this.error=String(e.message||e);this.transport.connected=false;this.lastState=-Infinity;}
    }
    async api(path){
      if(this.operation)throw Error('Операция уже выполняется');
      this.operation=true;
      try{
        if(path==='/api/live/start'){
          await this.refresh();if(this.device.can==='running')throw Error('CAN уже читается');
          this.mayOwn=true;
          await this.request('/api/command',{command:'START 250000'});
          this.owns=true;this.lastLease=this.clock();await this.refresh();
        }else if(path==='/api/live/stop'){
          if(!this.mayOwn)throw Error('Чтение запущено другим подключением');
          await this.request('/api/command',{command:'STOP'});this.owns=this.mayOwn=this.liveViewing=false;await this.refresh();
        }else throw Error('Недоступная операция');
      }finally{this.operation=false;}
    }
    async saveWifi(ssid,channel){
      if(!/^[A-Za-z0-9 ._-]{1,32}$/.test(ssid)||!Number.isInteger(channel)||channel<1||channel>11)throw Error('Проверьте имя сети и канал');
      await this.refresh();if(this.device.can!=='stopped')throw Error('Сначала остановите чтение CAN');
      await this.request('/api/command',{command:'WIFI '+channel+' '+ssid});
    }
    release(){
      if(this.mayOwn)globalThis.navigator?.sendBeacon?.('/api/release',new Blob([JSON.stringify({token:this.session})],{type:'text/plain'}));
      this.owns=this.mayOwn=this.liveViewing=false;
    }
  }
  globalThis.ByOfflineReader={OfflineReader};
  if(typeof module!=='undefined')module.exports=globalThis.ByOfflineReader;
  if(!globalThis.document)return;
  const get=id=>document.getElementById(id),text=(id,value)=>{get(id).textContent=tr(String(value));};
  let runtime=null,health=null,lastHealth=-Infinity,lastGrid=-Infinity;
  function facts(root,rows){root.replaceChildren();for(const [label,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=tr(label);dd.textContent=value;row.append(dt,dd);root.append(row);}}
  function paint(){
    const d=runtime?.device||{},connected=runtime?.transport.connected;
    text('offlineConnection',connected?'Подключено к ридеру':'Нет связи с ридером');
    text('offlineVersion',d.version||health?.version||'—');text('offlineMac',d.ap_mac||health?.ap_mac||'—');
    text('offlineHeap',(d.heap_free??health?.heap_free??'—')+' B');text('offlineError',runtime?.error||'');
    get('offlineWifiSave').disabled=!connected||d.can!=='stopped'||!!runtime?.operation;
    if(runtime?.network&&!get('offlineSsid').dataset.initialized){get('offlineSsid').value=runtime.network.saved_ssid;get('offlineChannel').value=runtime.network.saved_channel;get('offlineSsid').dataset.initialized='1';}
    text('offlineLoss','Пропуски просмотра: '+(runtime?.lost||0));
    const b=runtime?.battery;get('offlineSpard').hidden=!b;
    if(b){
      const age=runtime.clock()-b.seen,stale=!connected||d.can!=='running'||age>5000,f=b.fields;
      get('offlineSpard').classList.toggle('is-stale',stale);text('offlineSpardAge',stale?'Последние полученные данные':'Текущие данные батареи');
      const n=new Intl.NumberFormat(ByI18n.locale(),{maximumFractionDigits:3});
      facts(get('offlineSpardFacts'),[['Сумма ячеек · расчёт',n.format(f.cell_sum_mv/1000)+' V'],['Ток',n.format(f.current_ma/1000)+' A'],['Заряд',n.format(f.soc_percent)+' %'],['Полная ёмкость',n.format(f.full_charge_capacity_mah)+' mAh'],['Остаток ёмкости',n.format(f.remaining_capacity_mah)+' mAh'],['Температура батареи',f.temperatures_c.map(v=>n.format(v)+' °C').join(' / ')],['Разброс ячеек · расчёт',n.format(f.delta_cell_mv)+' mV']]);
      get('offlineSpardCells').replaceChildren();f.cells_mv.forEach((mv,i)=>{const cell=document.createElement('span');cell.textContent=tr('Ячейка')+' '+(i+1)+': '+n.format(mv/1000)+' V';get('offlineSpardCells').append(cell);});
    }
    const active=!!connected&&d.can==='running';
    text('canLiveBadge',active?'CAN · живые данные':connected?'Приём остановлен':'Нет связи с ридером');
    text('canLiveOrigin','ESP32 · напрямую по Wi-Fi');text('canLiveMode','TRIPLE · 250 кбит/с');
    get('canLiveStart').hidden=active;get('canLiveStart').disabled=!connected||!!runtime?.operation;
    get('canLiveStop').hidden=!runtime?.owns;get('canLiveStop').disabled=!connected||!!runtime?.operation;
    if(runtime&&now()-lastGrid>=500){
      lastGrid=now();const snapshot=runtime.liveData.snapshot(d,!!connected),cards=ByCanLive.cards(snapshot,runtime.schema);
      const prefs=ByPreferences.snapshot(),favorites=new Set(prefs.favorites),grid=get('canLiveGrid');grid.replaceChildren();
      for(const card of cards){
        const fields=card.fields.filter(f=>prefs.view!=='favorites'||favorites.has(card.id+':'+f.key));if(!fields.length)continue;
        const article=document.createElement('article'),heading=document.createElement('div'),h=document.createElement('h3'),badge=document.createElement('span'),dl=document.createElement('dl');article.className='can-live-message'+(card.stale?' is-stale':'');heading.className='can-live-message-heading';h.textContent=tr(card.title);badge.textContent=tr(!card.observed?'Нет данных':card.stale?'Последние полученные данные':'Текущие данные');heading.append(h,badge);article.append(heading);
        for(const f of fields){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),star=document.createElement('button'),label=document.createElement('span'),key=card.id+':'+f.key;
          row.className='can-live-field';star.type='button';star.className='favorite-toggle';star.textContent=favorites.has(key)?'★':'☆';star.setAttribute('aria-label',tr('В избранное')+': '+tr(f.name));star.onclick=()=>ByPreferences.toggleFavorite(key);label.textContent=tr(f.name);dt.append(star,label);dd.textContent=f.note?tr('Нет показания'):f.value+(f.unit?' '+tr(f.unit):'');row.append(dt,dd);dl.append(row);}
        article.append(dl);grid.append(article);
      }
      text('canLiveCoverage',cards.filter(c=>c.observed).length+' / '+cards.length+' известных сообщений');
      text('canLiveFavoriteCount','Избрано показателей: '+favorites.size);get('canLiveAll').setAttribute('aria-pressed',String(prefs.view!=='favorites'));get('canLiveFavorites').setAttribute('aria-pressed',String(prefs.view==='favorites'));
      get('canLiveRaw').textContent=snapshot.frames.map(f=>f.id+'  '+(f.rtr?'RTR':f.data)).join('\n');
      get('canFaultEvents').textContent=(snapshot.warning_journal?.events||[]).map(e=>e.last.id+'  '+e.last.data+'  ×'+e.count).join('\n')||tr('Нет данных');
    }
  }
  async function mount(){
    const action=async mode=>{try{await runtime.api('/api/live/'+mode);text('canLiveNotice','');}catch(e){text('canLiveNotice',e.message);}finally{paint();}};
    get('canLiveStart').onclick=()=>action('start');get('canLiveStop').onclick=()=>action('stop');
    get('canLiveAll').onclick=()=>ByPreferences.update({view:'all'});get('canLiveFavorites').onclick=()=>ByPreferences.update({view:'favorites'});
    get('offlineWifiForm').addEventListener('submit',async e=>{e.preventDefault();try{await runtime.saveWifi(get('offlineSsid').value,Number(get('offlineChannel').value));text('offlineWifiResult','Сохранено. Применится после перезапуска питания.');}catch(e){text('offlineWifiResult',e.message);}});
    try{
      const response=await fetch('/decoder_reference.json',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const schema=await response.json();
      runtime=new OfflineReader(schema);
      addEventListener('pagehide',()=>{runtime.closed=true;runtime.release();});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)runtime.release();});
      addEventListener('citybike-preferences',()=>{lastGrid=-Infinity;paint();});
      while(!runtime.closed){
        if(now()-lastHealth>5000){try{health=await runtime.request('/api/health');}catch{}lastHealth=now();}
        await runtime.tick();paint();await pause(150);
      }
    }catch(e){text('offlineError',e.message);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
