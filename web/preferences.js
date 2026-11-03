/* Presentation settings only. Never opens USB, changes CAN or submits jobs. */
'use strict';
(() => {
  const KEY='citybike-view-v1',LANGUAGES=['en','ru','nb'];
  const defaults=()=>({language:'en',theme:'day',view:'all',favorites:[]});
  function clean(value){
    const v=value&&typeof value==='object'?value:{};
    return {language:LANGUAGES.includes(v.language)?v.language:'en',theme:v.theme==='night'?'night':'day',view:v.view==='favorites'?'favorites':'all',
      favorites:Array.isArray(v.favorites)?[...new Set(v.favorites.filter(x=>typeof x==='string'&&/^[0-9A-F]{8}:[A-Za-z0-9_% .-]{1,100}$/.test(x)))].slice(0,128):[]};
  }
  let state=defaults(),persistent=true;
  try{const raw=localStorage.getItem(KEY);if(raw&&raw.length<20000)state=clean(JSON.parse(raw));}catch{persistent=false;}
  const snapshot=()=>({...state,favorites:[...state.favorites]});
  function apply(){
    if(!globalThis.document)return;
    document.documentElement.dataset.theme=state.theme;document.documentElement.lang=state.language;
    document.documentElement.style.colorScheme=state.theme==='night'?'dark':'light';
    document.querySelectorAll('[data-language-control]').forEach(el=>{el.value=state.language;});
    document.querySelectorAll('[data-theme-control]').forEach(el=>{el.setAttribute('aria-pressed',String(state.theme==='night'));el.dataset.theme=state.theme;});
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.theme==='night'?'#131b18':'#f3f4ed');
  }
  function update(change){
    const next=clean({...state,...change});if(JSON.stringify(next)===JSON.stringify(state))return snapshot();state=next;
    try{localStorage.setItem(KEY,JSON.stringify(state));persistent=true;}catch{persistent=false;}
    apply();globalThis.dispatchEvent?.(new CustomEvent('citybike-preferences',{detail:snapshot()}));return snapshot();
  }
  function toggleFavorite(id){if(typeof id!=='string')return;const set=new Set(state.favorites);if(set.has(id))set.delete(id);else set.add(id);return update({favorites:[...set]});}
  function mount(){
    apply();document.querySelectorAll('[data-language-control]').forEach(el=>el.addEventListener('change',()=>update({language:el.value})));
    document.querySelectorAll('[data-theme-control]').forEach(el=>el.addEventListener('click',()=>update({theme:state.theme==='day'?'night':'day'})));
  }
  globalThis.ByPreferences={snapshot,update,toggleFavorite,clean,KEY,get persistent(){return persistent;}};
  globalThis.addEventListener?.('storage',e=>{if(e.key!==KEY)return;try{state=e.newValue&&e.newValue.length<20000?clean(JSON.parse(e.newValue)):defaults();apply();globalThis.dispatchEvent?.(new CustomEvent('citybike-preferences',{detail:snapshot()}));}catch{/* Keep the current view when another tab stores invalid data. */}});
  apply();
  if(globalThis.document){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}
  if(typeof module!=='undefined')module.exports=globalThis.ByPreferences;
})();
