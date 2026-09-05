import { AUDIO_ASSETS } from './audio-manifest.js';

const STORAGE_KEY='stratholme.audio.v1';
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(Number(n))?Number(n):min));
const SEMANTICS={
 swing:{keys:['swing-1','swing-2','swing-3','swing'],gap:.12,gain:.63,priority:3},
 hit:{keys:['hit-1','hit-2','hit'],gap:.035,gain:.59,priority:4},
 heavy:{keys:['heavy','hit-heavy','hit-2','hit'],gap:.13,gain:.72,priority:5},
 holyCharge:{keys:['holy-charge','holyCharge','holy'],gap:.18,gain:.46,priority:4},
 whirl:{keys:['whirl','holy'],gap:.20,gain:.68,priority:5},
 consecrate:{keys:['consecrate','holy'],gap:.20,gain:.56,priority:4},
 dodge:{keys:['dodge','swing-1'],gap:.12,gain:.43,priority:3},
 hurt:{keys:['hurt','hit-1','hit'],gap:.14,gain:.65,priority:5},
 kill:{keys:['kill','hit-2','hit'],gap:.07,gain:.31,priority:2},
 zombie:{keys:['zombie-1','zombie-2','zombie-3','zombie'],gap:.72,gain:.34,priority:1},
 brute:{keys:['brute-1','brute-2','brute'],gap:1.10,gain:.46,priority:2},
 footstep:{keys:['footstep-1','footstep-2','footstep'],gap:.15,gain:.24,priority:0},
 chime:{keys:['chime','victory'],gap:1.10,gain:.45,priority:5},
 victory:{keys:['victory','chime'],gap:1.10,gain:.60,priority:6},
};
const MODES={ascension:.18,playing:1,menu:.42,paused:0,victory:.72,dead:.28};
const asset=value=>typeof value==='string'?{url:value}:value&&typeof value.url==='string'?value:null;

