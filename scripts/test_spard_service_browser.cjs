'use strict';
/* Full portal in Chromium. All battery bytes, serial devices and HTTP replies
 * are synthetic; this test must never contact a real reader or server. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('../qa/browser-test-deps/node_modules/playwright'));}
// Match the uploader's configured origin, but intercept every request below.
const root=path.resolve(__dirname,'..'),origin='https://134.98.158.132:18443';
function packet(command,payload){const raw=Buffer.concat([Buffer.from([0x68,payload.length+6,(payload.length+6)^255,command]),payload,Buffer.from([0,0x16])]);raw[raw.length-2]=raw.subarray(0,-2).reduce((a,b)=>a^b,0);return raw.toString('hex').toUpperCase();}
const info=Buffer.alloc(84);info[67]=10;
const parameters=Buffer.alloc(240);parameters.writeUInt32LE(14700,4);parameters.writeUInt32LE(14600,64);parameters.writeFloatLE(1,92);parameters.writeUInt32LE(10,96);
const fixture={information:packet(0,info),identity:packet(0x30,Buffer.concat([Buffer.alloc(2),Buffer.from('SYNTHETIC-SN'.padEnd(32,'\0')),Buffer.from('TEST-MODEL'.padEnd(32,'\0'))])),parameters:packet(6,parameters)};
async function advance(page,ms){for(let used=0;used<ms;used+=500){await page.clock.runFor(Math.min(500,ms-used));await page.evaluate(()=>Promise.resolve());}}
const digest=raw=>createHash('sha256').update(raw).digest('hex');
async function run(browser,language,width){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],uploads=new Map(),finished=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({fixture,language})=>{
  localStorage.setItem('citybike-view-v1',JSON.stringify({language,theme:'day'}));
  const state={controller:null,writes:[],opens:0,closes:0,pickers:0,espOpens:0,exposeEsp:false},bytes=hex=>Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
  const stock={getInfo:()=>({usbVendorId:0x1a86,usbProductId:0x7523}),async open(options){
   if(options.baudRate!==9600||options.dataBits!==8||options.stopBits!==1||options.parity!=='none'||options.flowControl!=='none')throw Error('Wrong serial settings');
   state.opens++;this.readable=new ReadableStream({start(c){state.controller=c;},cancel(){state.controller=null;}});
   this.writable=new WritableStream({write(raw){
    const hex=Array.from(raw,x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();state.writes.push(hex);
    const response=({'680CF3000000000000009716':fixture.information,'680CF330000000000000A716':fixture.identity,'680CF3060000000000009116':fixture.parameters})[hex];
    if(hex==='680CF3025590D0030055D616')return;
    if(!response)throw Error('Unexpected write '+hex);
    const data=bytes(response);state.controller.enqueue(data.slice(0,11));state.controller.enqueue(data.slice(11));
   }});
  },async close(){state.closes++;state.controller=null;}};
  const esp={getInfo:()=>({usbVendorId:0x303a,usbProductId:0x1001}),async open(){state.espOpens++;throw Error('Stock reads must not open ESP');}};
  Object.defineProperty(navigator,'serial',{configurable:true,value:{getPorts:async()=>state.exposeEsp?[stock,esp]:[stock],requestPort:async()=>{state.pickers++;throw Error('Unexpected picker');},addEventListener(){},removeEventListener(){}}});window.__stockService=state;
 },{fixture,language});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;assert.equal(u.origin,origin,'Never contact a live destination');
  if(p.startsWith('/v1/uploads/')){
   const [, , ,id,op]=p.split('/');let item=uploads.get(id),answer;
   if(!op){const meta=req.postDataJSON();assert.equal(meta.format,'attachment');assert(!item);item={meta,parts:[]};uploads.set(id,item);answer={ok:true,next_part:0};}
   else if(op==='complete'){assert(item);const raw=Buffer.concat(item.parts);assert.equal(raw.length,item.meta.size);assert.equal(digest(raw),item.meta.sha256);finished.push(JSON.parse(raw.toString()));answer={ok:true,id,bytes:raw.length,sha256:item.meta.sha256,kind:'attachment',filename:item.meta.filename};}
   else{assert(item);const raw=req.postDataBuffer();assert.equal(digest(raw),req.headers()['x-content-sha256']);item.parts[Number(op)]=raw;answer={ok:true};}
   return route.fulfill({json:answer});
  }
  if(p==='/api/state')return route.fulfill({json:{device:{},connection:{transport:'webserial',connected:false},app:{browser:true,version:'0.6.8'}}});
  assert.equal(req.method(),'GET','Unexpected mutation '+p);
  const file=path.resolve(root,'web',p==='/'?'index.html':p.slice(1));assert(file.startsWith(path.join(root,'web')+path.sep));assert(fs.existsSync(file),'Missing asset '+p);
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
 });
 try{
  await page.clock.install();await page.goto(origin+'/');await page.waitForFunction(()=>typeof browserRuntime!=='undefined'&&browserRuntime?.ready&&typeof BySpardService!=='undefined');
  await page.evaluate(()=>{browserRuntime.autoConnect=false;__stockService.exposeEsp=true;document.getElementById('diagnostics').open=true;document.getElementById('stockSpardTools').open=true;});
  const expected={ru:['Текущие данные батареи','Модель и серийный номер','Параметры батареи'],en:['Current battery data','Model and serial number','Battery parameters'],nb:['Gjeldende batteridata','Modell og serienummer','Batteriparametere']};
  assert.deepEqual(await page.locator('#spardReadMode option').allTextContents(),expected[language]);
  for(const mode of ['identity','parameters']){
   await page.locator('#spardReadMode').selectOption(mode);await page.locator('#probeSpardAdapter').click();await page.waitForFunction(()=>BySpardProbe.active);
   await page.waitForFunction(()=>document.getElementById('spardReadMode').disabled);
   await advance(page,12000);await page.waitForFunction(()=>!BySpardProbe.active);
   assert.equal(await page.locator('#spardReadMode').isEnabled(),true);
   const result=await page.locator('#spardServiceResult').textContent(),data=JSON.parse(result);
   assert.equal(data.source,'stock_adapter_USB_serial');assert.equal(data.kind,mode);assert.equal(data.continuous_reading,false);assert(Number.isFinite(Date.parse(data.received_utc)));assert(Number.isFinite(Date.parse(data.session_started_utc)));
   assert.equal(data.decoded.status,'decoded');assert.equal(data.decoded.live_reply_validation,false);
   if(mode==='identity'){assert.equal(data.decoded.fields.serial_number.text,'SYNTHETIC-SN');assert.equal(data.decoded.fields.model.text,'TEST-MODEL');}
   else{assert.equal(data.decoded.fields.DC_Parameter.value,14700);assert.equal(data.decoded.fields.FCC_Parameter.value,14600);assert.equal(data.decoded.fields.CellNum.value,10);}
   await page.locator('#spardServiceResult').evaluate(e=>{e.parentElement.open=true;});assert(await page.locator('#spardServiceResult').isVisible());
   if(language!=='ru')assert(!/[А-Яа-яЁё]/.test(await page.locator('#spardAdapterStatus').textContent()),'No Russian status in '+language);
   const log=finished.at(-1);assert.equal(log.capture_status,'complete');assert.equal(log.service_read.kind,mode);assert.equal(log.service_read.reply.raw_hex,fixture[mode]);assert.equal(log.read_query_count,2);assert.equal(log.is_raw_can_log,false);
  }
  const state=await page.evaluate(()=>({opens:__stockService.opens,closes:__stockService.closes,pickers:__stockService.pickers,espOpens:__stockService.espOpens,writes:__stockService.writes}));
  assert.deepEqual(state,{opens:2,closes:2,pickers:0,espOpens:0,writes:['680CF3025590D0030055D616','680CF3000000000000009716','680CF330000000000000A716','680CF3025590D0030055D616','680CF3000000000000009716','680CF3060000000000009116']});
  assert.equal(finished.length,2);assert.deepEqual(errors,[]);
  const layout=await page.evaluate(()=>({width:innerWidth,total:document.documentElement.scrollWidth,overflow:Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right})).slice(-12)}));
  assert(layout.total<=layout.width,'No page overflow '+language+': '+JSON.stringify(layout));
 }finally{await context.close();}
}
(async()=>{
 const options={args:['--no-sandbox']},local='/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
 if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)options.executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
 else if(process.arch==='arm64'&&fs.existsSync(local))options.executablePath=local;
 const browser=await chromium.launch(options);try{for(const language of ['ru','en','nb'])for(const width of [1440,390])await run(browser,language,width);}finally{await browser.close();}
 console.log('PASS Chromium: stock identity/parameters UI, exact synthetic USB reads and SHA-verified uploads, RU/EN/NB desktop/mobile, timestamps, port cleanup, no ESP access or overflow');
})().catch(error=>{console.error(error);process.exitCode=1;});
