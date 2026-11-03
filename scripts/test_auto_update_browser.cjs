'use strict';
/* Real Chromium service-worker activation across two tabs; no hardware access. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
let playwright;try{playwright=require('playwright');}catch{playwright=require('../qa/browser-test-deps/node_modules/playwright');}const {chromium}=playwright;
const root=path.resolve(__dirname,'..');let release='one',broken=false;
const html=()=>`<!doctype html><meta charset="utf-8"><title>${release}</title><body><p id="status"></p><script src="/auto-update.js"></script><script>
sessionStorage.loads=String(Number(sessionStorage.loads||0)+1);
window.cancelCount=0;navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='citybike-update-cancel')window.cancelCount++;});
window.ByFiles={busy:false};window.ByAdapter={busy:false};window.BySpardProbe={active:false};
window.runtime={ready:true,webBuild:${JSON.stringify(release)},device:{can:'stopped'},writes:Promise.resolve(),transport:{connected:true,async close(){sessionStorage.closes=String(Number(sessionStorage.closes||0)+1);this.connected=false;}},scan:{active:false},support:{active:false}};
ByAutoUpdate.start(runtime,{interval:3600000,notice:m=>document.querySelector('#status').textContent=m}).then(u=>window.updater=u);
</script>`;
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/legacy-recovery.html'){res.setHeader('Content-Type','text/html');return res.end(html().replace('/auto-update.js','/legacy-auto-update.js'));}
 if(req.url==='/legacy-auto-update.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(root,release==='legacy-one'?'scripts/fixtures/legacy-auto-update.js':'web/auto-update.js')));}
 if(req.url==='/legacy.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Legacy non-responsive tab</title>');}
 if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html());}
 const name=req.url.slice(1),file=path.join(root,'web',name);
 if((broken&&name==='metrics.js')||!fs.existsSync(file)){res.statusCode=404;return res.end('missing');}
 res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/plain');
 let source=fs.readFileSync(file);if(name==='sw.js')source=source.toString().replace(/BUILD='[^']+'/,"BUILD='test-auto-"+release+"'");
 res.end(source);
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(page){await page.waitForFunction(()=>window.updater&&navigator.serviceWorker.controller);}
async function waiting(page){await page.waitForFunction(()=>window.updater?.registration.waiting);}
async function blocked(requester,other,expr){
 await other.evaluate(expr);const before=await requester.evaluate(()=>cancelCount);
 await requester.evaluate(()=>updater.check());await requester.waitForFunction(n=>cancelCount>n,before);
 assert.equal(await requester.title(),'one');assert.equal(await other.title(),'one');
 assert.equal(await requester.evaluate(()=>document.body.inert),false);
 await other.evaluate(()=>{runtime.recorder=null;runtime.flashBusy=false;runtime.apiActive=0;runtime.uploadChecking=false;ByFiles.busy=false;BySpardProbe.active=false;});
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome')?'/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome':undefined),args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),one=await context.newPage(),two=await context.newPage(),errors=[];
  for(const p of [one,two])p.on('pageerror',e=>errors.push(e.message));
  await one.goto(origin);await ready(one);await two.goto(origin);await ready(two);
  assert.equal(await one.evaluate(()=>sessionStorage.loads),'1','Initial installation must not reload');
  // An uncontrolled/hard-reloaded page may reach its first controllerchange
  // during an already committed update. The hold must still trigger reload.
  await one.evaluate(()=>{updater.hadController=false;runtime.recorder={frames:123};});release='two';await two.evaluate(()=>updater.check());await waiting(two);
  await two.waitForFunction(()=>cancelCount>0);assert.equal(await one.title(),'one');
  assert.equal(await one.evaluate(()=>runtime.recorder.frames),123);assert.equal(await one.evaluate(()=>sessionStorage.closes),undefined);
  await one.evaluate(()=>runtime.recorder=null);
  await blocked(two,one,()=>runtime.flashBusy=true);
  await blocked(two,one,()=>BySpardProbe.active=true);
  await blocked(two,one,()=>ByFiles.busy=true);
  await blocked(two,one,()=>runtime.apiActive=1);
  await blocked(two,one,()=>runtime.uploadChecking=true);
  await two.evaluate(()=>updater.check());
  await Promise.all([one.waitForFunction(()=>document.title==='two'),two.waitForFunction(()=>document.title==='two')]);
  await ready(one);await ready(two);
  for(const p of [one,two]){assert.equal(await p.evaluate(()=>sessionStorage.loads),'2');assert.equal(await p.evaluate(()=>sessionStorage.closes),'1');}
  await pause(200);assert.equal(await one.evaluate(()=>sessionStorage.loads),'2','No reload loop');
  // A tab with old code cannot acknowledge the hold: no forced activation.
  const legacy=await context.newPage();await legacy.goto(origin+'/legacy.html');release='three';const count=await two.evaluate(()=>cancelCount);
  await two.evaluate(()=>updater.check());await waiting(two);await two.waitForFunction(n=>cancelCount>n,count);
  assert.equal(await one.title(),'two');assert.equal(await two.evaluate(()=>document.body.inert),false);
  await legacy.close();await two.evaluate(()=>updater.check());await one.waitForFunction(()=>document.title==='three');await two.waitForFunction(()=>document.title==='three');await ready(two);
  // Continuous passive view participates in the same all-tab barrier.
  await one.evaluate(()=>{runtime.device={can:'running',boot:'1234ABCD',ap_mac:'02:00:00:00:00:01'};runtime.liveViewing=true;runtime.liveRemote=false;runtime.liveStop=async()=>{sessionStorage.passiveStops=String(Number(sessionStorage.passiveStops||0)+1);runtime.device.can='stopped';runtime.liveViewing=false;};});
  await two.evaluate(()=>runtime.recorder={});const passiveCancelCount=await one.evaluate(()=>cancelCount);
  release='passive';await two.evaluate(()=>updater.check());await waiting(two);await one.waitForFunction(n=>cancelCount>n,passiveCancelCount);
  assert.equal(await one.title(),'three');assert.equal(await one.evaluate(()=>runtime.updateResume.boot),'1234ABCD');
  await two.evaluate(()=>runtime.recorder=null);await two.evaluate(()=>updater.check());await one.waitForFunction(()=>document.title==='passive');await two.waitForFunction(()=>document.title==='passive');await ready(two);
  assert.equal(await one.evaluate(()=>sessionStorage.passiveStops),'1');
  const resume=await one.evaluate(()=>JSON.parse(sessionStorage.getItem('citybike-update-live-resume')));assert.equal(resume.boot,'1234ABCD');assert.equal(resume.mac,'02:00:00:00:00:01');
  // A failed offline bundle must leave the installed version usable.
  broken=true;release='four';await two.evaluate(()=>updater.check());await pause(700);assert.equal(await two.title(),'passive');assert.equal(await one.title(),'passive');
  await context.setOffline(true);await two.evaluate(()=>updater.check());assert.equal(await two.title(),'passive');
  assert.deepEqual(errors,[]);await context.close();
  // Actual old updater: its first controllerchange returns without reloading,
  // even after the idle hold/USB release. The new worker must recover the tab.
  broken=false;release='legacy-one';const legacyContext=await browser.newContext(),oldPage=await legacyContext.newPage();
  await oldPage.goto(origin+'/legacy-recovery.html');await ready(oldPage);
  assert.equal(await oldPage.evaluate(()=>sessionStorage.loads),'1');
  await oldPage.evaluate(()=>updater.hadController=false);release='legacy-two';await oldPage.evaluate(()=>updater.check());
  await oldPage.waitForFunction(()=>document.title==='legacy-two');await ready(oldPage);
  assert.equal(await oldPage.evaluate(()=>sessionStorage.loads),'2');
  assert.equal(await oldPage.evaluate(()=>sessionStorage.closes),'1');
  assert.equal(await oldPage.evaluate(()=>runtime.updateHold===true),false);
  await pause(300);assert.equal(await oldPage.evaluate(()=>sessionStorage.loads),'2','Legacy recovery must not loop');
  await legacyContext.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log('PASS real service worker: idle two-tab update/reload, USB release, capture/flash/Spard/files/in-flight guards, old-tab refusal, failed bundle/offline preservation, no reload loop');
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
