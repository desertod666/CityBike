/* Explicit file submissions use the existing write-only, verified upload service. */
'use strict';
(() => {
  let activeUploads=0;
  const LIMIT=128*1024*1024,PART=2*1024*1024,BASE='https://134.98.158.132:18443',KEY='citybike-analysis-files-v1';
  const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  class FileUploader {
    constructor(update=()=>{}){this.update=update;this.active=false;this.pending=new Map();}
    cancel(){this.controller?.abort();}
    async request(method,path,body,headers={}){
      const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,30000);
      this.controller.signal.addEventListener('abort',abort,{once:true});
      try{
        this.controller.signal.throwIfAborted();
        const response=await fetch(BASE+path,{method,body,headers:{'Content-Type':'application/json',...headers},signal:controller.signal,cache:'no-store'});
        const data=await response.json();if(!response.ok||!data.ok)throw Error('Сервер не принял файл: '+(data.error||response.status));return data;
      }finally{clearTimeout(timer);this.controller.signal.removeEventListener('abort',abort);}
    }
    async send(file){
      if(globalThis.ByAutoUpdate?.holding)throw Error('Сайт обновляется; дождитесь подключения');
      if(this.active)throw Error('Дождитесь завершения текущей загрузки');
      if(!file||!Number.isSafeInteger(file.size)||file.size<1||file.size>LIMIT)throw Error('Выберите непустой файл до 128 МиБ');
      if(typeof file.name!=='string'||!file.name.length||file.name.length>240||/[\\/\x00-\x1f\x7f]/.test(file.name)||['.','..'].includes(file.name))throw Error('Недопустимое имя файла');
      this.active=true;activeUploads++;this.controller=new AbortController();
      try{
        const hash=new ByStore.SHA256();
        for(let offset=0;offset<file.size;offset+=PART){
          this.controller.signal.throwIfAborted();hash.update(new Uint8Array(await file.slice(offset,offset+PART).arrayBuffer()));
          this.update({phase:'hashing',percent:Math.round(Math.min(file.size,offset+PART)/file.size*100),name:file.name});
        }
        const digest=hash.hex(),key=digest+'|'+file.name,uid=this.pending.get(key)||ByStore.uuid();this.pending.set(key,uid);
        const meta={schema:1,id:uid,size:file.size,sha256:digest,parts:Math.ceil(file.size/PART),part_size:PART,format:'attachment',filename:file.name};
        const path='/v1/uploads/'+uid,begin=await this.request('POST',path,JSON.stringify(meta));
        if(!Number.isInteger(begin.next_part)||begin.next_part<0||begin.next_part>meta.parts)throw Error('Неверный ответ о частях файла');
        this.update({phase:'uploading',percent:Math.round(Math.min(file.size,begin.next_part*PART)/file.size*100),name:file.name});
        for(let part=begin.next_part;part<meta.parts;part++){
          this.controller.signal.throwIfAborted();const bytes=new Uint8Array(await file.slice(part*PART,(part+1)*PART).arrayBuffer());
          await this.request('PUT',path+'/'+part,bytes,{'Content-Type':'application/octet-stream','X-Content-SHA256':new ByStore.SHA256().update(bytes).hex()});
          this.update({phase:'uploading',percent:Math.round(Math.min(file.size,(part+1)*PART)/file.size*100),name:file.name});
        }
        this.update({phase:'verifying',percent:100,name:file.name});
        const receipt=await this.request('POST',path+'/complete','{}');
        if(receipt.id!==uid||receipt.sha256!==digest||receipt.bytes!==file.size||receipt.kind!=='attachment'||receipt.filename!==file.name)throw Error('Подтверждение сервера не соответствует файлу');
        this.pending.delete(key);return receipt;
      }finally{this.active=false;activeUploads--;this.controller=null;}
    }
  }
  globalThis.ByFiles={FileUploader,LIMIT,get busy(){return activeUploads>0;}};
  if(typeof document==='undefined')return;
  const input=document.getElementById('analysisFile'),button=document.getElementById('sendAnalysisFile'),cancel=document.getElementById('cancelAnalysisFile'),progress=document.getElementById('analysisFileProgress'),status=document.getElementById('analysisFileStatus'),list=document.getElementById('analysisFileReceipts');
  if(!input||!button)return;
  let receipts=[];try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))receipts=saved.filter(x=>x&&typeof x.filename==='string'&&typeof x.id==='string').slice(0,5);}catch{}
  const filename=value=>{const span=document.createElement('span');span.dataset.i18nSkip='';span.textContent=value;return span;};
  const fileStatus=(prefix,name,suffix)=>status.replaceChildren(document.createTextNode(prefix),filename(name),document.createTextNode(suffix));
  const render=()=>{list.replaceChildren();for(const row of receipts){const item=document.createElement('p');item.append(filename(row.filename),document.createTextNode(' · '+(row.bytes/1048576).toFixed(2)+' МиБ · код '+row.id));list.append(item);}};render();
  const uploader=new FileUploader(row=>{progress.hidden=false;progress.value=row.percent;fileStatus(row.phase==='hashing'?'Проверка файла: ':row.phase==='verifying'?'Проверка получения: ':'Отправка: ',row.name,' · '+row.percent+'%');});
  button.addEventListener('click',()=>input.click());cancel.addEventListener('click',()=>uploader.cancel());
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    button.disabled=true;cancel.hidden=false;
    try{const receipt=await uploader.send(file);receipts=[receipt,...receipts].slice(0,5);try{localStorage.setItem(KEY,JSON.stringify(receipts));}catch{}render();fileStatus('Файл «',file.name,'» получен. Напишите в чате «готово» для начала разбора.');}
    catch(error){status.textContent=error.name==='AbortError'?'Загрузка отменена или истекло время ожидания. Можно выбрать файл повторно.':String(error.message||error);}
    finally{button.disabled=false;cancel.hidden=true;progress.hidden=true;input.value='';}
  });
  window.addEventListener('beforeunload',event=>{if(uploader.active){event.preventDefault();event.returnValue='Файл ещё отправляется';}});
})();
