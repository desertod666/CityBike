'use strict';
const VERSION='0.4.8',BUILD='20261029-remote2',CACHE='bysykkel-web-'+BUILD;
const ASSETS=['/esp-remote.js','/ble-remote.js','/reader-selftest.js','/bafang-battery.js','/preferences.js','/i18n.js','/appearance.css','/','/style.css','/can-live.js','/can-live.css','/spard-can.js','/battery-query.js','/esp-battery.js','/app.js','/auto-update.js','/remote-console.js','/remote-console.css','/files.js','/adapter.js','/spard-probe.js','/spard-information.js','/spard-battery.js','/decoder.js','/metrics.js','/decoder_reference.json','/capture_profiles.json','/store.js','/transport.js','/tuning.js','/browser.js','/monitor.js','/support.js','/flash-core.js','/remote-flash.js','/archive-worker.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
const HANDOFF='/__citybike_committed_update__';
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(k=>k.startsWith('bysykkel-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
  const cache=await caches.open(CACHE),saved=await cache.match(HANDOFF);if(!saved)return;
  await cache.delete(HANDOFF);let handoff;try{handoff=await saved.json();}catch{return;}
  if(!handoff||typeof handoff!=='object'||handoff.build!==BUILD||!Number.isFinite(handoff.at)||Date.now()-handoff.at<0||Date.now()-handoff.at>300000||!Array.isArray(handoff.clients)||handoff.clients.length>64)return;
  for(const id of handoff.clients){
    if(typeof id!=='string')continue;const client=await self.clients.get(id);
    // Only tabs which acknowledged the idle barrier and released USB are saved.
    // Start navigation without awaiting its load inside the activation event.
    if(client?.type==='window'&&client.url.startsWith(self.registration.scope))client.navigate(client.url).catch(()=>{});
  }
})()));
const PREFIX='citybike-update-';let activating=false;
const windows=async()=>{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});return clients.filter(c=>c.url.startsWith(self.registration.scope));};
function ask(client,type,token){return new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>finish(null),4000);const finish=data=>{clearTimeout(timer);channel.port1.close();resolve({ok:data?.token===token&&data?.ok===true,clientReload:data?.reload_on_controllerchange===true});};channel.port1.onmessage=e=>finish(e.data);try{client.postMessage({type:PREFIX+type,token},[channel.port2]);}catch{finish(null);}});}
self.addEventListener('message',event=>{
  if(event.data?.type!==PREFIX+'request'||activating||!event.source?.url?.startsWith(self.registration.scope))return;
  event.waitUntil((async()=>{
    activating=true;
    try{
      // Retry the SAME idle barrier at different phases of periodic USB polls.
      // No busy check is bypassed, and every failed partial hold is released.
      for(let attempt=0;attempt<4;attempt++){
        const token=BUILD+':'+Date.now()+':'+Math.random();let tabs=[],committed=false;
        try{
          tabs=await windows();if(!tabs.length||tabs.length>64)return;
          const sameTabs=async()=>{const next=await windows();return next.length===tabs.length&&next.every(c=>tabs.some(t=>t.id===c.id));};
          if((await Promise.all(tabs.map(c=>ask(c,'prepare',token)))).every(x=>x.ok)&&await sameTabs()){
            const commits=await Promise.all(tabs.map(c=>ask(c,'commit',token)));
            if(commits.every(x=>x.ok)&&await sameTabs()){
              const cache=await caches.open(CACHE);
              await cache.put(HANDOFF,new Response(JSON.stringify({build:BUILD,at:Date.now(),clients:tabs.filter((c,i)=>!commits[i].clientReload).map(c=>c.id)}),{headers:{'Content-Type':'application/json'}}));
              await self.skipWaiting();committed=true;return;
            }
          }
        }catch{return;}finally{
          if(!committed){try{const cache=await caches.open(CACHE);await cache.delete(HANDOFF);}catch{}for(const tab of tabs)try{tab.postMessage({type:PREFIX+'cancel',token});}catch{}}
        }
        if(attempt<3)await new Promise(resolve=>setTimeout(resolve,250+Math.floor(Math.random()*500)));
      }
    }finally{activating=false;}
  })());
});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==location.origin||event.request.method!=='GET')return;if(url.pathname==='/api/state'){event.respondWith(fetch(event.request).catch(()=>new Response(JSON.stringify({device:{},connection:{transport:'webserial',connected:false},app:{version:VERSION,browser:true,desktop:false}}),{headers:{'Content-Type':'application/json'}})));return;}if(!ASSETS.includes(url.pathname))return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(event.request)));});
