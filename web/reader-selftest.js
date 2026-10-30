/* Fixed isolated reader selftest. This sends no battery-service command. */
'use strict';
(()=>{
 const CAP='isolated_twai_selftest_v1',COMMAND='SELFTEST ISOLATED';
 const layout=[['peripheral_pad10',10,10],['ctx_pad4',4,4],['transceiver_rx5',4,5]];
 function available(d){return d?.product==='BafangReader'&&d.protocol===1&&globalThis.ByBatteryQuery?.versionAtLeast(d.version,'0.5.5')===true&&d.rx_sampling_250k==='TRIPLE'&&['command_ids',CAP].every(c=>d.capabilities?.includes(c));}
 function validProbe(p){
  if(!p||['attempted','passed','ctx_restored'].some(k=>typeof p[k]!=='boolean')||p.driver_installed!==(p.attempted?false:null)||p.low_hold_us!==100||typeof p.reason!=='string'||!/^[a-z_]{1,64}$/.test(p.reason))return false;
  if(['tx','rx'].some(k=>!Array.isArray(p[k])||p[k].length!==3||p[k].some(x=>![-1,0,1].includes(x))))return false;
  if(['low_rc','high_rc'].some(k=>!Number.isInteger(p[k])||p[k]<-2147483648||p[k]>2147483647))return false;
  if(!p.attempted&&(p.passed||[...p.tx,...p.rx].some(x=>x!==-1)))return false;
  return !p.passed||(p.attempted&&p.ctx_restored&&p.low_rc===0&&p.high_rc===0&&p.reason==='gpio_loopback_verified'&&p.tx.every((x,i)=>x===[1,0,1][i])&&p.rx.every((x,i)=>x===[1,0,1][i]));
 }
 function validEcc(e){
  if(e===null)return true;
  if(!e||e.captured_before_cleanup!==true||!Number.isInteger(e.after_event)||e.after_event<0||e.after_event>0xffffffff)return false;
  const v=e.last;if(v===null)return true;
  return !!v&&v.source==='single_HAL_ECC_read'&&v.scope==='boot_history'&&Number.isInteger(v.event)&&v.event>e.after_event&&v.event<=0xffffffff&&Number.isInteger(v.t_us)&&v.t_us>=0&&Number.isInteger(v.raw)&&v.raw>=0&&v.raw<=255&&v.type===(v.raw>>6)&&v.direction===((v.raw>>5)&1)&&v.segment===(v.raw&31)&&typeof v.saturated==='boolean';
 }
 function validate(m,d,id){
  if(!m||m.type!=='reader_selftest_result'||m.id!==id||m.boot!==d.boot||!Number.isSafeInteger(m.epoch)||m.epoch!==d.epoch+1||m.isolation_asserted!==true||m.bitrate!==250000||m.sampling!=='TRIPLE'||m.ack_required!==false||!['complete','failed'].includes(m.state)||typeof m.ctx_restored!=='boolean'||typeof m.driver_retained!=='boolean'||!Array.isArray(m.stages)||m.stages.length!==3)return null;
  if(globalThis.ByBatteryQuery?.versionAtLeast(d.version,'0.5.6')===true&&m.test_frame_dlc!==8)return null;
  if(globalThis.ByBatteryQuery?.versionAtLeast(d.version,'0.6.7')===true||Object.hasOwn(m,'gpio_probe')){
   if(!validProbe(m.gpio_probe)||!validEcc(m.stage3_ecc)||m.stages[2]?.attempted&&(!m.gpio_probe.passed||!m.stage3_ecc)||!m.stages[2]?.attempted&&m.stage3_ecc!==null||m.gpio_probe.attempted&&!m.stages.slice(0,2).every(s=>s.passed))return null;
  }
  let failed=false;
  for(let i=0;i<3;i++){
   const s=m.stages[i],[name,tx,rx]=layout[i];
   if(s?.name!==name||s.tx_gpio!==tx||s.rx_gpio!==rx||![0,1].includes(s.attempted)||typeof s.passed!=='boolean'||typeof s.echo_received!=='boolean'||typeof s.status_valid!=='boolean'||typeof s.reason!=='string'||!/^[a-z_]{1,64}$/.test(s.reason))return null;
   for(const k of ['tx_errors','rx_errors','failed_tx','bus_errors','arbitration_lost','alerts','elapsed_us','tx_out_raw','rx_matrix_raw'])if(!Number.isSafeInteger(s[k])||s[k]<0||s[k]>0xffffffff)return null;
   for(const k of ['install_rc','start_rc','transmit_rc','status_rc','stop_rc','uninstall_rc'])if(!Number.isSafeInteger(s[k])||s[k]<-2147483648||s[k]>2147483647)return null;
   if(failed&&(s.attempted||s.passed))return null;
   if(s.passed&&(!s.attempted||!s.echo_received||!s.status_valid||s.tx_errors||s.rx_errors||s.failed_tx||s.bus_errors||s.arbitration_lost||s.reason!=='self_echo_verified'||['install_rc','start_rc','transmit_rc','status_rc','stop_rc','uninstall_rc'].some(k=>s[k]!==0)))return null;
   if(m.test_frame_dlc===8){const f=s.rx_frame;if(f!==null&&(!f||!Number.isSafeInteger(f.id)||f.id<0||f.id>0x1fffffff||typeof f.extended!=='boolean'||typeof f.rtr!=='boolean'||!Number.isInteger(f.dlc)||f.dlc<0||f.dlc>15||typeof f.data!=='string'||!/^[A-F0-9]{16}$/.test(f.data)))return null;if(s.passed&&(!f||f.id!==0x666||f.extended||f.rtr||f.dlc!==8||f.data!=='0000000000000000'))return null;}
   if(!s.passed)failed=true;
  }
  if((m.state==='complete')!==(m.stages.every(s=>s.passed)&&m.ctx_restored&&!m.driver_retained))return null;
  return structuredClone(m);
 }
 class Test{
  constructor(r){this.r=r;this.phase='idle';this.active=false;this.error='';this.result=null;}
  snapshot(){return {phase:this.phase,error:this.error||null,result:this.result};}
  feed(m){const p=this.r.transport?.pending;if(this.active&&p?.command===COMMAND&&m?.id===p.id){const v=validate(m,this.started,p.id);if(v)this.result=v;if(m.type==='command_result'&&m.command===COMMAND&&m.boot===this.started?.boot&&m.status?.type==='status'&&m.status.boot===m.boot)this.completedStatus=m.status;}}
  async run({isolationAsserted=false,expectedMac,expectedBoot,beforeStep=async()=>{}}={}){
   const r=this.r,t=r.transport;
   if(isolationAsserted!==true)throw Error('Сначала отсоедините CAN-H/CAN-L от велосипеда и подтвердите это');
   if(this.active||r.operation||r.recorder||r.ending||r.flashBusy||r.scan?.active||r.tuner?.active||globalThis.BySpardProbe?.active)throw Error('Ридер занят отдельным тестом');
   if(r.wifi||!t?.connected||!t.verified||t.uncertain)throw Error('Самотест доступен только через подтверждённый USB ESP');
   const boot=expectedBoot||r.device.boot,mac=expectedMac||r.device.ap_mac;
   const guard=()=>{if(!t.connected||t.uncertain||r.device.boot!==boot||r.device.ap_mac!==mac||!available(r.device))throw Error('Ридер изменился или отключён; самотест отменён');};
   this.active=true;r.operation=true;this.phase='preparing';this.error='';this.result=null;this.completedStatus=null;
   try{
    r.device=await t.poll();guard();await beforeStep();guard();
    if(r.device.can==='running'&&!r.liveViewing)throw Error('Приём занят другой операцией');
    if(r.device.rx_check?.state==='running')throw Error('Дождитесь проверки RX');
    const d=await t.call('STOP');r.device=d;
    if(!await t.drain(d.received||0)||d.can!=='stopped'||d.ctx_guard?.valid!==true||d.ctx_guard?.policy!=='fixed_recessive'||d.ctx_guard?.level!==1)throw Error('Пассивное состояние ESP не подтверждено');
    r.liveViewing=false;r.liveRemote=false;guard();await beforeStep();guard();this.started=structuredClone(d);this.phase='running';
    let failure;try{r.device=await t.call(COMMAND);}catch(e){failure=e;}
    const final=this.completedStatus||t.state;r.device=final;guard();
    if(!this.result)throw failure||Error('Полный результат самотеста ESP не получен');
    if(final.boot!==boot||final.epoch!==this.result.epoch||final.can!=='stopped'||final.ctx_guard?.valid!==true||!this.result.ctx_restored||this.result.driver_retained)throw Error('Безопасное завершение самотеста не подтверждено');
    if(failure||this.result.state!=='complete')throw failure||Error('Самотест передатчика не пройден');
    this.phase='complete';return this.result;
   }catch(e){this.phase='failed';this.error=String(e.message||e).slice(0,160);throw e;}
   finally{this.active=false;r.operation=false;}
  }
 }
 let local,remote,dom,pending=false,actionError='',identity='';
 function bind(r){local=r;paint();}
 function remoteState(s){remote=s;paint();}
 function current(){
  if(local?.transport?.connected)return {connected:true,device:local.device,test:local.readerSelftest?.snapshot(),blocked:!!(local.operation||local.recorder||local.ending||local.flashBusy||local.scan?.active||local.tuner?.active||globalThis.BySpardProbe?.active)};
  const a=globalThis.ByRemoteConsole?.snapshot?.(),s=remote||a?.state;return {connected:a?.active&&s?.online===true&&!s.conflict,device:s?.device||{},test:s?.control?.reader_selftest,blocked:s?.control?.ready!==true||s?.control?.busy===true||['queued','accepted','started'].includes(s?.pending?.state)};
 }
 function paint(){
  if(!dom)return;const s=current(),d=s.device||{},q=s.test||{},next=d.ap_mac+':'+d.boot;
  if(identity!==next){identity=next;dom.confirm.checked=false;}
  dom.start.disabled=pending||!s.connected||!available(d)||s.blocked||!dom.confirm.checked;
  dom.status.textContent=actionError||q.error||(!s.connected?'Подключите ESP32 или откройте удалённый доступ.':!available(d)?'Для самотеста нужна прошивка ESP 0.5.5+.':q.phase==='complete'?'Все три ступени пройдены':q.phase==='running'||q.phase==='preparing'?'Проверка передатчика…':'Готов к проверке при отсоединённой CAN');
  dom.rows.replaceChildren();dom.raw.textContent='';const result=q.result;
  if(!result||result.boot!==d.boot)return;
  const names=['CAN-периферия ESP','Выход GPIO4','Передача через трансивер'];
  result.stages.forEach((s,i)=>{const li=document.createElement('li');li.textContent=names[i]+': '+(s.passed?'Пройдено':s.reason==='not_run_after_failure'?'Не запускалась':'Не пройдено');dom.rows.append(li);});
  dom.raw.textContent=JSON.stringify(result,null,2);
 }
 async function start(){
  if(pending||!dom.confirm.checked)return;const s=current(),d=s.device;pending=true;actionError='';dom.confirm.checked=false;paint();
  try{
   if(local?.transport?.connected)await local.readerSelftest.run({isolationAsserted:true,expectedMac:d.ap_mac,expectedBoot:d.boot});
   else if(!await globalThis.ByRemoteConsole?.run('reader_selftest',false,{isolation_asserted:true,expected_mac:d.ap_mac,expected_boot:d.boot}))throw Error('Не удалось подтвердить действие на USB-ПК');
  }catch(e){actionError=String(e.message||e);}finally{pending=false;paint();}
 }
 function mount(){const root=document.getElementById('readerSelftestPanel');if(!root)return;const get=id=>document.getElementById(id);dom={start:get('readerSelftestStart'),confirm:get('readerSelftestIsolated'),status:get('readerSelftestStatus'),rows:get('readerSelftestRows'),raw:get('readerSelftestRaw')};dom.confirm.onchange=paint;dom.start.onclick=start;setInterval(paint,500);paint();}
 globalThis.ByReaderSelftest={Test,available,validate,bind,remoteState,paint};if(typeof module!=='undefined')module.exports=globalThis.ByReaderSelftest;
 if(globalThis.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
})();
