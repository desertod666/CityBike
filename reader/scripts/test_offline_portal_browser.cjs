'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('../../qa/browser-test-deps/node_modules/playwright'));}
const root=path.resolve(__dirname,'../web'),errors=[],writes=[],requests=[];
const device={type:'status',product:'BafangReader',protocol:1,version:'0.6.9',boot:'12345678',epoch:0,can:'stopped',received:0,heap_free:50000,ap_mac:'01:23:45:67:89:ab'};
let frames=[],failing=false;
function fixture(){
 const f=(id,data,extended=true)=>({type:'frame',boot:device.boot,epoch:device.epoch,seq:frames.length+1,t_us:(frames.length+1)*1000,id,data,extended,rtr:false,dlc:data.length/2});
 frames=[];frames.push(f('02F83201','00000000C40E4E01'));frames.push(f('04F83400','6C391031565664'));
 const b=Buffer.from('685AA500E10FDF0FE20FE10FE10FE10FE20FE10FE10FE10F000000000000000000000000121717BE05BE0565055E000000000000000000240000000000000000012B00CC5F2E010A6400080A1B100D0A0000009F02006A0BAB16','hex');
 for(let i=0;i<b.length;i+=8)frames.push(f('00000666',b.subarray(i,i+8).toString('hex'),false));device.received=frames.length;
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;requests.push(p);
 const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 try{
  if(p.startsWith('/api/')){
   if(failing){res.statusCode=503;return res.end('offline');}
   if(p==='/api/health')return json({...device,wifi_ready:true,wifi_clients:1});
   if(p==='/api/state')return json({device,network:{saved_ssid:'Reader',saved_channel:6}});
   if(p==='/api/frames')return json({boot:device.boot,latest:frames.length,oldest:frames.length?1:0,missed:0,frames:frames.filter(f=>f.seq>Number(url.searchParams.get('after'))).slice(0,64)});
   let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);writes.push([p,body]);
   if(p==='/api/command'){
    assert.equal(req.headers['x-reader-ui'],'1');assert.equal(req.headers['x-reader-identity'],device.ap_mac);
    if(body.command==='START 250000'){device.can='running';device.epoch++;fixture();}
    else if(body.command==='STOP')device.can='stopped';else assert(/^WIFI [1-9] Reader test$/.test(body.command),body.command);
   }else assert(['/api/lease','/api/release'].includes(p));return json({ok:true});
  }
  const name=p==='/'?'offline-index.html':p.slice(1),file=path.resolve(root,name);assert(file.startsWith(root+path.sep)&&fs.existsSync(file),p);
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));
 }catch(e){errors.push(String(e));res.statusCode=500;res.end('test failure');}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const candidates=[process.env.CHROME_BIN,'/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome','/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'].filter(Boolean);
 const executablePath=candidates.find(p=>fs.existsSync(p));const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
 try{for(const width of [390,1360]){
   device.can='stopped';device.epoch=0;frames=[];failing=false;const mark=writes.length;
   const context=await browser.newContext({viewport:{width,height:900}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#offlineVersion').textContent==='0.6.9'&&!document.querySelector('#canLiveStart').disabled);
   assert.equal(writes.length,mark,'No commands on opening the page');assert.equal(await page.locator('#offlineMac').textContent(),device.ap_mac);
   assert.equal(await page.locator('#offlineHeap').textContent(),'50000 B');assert.equal(await page.locator('#offlineLivePanel').count(),1);assert.equal(await page.locator('#espRemotePanel,#uploadPanel,#serviceTools').count(),0);
   await page.locator('#canLiveStart').click();await page.waitForFunction(()=>document.querySelectorAll('#offlineSpardCells>span').length===10);
   assert((await page.locator('#offlineSpardFacts').textContent()).includes('14,700'));
   await page.locator('[data-language-control]').selectOption('ru');await page.waitForFunction(()=>document.querySelector('#offlineSpardCells').textContent.includes('Ячейка'));
   await page.locator('[data-language-control]').selectOption('nb');await page.waitForFunction(()=>document.querySelector('h1').textContent==='ESP32-leser');
   const body=await page.locator('body').innerText();assert(!/[А-Яа-яЁё]/.test(body.replace('Русский','')),body);
   const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(dimensions.scroll<=dimensions.width+2,JSON.stringify(dimensions));
   if(process.env.PORTAL_SCREENSHOT_DIR){const dir=process.env.PORTAL_SCREENSHOT_DIR;fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'portal-'+width+'.png'),fullPage:true});}
   await page.locator('#canLiveStop').click();await page.waitForFunction(()=>!document.querySelector('#canLiveStart').hidden);
   await page.locator('[data-language-control]').selectOption('en');await page.locator('details.card>summary').click();await page.locator('#offlineSsid').fill('Reader test');await page.locator('#offlineWifiSave').click();await page.waitForFunction(()=>document.querySelector('#offlineWifiResult').textContent.includes('Saved'));
   failing=true;await page.waitForFunction(()=>document.querySelector('#offlineConnection').textContent==='No connection to reader');assert(await page.locator('#canLiveStart').isDisabled());
   await context.close();
  }
  assert.deepEqual(errors,[]);assert(!requests.some(p=>/flash|support|files|remote-console|store\.js|browser\.js/.test(p)));console.log('PASS local portal in phone and desktop Chromium: own status, CAN/cells, EN/RU/NB, ownership controls, settings, connection loss and bounded layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
