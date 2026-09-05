// Small procedural accents share AudioScene's effects bus, master volume and
// compressor. No extra context, files, music or browser audio permission.
export class EnvironmentalAudio {
  constructor(audio) { this.audio=audio;this.voices=new Set();this.last=new Map();this.noise=null;this.context=null; }
  stop() {
    for(const voice of [...this.voices])voice.stop();
    this.last.clear();
  }
  play(event,listener,yaw=0) {
    const audio=this.audio,ctx=audio.ctx;
    if(!ctx||ctx.state!=='running'||audio.mode!=='playing'||audio.volume<=0||audio.effectsVolume<=0||globalThis.document?.hidden||!audio.effectsBus)return false;
    const dx=event.position.x-listener.x,dz=event.position.z-listener.z,distance=Math.hypot(dx,dz);
    if(distance>19)return false;
    const stone=/stone|grave|tomb|pillar|pedestal|relic/i.test(event.kind||'');
    const explosion=event.type==='explode',broken=event.type==='break';
    const family=explosion?'explode':`${stone?'stone':'wood'}-${event.type}`;
    const now=ctx.currentTime,gap=explosion?.10:broken?.08:.065;
    if(now-(this.last.get(family)??-10)<gap)return false;
    if(this.voices.size>=6){if(!explosion)return false;this.voices.values().next().value.stop();}
    this.last.set(family,now);
    if(this.context!==ctx){
      this.context=ctx;this.noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.6),ctx.sampleRate);
      const samples=this.noise.getChannelData(0);let previous=0;
      for(let i=0;i<samples.length;i++){const white=Math.random()*2-1;previous=previous*.32+white*.68;samples[i]=previous;}
    }
    const duration=explosion?.48:broken?(stone?.29:.22):.10;
    const level=(explosion?.25:broken?.18:.10)/(1+distance*.13);
    const pan=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();
    if(pan.pan)pan.pan.value=Math.max(-.8,Math.min(.8,(dx*Math.cos(yaw)-dz*Math.sin(yaw))/9));
    pan.connect(audio.effectsBus);
    const filter=ctx.createBiquadFilter(),gain=ctx.createGain(),source=ctx.createBufferSource();
    filter.type=explosion?'lowpass':stone?'highpass':'bandpass';
    filter.frequency.setValueAtTime(explosion?1350:stone?1000:1250,now);
    if(explosion)filter.frequency.exponentialRampToValueAtTime(170,now+duration);
    filter.Q.value=stone?.55:.7;
    gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(level,now+.004);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    source.buffer=this.noise;source.playbackRate.value=stone?1.3:explosion?.78:1;
    source.connect(filter);filter.connect(gain);gain.connect(pan);
    const sources=[source],nodes=[source,filter,gain,pan];
    // A short resonant knock distinguishes wood/stone from the noisy debris;
    // an oil barrel adds a low downward thump, never a sustained sub-bass bed.
    const tone=ctx.createOscillator(),toneGain=ctx.createGain();
    tone.type=explosion?'sine':stone?'triangle':'sine';
    tone.frequency.setValueAtTime(explosion?95:stone?430:190,now);
    tone.frequency.exponentialRampToValueAtTime(explosion?39:stone?150:73,now+duration*.75);
    toneGain.gain.setValueAtTime(level*(explosion?.75:stone?.20:.45),now);toneGain.gain.exponentialRampToValueAtTime(.0001,now+duration*.8);
    tone.connect(toneGain);toneGain.connect(pan);sources.push(tone);nodes.push(tone,toneGain);
    let remaining=sources.length,ended=false;
    const cleanup=()=>{if(ended)return;ended=true;for(const node of nodes)try{node.disconnect();}catch{}this.voices.delete(voice);};
    const voice={stop(){for(const node of sources)try{node.stop();}catch{}cleanup();}};
    for(const node of sources)node.onended=()=>{remaining--;if(!remaining)cleanup();};
    this.voices.add(voice);
    source.start(now);source.stop(now+duration+.01);tone.start(now);tone.stop(now+duration*.8+.01);
    return true;
  }
  dispose() { this.stop();this.noise=null;this.context=null; }
}
