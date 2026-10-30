"""Short-lived owner input for one selected USB bridge. Never persists held keys."""
import copy,re,threading,time
HEX16=re.compile(r'[a-f0-9]{16}')
HEX8=re.compile(r'[a-f0-9]{8}')
class HandsetError(ValueError):pass
class Handset:
 def __init__(self,clock=time.monotonic,wall_clock=time.time):
  self.clock=clock;self.wall_clock=wall_clock;self.lock=threading.RLock();self.revision=0;self.value=None
 def expire(self):
  s=self.value;now=self.clock()
  if s and s['enabled']:
   if now>=s['expires']:
    s.update(enabled=False,button=0,reason='controller_timeout');self.revision+=1
   elif s['button'] and (now>=s['key_expires'] or now>=s['hold_until']):
    s.update(button=0,reason='button_timeout');self.revision+=1
 def request(self,body,uid,boot,mac):
  if not isinstance(body,dict) or set(body)-{'actor','seq','action','hold','button','confirmed','expected_boot','expires_at_ms'}:raise HandsetError('Invalid remote request')
  actor=body.get('actor');seq=body.get('seq');action=body.get('action')
  if not isinstance(actor,str) or not HEX16.fullmatch(actor) or type(seq) is not int or not 1<=seq<=2147483647 or not isinstance(action,str) or action not in ('on','off','ping','down','keep','up'):raise HandsetError('Invalid remote input')
  if body.get('expected_boot')!=boot:raise HandsetError('Reader restarted; reconnect remote')
  with self.lock:
   self.expire();s=self.value;now=self.clock()
   if action=='off':
    if s:s.update(enabled=False,button=0,reason='owner_off')
    self.revision+=1;return self.snapshot(uid,boot)
   if action=='on':
    if s and s['enabled'] and (s['uid']!=uid or s['actor']!=actor and s['button']):raise HandsetError('A button is held from another page')
    if s and s['enabled'] and s['actor']!=actor:s.update(actor=actor,seq=0)
    if s and s['actor']==actor and seq<=s['seq']:raise HandsetError('Stale remote input')
    if not s or not s['enabled']:
     s=self.value=dict(actor=actor,session=actor,seq=0,enabled=True,uid=uid,boot=boot,mac=mac,button=0,hold='',last_hold='',expires=now+3,key_expires=0,hold_until=0,reason='enabled')
   elif not s or not s['enabled'] or s['uid']!=uid or s['boot']!=boot or s['actor']!=actor:raise HandsetError('Enable the remote from this page first')
   if seq<=s['seq']:raise HandsetError('Stale remote input')
   hold=body.get('hold','');button=body.get('button',0)
   if action in ('down','keep','up') and (not isinstance(hold,str) or not HEX8.fullmatch(hold)):raise HandsetError('Invalid hold identifier')
   key_seconds=0
   if action in ('down','keep'):
    deadline=body.get('expires_at_ms');wall_now=self.wall_clock()*1000
    if type(deadline) not in (int,float) or not wall_now<deadline<=wall_now+900:raise HandsetError('Button input expired; refresh the page and press again')
    key_seconds=(deadline-wall_now)/1000
   if action=='down':
    if type(button) is not int or button not in (1,2,3) or s['button'] or hold==s['last_hold']:raise HandsetError('Button unavailable or repeated hold')
    if button==3 and body.get('confirmed') is not True:raise HandsetError('Confirm power off first')
    s.update(button=button,hold=hold,last_hold=hold,key_expires=now+key_seconds,hold_until=now+30,reason='pressed')
   elif action=='keep':
    if not s['button'] or s['hold']!=hold:raise HandsetError('Hold has ended')
    s['key_expires']=now+key_seconds
   elif action=='up' and s['hold']==hold:s.update(button=0,reason='released')
   s.update(seq=seq,expires=now+3);self.revision+=1;return self.snapshot(uid,boot)
 def snapshot(self,uid,boot):
  with self.lock:
   self.expire();s=self.value
   if not s or s['uid']!=uid or s['boot']!=boot:return dict(revision=self.revision,enabled=False,button=0,actor=None,hold='',lease_ms=0,reason='off',server_time_ms=self.wall_clock()*1000)
   return {**{k:copy.deepcopy(s[k]) for k in ('enabled','button','actor','session','hold','reason')},'revision':self.revision,'server_time_ms':self.wall_clock()*1000,'lease_ms':max(0,int(1000*(s['expires']-self.clock()))),'key_lease_ms':max(0,int(1000*(min(s['key_expires'],s['hold_until'])-self.clock()))) if s['button'] else 0}