/** Sample playback is synchronous; downloading/decoding never blocks game input. */
export class AudioScene {
 constructor(){
  const saved=this._readSettings();
  this.volume=clamp(saved.volume??.6);this.effectsVolume=clamp(saved.effectsVolume??.85);this.musicVolume=clamp(saved.musicVolume??.55);
  this._unmutedVolume=clamp(saved.unmutedVolume??(this.volume||.6));this.ctx=null;this.mode='menu';
  this.music=(AUDIO_ASSETS.music||[]).filter(t=>t&&t.id&&asset(t)).map(t=>({...t,gain:clamp(t.gain??1,0,2)}));
  this.sfx=Object.fromEntries(Object.entries(AUDIO_ASSETS.sfx||{}).map(([key,value])=>[key,asset(value)]).filter(([,value])=>value));
  this._track=this.music.find(t=>t.id===saved.track)?.id||this.music[0]?.id||null;
  this._buffers=new Map();this._loads=new Map();this._assets=new Map();this._voices=new Set();this._retiringTracks=new Set();this._musicOffsets=new Map();this._lastPlayed=new Map();
  this._currentTrack=null;this._loadStarted=false;this._loadPromise=null;this._started=false;this._silenced=false;this._disposed=false;this._resumePromise=null;this._errors=[];this._lastEvent=null;this._duckUntil=0;this.maxVoices=20;
  for(const value of [...Object.values(this.sfx),...this.music])if(!this._assets.has(value.url))this._assets.set(value.url,'pending');
  this._hidden=Boolean(globalThis.document?.hidden);
  this._onVisibility=()=>{this._handleVisibility().catch(error=>this._error('visibility',error));};
  globalThis.document?.addEventListener?.('visibilitychange',this._onVisibility);
 }
 _readSettings(){try{return JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY)||'null')||{};}catch{return {};}}
 _save(){try{globalThis.localStorage?.setItem(STORAGE_KEY,JSON.stringify({volume:this.volume,effectsVolume:this.effectsVolume,musicVolume:this.musicVolume,unmutedVolume:this._unmutedVolume,track:this._track}));}catch{/* Storage may be unavailable in an embedded/private browser. */}}
 _error(scope,error){this._errors.push({scope,message:String(error?.message||error).slice(0,180)});if(this._errors.length>8)this._errors.shift();}
 _automate(param,value,timeConstant=.025){if(!param||!this.ctx)return;const now=this.ctx.currentTime;try{param.cancelAndHoldAtTime?.(now);if(!param.cancelAndHoldAtTime){param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);}param.setTargetAtTime(value,now,timeConstant);}catch{param.value=value;}}
 _createContext(){
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext||globalThis.window?.AudioContext||globalThis.window?.webkitAudioContext;
  if(!Context){this._error('context','Web Audio is unavailable');return false;}
  try{
   this.ctx=new Context({latencyHint:'interactive'});
   this.master=this.ctx.createGain();this.master.gain.value=this.volume;
   this.effectsBus=this.ctx.createGain();this.effectsBus.gain.value=this.effectsVolume;
   this.musicBus=this.ctx.createGain();this.musicBus.gain.value=this.musicVolume;
   this.musicDuck=this.ctx.createGain();this.musicDuck.gain.value=1;
   this.musicMode=this.ctx.createGain();this.musicMode.gain.value=MODES[this.mode];
   this.compressor=this.ctx.createDynamicsCompressor();this.compressor.threshold.value=-18;this.compressor.knee.value=16;this.compressor.ratio.value=4;this.compressor.attack.value=.003;this.compressor.release.value=.18;
   this.limiter=this.ctx.createDynamicsCompressor();this.limiter.threshold.value=-1;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.001;this.limiter.release.value=.10;
   this.effectsBus.connect(this.master);this.musicBus.connect(this.musicDuck);this.musicDuck.connect(this.musicMode);this.musicMode.connect(this.master);this.master.connect(this.compressor);this.compressor.connect(this.limiter);
   if(this.ctx.createAnalyser){this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=1024;this.analyser.smoothingTimeConstant=.1;this._meterData=new Float32Array(this.analyser.fftSize);this.limiter.connect(this.analyser);this.analyser.connect(this.ctx.destination);}
   else this.limiter.connect(this.ctx.destination);
   const noise=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate),data=noise.getChannelData(0);let previous=0;
   for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*.3)/1.3;data[i]=previous;}this._noise=noise;
   return true;
  }catch(error){this._error('context',error);try{this.ctx?.close()?.catch?.(()=>{});}catch{}this.ctx=null;return false;}
 }
 async _resume(){
  if(!this.ctx||this._disposed||this._hidden||this._silenced)return false;
  if(this.ctx.state==='running')return true;
  if(!this._resumePromise)this._resumePromise=Promise.resolve().then(()=>this.ctx.resume()).then(()=>this.ctx.state==='running').catch(error=>{this._error('resume',error);return false;}).finally(()=>{this._resumePromise=null;});
  return this._resumePromise;
 }
 async start(){
  if(this._disposed)return false;
  if(!this.ctx&&!this._createContext())return false;
  this._started=true;this._silenced=false;this._applyVolumes();
  // Start the request queue without awaiting it: first swings use the short fallback.
  if(!this._loadStarted){this._loadStarted=true;this._loadPromise=this._loadAll().catch(error=>this._error('loading',error));}
  const running=await this._resume();if(running)this._syncMusic();return running;
 }
 async _loadAll(){
  const urls=[...this._assets.keys()];
  // One music request joins the initial attack requests, so atmosphere need not wait for every grunt.
  const musicUrl=this.music.find(t=>t.id===this._track)?.url;
  if(musicUrl){urls.splice(urls.indexOf(musicUrl),1);urls.splice(Math.min(2,urls.length),0,musicUrl);}
  let cursor=0;
  const worker=async()=>{while(cursor<urls.length&&!this._disposed){const url=urls[cursor++];await this._load(url);}};
  await Promise.all(Array.from({length:Math.min(3,urls.length)},worker));
 }
 _load(url){
  if(this._buffers.has(url))return Promise.resolve(this._buffers.get(url));
  if(this._loads.has(url))return this._loads.get(url);
  if(this._disposed||!this.ctx)return Promise.resolve(null);
  const controller=typeof AbortController==='function'?new AbortController():null;
  this._assets.set(url,'loading');
  const promise=(async()=>{
   try{
    const response=await fetch(url,controller?{signal:controller.signal}:undefined);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.arrayBuffer();if(this._disposed)return null;
    const buffer=await this.ctx.decodeAudioData(data);if(this._disposed)return null;
    this._buffers.set(url,buffer);this._assets.set(url,'loaded');this._syncMusic();return buffer;
   }catch(error){if(!this._disposed){this._assets.set(url,'failed');this._error(`asset:${url}`,error);}return null;}
  })();
  promise.abort=()=>controller?.abort();this._loads.set(url,promise);return promise;
 }
 _applyVolumes(){this._automate(this.master?.gain,this._silenced?0:this.volume);this._automate(this.effectsBus?.gain,this.effectsVolume);this._automate(this.musicBus?.gain,this.musicVolume);this._automate(this.musicMode?.gain,MODES[this.mode],.15);}
 setVolume(value){const next=clamp(value);if(next>0)this._unmutedVolume=next;else if(this.volume>0)this._unmutedVolume=this.volume;this.volume=next;this._applyVolumes();this._save();return this.volume;}
 setEffectsVolume(value){this.effectsVolume=clamp(value);this._applyVolumes();this._save();return this.effectsVolume;}
 setMusicVolume(value){this.musicVolume=clamp(value);this._applyVolumes();this._save();return this.musicVolume;}
 setMuted(muted){this.setVolume(muted?0:this._unmutedVolume||.6);return this.volume===0;}
 toggleMute(){return this.setMuted(this.volume>0);}
 setMode(mode){
  if(!(mode in MODES))return false;this.mode=mode;this._applyVolumes();
  if(mode==='paused'){this._pauseMusic();this._stopEffects();}
  else if(this._started&&!this._hidden&&!this._silenced)this._resume().then(ok=>{if(ok)this._syncMusic();}).catch(error=>this._error('mode',error));
  return true;
 }
 pause(){this.setMode('paused');}
 silence(){this._silenced=true;this._pauseMusic();this._stopEffects();this._applyVolumes();}
 async _handleVisibility(){
  this._hidden=Boolean(globalThis.document?.hidden);if(!this.ctx||this._disposed)return;
  if(this._hidden){this._pauseMusic();this._stopEffects();try{await this.ctx.suspend();}catch(error){this._error('suspend',error);}if(!this._hidden&&this._started&&!this._silenced&&this.mode!=='paused'){if(await this._resume())this._syncMusic();}}
  else if(this._started&&!this._silenced&&this.mode!=='paused'){if(await this._resume())this._syncMusic();}
 }
 async switchMusic(id){
  const track=this.music.find(t=>t.id===id);if(!track){this._error('music',`Unknown track: ${id}`);return false;}
  this._track=track.id;this._save();
  if(!this.ctx)return true;
  const buffer=await this._load(track.url);if(!buffer||this._disposed)return false;
  // Ignore completion of a selection that the user has already changed again.
  if(this._track===id)this._syncMusic();return true;
 }
 _syncMusic(){
  if(!this.ctx||this.ctx.state!=='running'||this._disposed||this._hidden||this._silenced||this.mode==='paused')return;
  const track=this.music.find(t=>t.id===this._track),buffer=track&&this._buffers.get(track.url);
  if(!track||!buffer||this._currentTrack?.id===track.id)return;
  try{
   const now=this.ctx.currentTime;
   for(const old of [...this._retiringTracks])this._stopMusicVoice(old,0);
   const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();source.buffer=buffer;source.loop=true;source.connect(gain);gain.connect(this.musicBus);
   const offset=(this._musicOffsets.get(track.id)||0)%Math.max(.001,buffer.duration);
   const voice={id:track.id,source,gain,offset,startedAt:now,duration:buffer.duration,ended:false};
   source.onended=()=>this._cleanupMusicVoice(voice);
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(track.gain??1,now+.85);
   source.start(now,offset);
   const old=this._currentTrack;this._currentTrack=voice;
   if(old){this._saveMusicOffset(old);this._retiringTracks.add(old);this._stopMusicVoice(old,.85);}
  }catch(error){this._error('music-playback',error);}
 }
 _saveMusicOffset(voice){if(!voice||!this.ctx)return;this._musicOffsets.set(voice.id,(voice.offset+Math.max(0,this.ctx.currentTime-voice.startedAt))%Math.max(.001,voice.duration));}
 _cleanupMusicVoice(voice){if(voice.ended)return;voice.ended=true;this._retiringTracks.delete(voice);if(this._currentTrack===voice)this._currentTrack=null;try{voice.source.disconnect();voice.gain.disconnect();}catch{}}
 _stopMusicVoice(voice,fade=0){
  if(!voice||voice.ended||!this.ctx)return;
  const now=this.ctx.currentTime;
  try{voice.gain.gain.cancelAndHoldAtTime?.(now);if(!voice.gain.gain.cancelAndHoldAtTime){voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);}voice.gain.gain.linearRampToValueAtTime(0,now+fade);voice.source.stop(now+fade);}catch{}
  if(fade===0)this._cleanupMusicVoice(voice);
 }
 _pauseMusic(){
  if(this._currentTrack){const current=this._currentTrack;this._saveMusicOffset(current);this._currentTrack=null;this._stopMusicVoice(current,0);}
  for(const voice of [...this._retiringTracks])this._stopMusicVoice(voice,0);
 }
 _duck(kind){
  if(!this.ctx||!this.musicDuck)return;
  const amount=kind==='heavy'?.43:kind==='hit'?.62:['whirl','consecrate','holyCharge'].includes(kind)?.52:null;if(amount===null)return;
  const now=this.ctx.currentTime,param=this.musicDuck.gain;this._duckUntil=now+.45;
  try{param.cancelAndHoldAtTime?.(now);if(!param.cancelAndHoldAtTime){param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);}param.setTargetAtTime(amount,now,.012);param.setTargetAtTime(1,now+.10,.12);}catch{}
 }
 play(kind='hit',power=1,options={}){
  if(kind==='holy')kind='holyCharge';const spec=SEMANTICS[kind]||SEMANTICS.hit;
  if(!this.ctx||this.ctx.state!=='running'||this._disposed||this._silenced||this._hidden||this.mode==='paused'||this.volume<=0||this.effectsVolume<=0)return false;
  if(!options||typeof options!=='object')options={};power=clamp(power,0,2);if(power===0)return false;
  const now=this.ctx.currentTime,last=this._lastPlayed.get(kind);if(last!==undefined&&now-last<spec.gap)return false;
  if(this._voices.size>=this.maxVoices){const victim=[...this._voices].sort((a,b)=>a.priority-b.priority||a.startedAt-b.startedAt)[0];if(victim.priority>spec.priority)return false;this._stopVoice(victim);}
  const available=spec.keys.filter(key=>this.sfx[key]);
  const preferred=available.length?available[(Math.abs(Math.trunc(options.variant??Math.random()*available.length)))%available.length]:null;
  // While a requested variation is downloading, another decoded take is preferable to synthesis.
  const key=preferred&&this._buffers.has(this.sfx[preferred].url)?preferred:available.find(id=>this._buffers.has(this.sfx[id].url));
  const descriptor=key&&this.sfx[key],buffer=descriptor&&this._buffers.get(descriptor.url);
  let voice;
  try{
   const source=buffer?this.ctx.createBufferSource():this._fallback(kind),gain=this.ctx.createGain();
   const pan=this.ctx.createStereoPanner?this.ctx.createStereoPanner():this.ctx.createGain();if(pan.pan)pan.pan.value=clamp(options.pan??0,-1,1);
   const variation=1+(Math.random()-.5)*(kind==='footstep'?.10:.065),pitch=clamp((options.pitch??1)*variation,.72,1.35);
   if(buffer){source.buffer=buffer;source.playbackRate.value=pitch;}else if(source.playbackRate)source.playbackRate.value=pitch;
   const duration=buffer?Math.min(buffer.duration/pitch,kind==='victory'?12:kind==='chime'?8:5):source._fallbackDuration;
   const level=spec.gain*power*clamp(descriptor?.gain??1,0,2)*(buffer?1:.32);
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+.004);gain.gain.setValueAtTime(level,now+Math.max(.005,duration-.025));gain.gain.linearRampToValueAtTime(0,now+duration);
   source.connect(gain);gain.connect(pan);pan.connect(this.effectsBus);
   voice={source,gain,pan,priority:spec.priority,startedAt:now,fallback:!buffer,ended:false};source.onended=()=>this._cleanupVoice(voice);this._voices.add(voice);
   source.start(now);source.stop(now+duration);this._lastPlayed.set(kind,now);this._duck(kind);
   this._lastEvent={kind,key:key||'procedural-fallback',pan:pan.pan?.value||0,pitch,time:now};return true;
  }catch(error){if(voice)this._stopVoice(voice);this._error(`play:${kind}`,error);return false;}
 }
 _fallback(kind){
  const now=this.ctx.currentTime;
  const tones={hit:[105,44,.14],heavy:[74,31,.23],holyCharge:[250,440,.26],consecrate:[450,290,.32],hurt:[100,50,.15],kill:[180,70,.12],zombie:[140,87,.24],brute:[69,40,.26],chime:[660,990,.65],victory:[520,1040,.85]};
  const tone=tones[kind];let source;
  if(tone){source=this.ctx.createOscillator();source.type=['holyCharge','consecrate','chime','victory'].includes(kind)?'sine':'triangle';source.frequency.setValueAtTime(tone[0],now);source.frequency.exponentialRampToValueAtTime(tone[1],now+tone[2]);source._fallbackDuration=tone[2];}
  else{source=this.ctx.createBufferSource();source.buffer=this._noise;source._fallbackDuration=kind==='footstep'?.065:kind==='whirl'?.25:kind==='dodge'?.11:.13;}
  return source;
 }
 _cleanupVoice(voice){if(voice.ended)return;voice.ended=true;this._voices.delete(voice);try{voice.source.disconnect();voice.gain.disconnect();voice.pan.disconnect();}catch{}}
 _stopVoice(voice){try{voice.source.stop();}catch{}this._cleanupVoice(voice);}
 _stopEffects(){for(const voice of [...this._voices])this._stopVoice(voice);}
 _meter(){
  const available=Boolean(this.analyser?.getFloatTimeDomainData);
  if(!available||this.ctx?.state!=='running'||this._disposed)return{meterAvailable:available,rms:0,peak:0,rmsDb:-120,peakDb:-120};
  try{
   this.analyser.getFloatTimeDomainData(this._meterData);let sum=0,peak=0;
   for(const sample of this._meterData){const value=Number.isFinite(sample)?sample:0;sum+=value*value;peak=Math.max(peak,Math.abs(value));}
   const rms=Math.sqrt(sum/this._meterData.length);
   return{meterAvailable:true,rms,peak,rmsDb:Math.max(-120,20*Math.log10(Math.max(rms,.000001))),peakDb:Math.max(-120,20*Math.log10(Math.max(peak,.000001)))};
  }catch(error){this._error('meter',error);return{meterAvailable:false,rms:0,peak:0,rmsDb:-120,peakDb:-120};}
 }
 get status(){
  const states=[...this._assets.values()],loaded=states.filter(s=>s==='loaded').length,failed=states.filter(s=>s==='failed').length;
  const active=Boolean(this._currentTrack&&!this._currentTrack.ended&&this.ctx?.state==='running'&&!this._hidden&&!this._silenced&&this.mode!=='paused');
  return {context:this.ctx?.state||'uninitialized',loaded,total:states.length,failed,pending:states.length-loaded-failed,loading:states.includes('loading'),ready:this._loadStarted&&loaded+failed===states.length,musicTitle:this.music.find(t=>t.id===this._track)?.title||'',track:this._track,playingTrack:this._currentTrack?.id||null,musicActive:active,musicAudible:active&&this.volume>0&&this.musicVolume>0,musicSources:(this._currentTrack?1:0)+this._retiringTracks.size,activeVoices:this._voices.size,fallbackVoices:[...this._voices].filter(v=>v.fallback).length,volume:this.volume,musicVolume:this.musicVolume,effectsVolume:this.effectsVolume,muted:this.volume===0,mode:this.mode,hidden:this._hidden,silenced:this._silenced,ducking:Boolean(this.ctx&&this.ctx.currentTime<this._duckUntil),...this._meter(),lastEvent:this._lastEvent?{...this._lastEvent}:null,errors:this._errors.map(e=>({...e}))};
 }
 dispose(){
  if(this._disposed)return;this.silence();this._disposed=true;
  globalThis.document?.removeEventListener?.('visibilitychange',this._onVisibility);
  for(const pending of this._loads.values())pending.abort?.();
  this._buffers.clear();this._musicOffsets.clear();
  for(const node of [this.master,this.effectsBus,this.musicBus,this.musicDuck,this.musicMode,this.compressor,this.limiter,this.analyser])try{node?.disconnect();}catch{}
  try{this.ctx?.close()?.catch?.(error=>this._error('close',error));}catch(error){this._error('close',error);}
 }
}
