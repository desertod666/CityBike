'use strict';
importScripts('/store.js');
self.onmessage=async event=>{try{const store=await new ByStore.Store().open(),session=await store.get('sessions',event.data.id);if(!session||session.status==='recording')throw Error('Запись ещё не завершена');const archive=await store.prepare(session);self.postMessage({ok:true,archive});}catch(e){self.postMessage({ok:false,error:String(e.message||e)});}finally{self.close();}};
