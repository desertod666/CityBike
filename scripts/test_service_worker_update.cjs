'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const build=fs.readFileSync('web/browser.js','utf8').match(/this\.webBuild='([^']+)'/)[1];
 const handlers={},removed=[],cached=[];let skips=0,claims=0,pending,saved=null,putFail=false,cancels=0,navigates=0;
 const c={URL,Response,MessageChannel,setTimeout,clearTimeout,location:{origin:'https://test.invalid'},fetch:async()=>{throw Error('offline');},caches:{open:async name=>({addAll:async assets=>cached.push({name,assets}),match:async()=>saved,delete:async()=>true,put:async()=>{if(putFail)throw Error("quota");}}),keys:async()=>['bysykkel-0.4.5-recorder2','other-app-cache','bysykkel-web-20261026-sampling-controls1'],delete:async key=>removed.push(key)},self:{addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>skips++,registration:{scope:'https://test.invalid/'},clients:{claim:()=>claims++,get:async()=>({type:'window',url:'https://test.invalid/',navigate:async()=>{navigates++;}})}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('web/sw.js','utf8'),c);
 handlers.install({waitUntil:p=>pending=p});await pending;assert.equal(cached[0].name,'bysykkel-web-'+build);assert.equal(skips,0);assert.equal(claims,0);assert.deepEqual(removed,[]);assert.equal(typeof handlers.message,'function');
 // Activation follows natural closure or the all-tab idle handshake; install alone never takes over.
 handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(removed,['bysykkel-0.4.5-recorder2','bysykkel-web-20261026-sampling-controls1']);assert.equal(claims,1);
 // Malformed/stale handoff metadata never forces navigation.
 for(const handoff of [null,{build:'wrong',at:Date.now(),clients:['tab']},{build,at:Date.now()-400000,clients:['tab']}]){
  saved=new Response(JSON.stringify(handoff));handlers.activate({waitUntil:p=>pending=p});await pending;assert.equal(navigates,0);
 }
 saved=null;putFail=true;
 const tab={id:'tab',url:'https://test.invalid/',postMessage(m,ports){if(m.type.endsWith('cancel')){cancels++;return;}ports[0].postMessage({ok:true,token:m.token});ports[0].close();}};
 c.self.clients.matchAll=async()=>[tab];
 handlers.message({data:{type:'citybike-update-request'},source:{url:'https://test.invalid/'},waitUntil:p=>pending=p});await pending;
 assert.equal(skips,0);assert.equal(cancels,1,'A failed storage commit releases all held tabs');assert.equal(navigates,0);
 console.log('PASS service worker: independent build cache, no takeover at install, old assets retained until activation; active worker claims clients');
})().catch(e=>{console.error(e);process.exitCode=1;});
