'use strict';
const assert=require('node:assert/strict');
globalThis.ByStore={uuid:()=> 'a'.repeat(32)};
require('../web/browser.js');
(async()=>{
 const r=new ByBrowser.Runtime({connection:{}},null,{profiles:[]});r.settings={};r.store={setting:async()=>{}};
 let v=r.context();assert.equal(v.vehicle_variant,'unknown');assert.equal(v.battery_brand,'unknown');assert.equal(v.battery_swap_same_bicycle,null);assert.equal(v.bicycle_session.owner_reported_active,null);assert.equal(v.bicycle_session.pcb_present,null);
 for(const [kind,brand]of [['spard_new','Spard'],['phylion_old','Phylion']]){
  await r.setVehicle(kind);v=r.context();assert.equal(v.battery_brand,brand);assert.equal(v.vehicle_variant,'unknown');assert.equal(v.battery_swap_same_bicycle,null);assert.equal(v.bicycle_session.owner_reported_active,null);
 }
 await r.setVehicle({bike_id:'test-bike-2',vehicle_variant:'new_bicycle',pcb_revision:'rev B',battery_brand:'Spard',session_active:false});v=r.context();
 assert.equal(v.bike_id,'test-bike-2');assert.equal(v.vehicle_variant,'new_bicycle');assert.equal(v.pcb_revision,'rev B');assert.equal(v.bicycle_session.owner_reported_active,false);assert(v.vehicle_selected_utc);
 await assert.rejects(r.setVehicle({battery_brand:'invented'}));r.recorder={};await assert.rejects(r.setVehicle('spard_new'));assert.equal(r.context().bike_id,'test-bike-2');
 console.log('PASS capture context: unknown defaults, legacy battery choice never invents bike/PCB/session, explicit selection retained, active capture protected');
})().catch(e=>{console.error(e);process.exitCode=1;});
