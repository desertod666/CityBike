/* Identify only a user-selected serial adapter. Never open or write its port. */
'use strict';
(() => {
  let active=false;
  const hex=value=>Number.isInteger(value)&&value>=0&&value<=65535?value.toString(16).toUpperCase().padStart(4,'0'):null;
  async function identify(serial){
    if(!serial?.requestPort)throw Error('Нужен Chrome или Edge с доступом к последовательным портам');
    const port=await serial.requestPort(),info=port.getInfo();
    const vendor=hex(info.usbVendorId),product=hex(info.usbProductId);
    if(vendor==='303A'&&product==='1001')throw Error('Выбран наш ESP32. Нажмите снова и выберите штатный донгл Spard (COM4).');
    return {schema:1,kind:'usb_serial_adapter_info',source:'webserial_user_selected',host_utc:new Date().toISOString(),usb_vendor_id:vendor,usb_product_id:product,usb_vendor_id_decimal:vendor?info.usbVendorId:null,usb_product_id_decimal:product?info.usbProductId:null,identification_only:true,port_opened:false,bytes_transmitted:0,can_protocol:'not_yet_verified'};
  }
  globalThis.ByAdapter={identify,get busy(){return active;}};
  if(typeof document==='undefined')return;
  const button=document.getElementById('inspectSpardAdapter'),status=document.getElementById('spardAdapterStatus');
  if(!button||!status)return;
  try{const last=JSON.parse(localStorage.getItem('citybike-spard-adapter-v1')||'null');if(last?.receipt?.id)status.textContent='Последняя отправка: VID '+(last.info.usb_vendor_id||'—')+' · PID '+(last.info.usb_product_id||'—')+' · код '+last.receipt.id;}catch{}
  button.addEventListener('click',async()=>{
    if(active||globalThis.ByAutoUpdate?.holding)return;
    if(typeof browserRuntime!=='undefined'&&(browserRuntime?.recorder||browserRuntime?.tuner?.active)){status.textContent='Сначала завершите текущий тест';return;}
    active=true;button.disabled=true;status.textContent='Выберите штатный адаптер Spard в окне браузера…';
    try{
      const info=await identify(navigator.serial);
      status.textContent='Определён VID '+(info.usb_vendor_id||'—')+' · PID '+(info.usb_product_id||'—')+'. Отправляю сведения…';
      const file=new File([JSON.stringify(info,null,2)+'\n'],'Spard-adapter-'+(info.usb_vendor_id||'unknown')+'-'+(info.usb_product_id||'unknown')+'-'+Date.now()+'.json',{type:'application/json'});
      const receipt=await new ByFiles.FileUploader().send(file);
      try{localStorage.setItem('citybike-spard-adapter-v1',JSON.stringify({info,receipt}));}catch{}
      status.textContent='Сведения отправлены: VID '+(info.usb_vendor_id||'—')+' · PID '+(info.usb_product_id||'—')+' · код '+receipt.id+'. Напишите в чате «адаптер отправлен».';
    }catch(error){status.textContent=error.name==='NotFoundError'?'Выбор отменён. Можно выбрать адаптер позже.':String(error.message||error);}
    finally{active=false;button.disabled=false;}
  });
})();
