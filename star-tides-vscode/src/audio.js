import { CONFIG } from './config.js';
import { musicProfile } from './evolution.js';

/** 原创程序配乐：静谧低音 → 脉动音序 → 急促鼓点。无需音频下载或麦克风。 */
export class SoundEngine {
  constructor() { this.ctx=null;this.volume=.45;this.muted=false;this.voices=0;this.lastEat=-1;this.tension=0;this.wasActive=false;this.step=0; }
  async unlock() {
    try {
      if(!this.ctx) {
        const ctx=this.ctx=new(window.AudioContext||window.webkitAudioContext)();
        this.master=ctx.createGain();const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.ratio.value=10;
        this.master.connect(limiter);limiter.connect(ctx.destination);this.master.gain.value=this.muted?0:this.volume*.65;
        this.music=ctx.createGain();this.music.gain.value=0;this.music.connect(this.master);
        this.noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
        const data=this.noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
        const wind=ctx.createBufferSource();wind.buffer=this.noiseBuffer;wind.loop=true;
        this.windFilter=ctx.createBiquadFilter();this.windFilter.type='lowpass';this.windFilter.frequency.value=130;
        this.windGain=ctx.createGain();this.windGain.gain.value=0;wind.connect(this.windFilter);this.windFilter.connect(this.windGain);this.windGain.connect(this.master);wind.start();
        // 两层长音制造深空的空间感，配乐节奏在 update 中逐步加入。
        [36.708,55.0,73.65].forEach((frequency,i)=> {
          const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;
          gain.gain.value=[.13,.045,.025][i];oscillator.connect(gain);gain.connect(this.music);oscillator.start();
        });
      }
      if(this.ctx.state==='suspended') await this.ctx.resume();
    }catch { /* 设备无音频输出时保留游玩。 */ }
  }
  setVolume(value) {this.volume=value;if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:value*.65,this.ctx.currentTime,.05);}
  setMuted(value) {this.muted=value;this.setVolume(this.volume);}
  update(speed,active,mass=4096,score=0) {
    if(!this.ctx)return;
    const ctx=this.ctx,t=ctx.currentTime,profile=musicProfile(mass,score);
    this.tension+=(profile.tension-this.tension)*.025;
    const amount=active?Math.min(speed/280,1):0;
    this.windGain.gain.setTargetAtTime(amount*(.08+this.tension*.09),t,.2);
    this.windFilter.frequency.setTargetAtTime(120+amount*220+this.tension*170,t,.3);
    this.music.gain.setTargetAtTime(active?.42+this.tension*.25:0,t,.18);
    if(active&&!this.wasActive){this.nextBeat=t+.07;this.step=0;}
    this.wasActive=active;
    if(!active)return;
    if(this.nextBeat<t-.2)this.nextBeat=t;
    let budget=0;
    while(this.nextBeat<t+.12&&budget++<6) {
      this.scheduleBeat(this.nextBeat,this.step++,this.tension);
      this.nextBeat+=60/(58+this.tension*88)/2;
    }
  }
  scheduleBeat(at,step,tension) {
    const delay=Math.max(0,at-this.ctx.currentTime),pattern=[0,7,12,10,0,3,7,1],frequency=73.416*2**(pattern[step%8]/12);
    if(step%8===0)this.tone(73.416,73.416,.95,.065,delay,-.35,'sine',true);
    if(tension>.12&&(step%2===0||tension>.45))this.tone(frequency,frequency*.997,.24,.035+tension*.045,delay,Math.sin(step)*.35,'triangle',true);
    if(tension>.28&&step%4===0)this.tone(95,30,.25,.13,delay,0,'sine',true);
    if(tension>.60&&step%4===2)this.noise(.14,.065,1200,delay,'bandpass',true);
    if(tension>.72)this.noise(.035,.025,5500,delay,'highpass',true);
    if(tension>.83&&step%8===7)this.tone(77.78,73.416,.3,.045,delay,.4,'triangle',true);
  }
  tone(frequency,end,duration,gain=.15,delay=0,pan=0,type='sine',music=false) {
    if(!this.ctx||this.ctx.state!=='running'||this.muted||this.voices>=48)return;
    const ctx=this.ctx,at=ctx.currentTime+delay,osc=ctx.createOscillator(),env=ctx.createGain(),stereo=ctx.createStereoPanner();
    osc.type=type;osc.frequency.setValueAtTime(frequency,at);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+duration);
    env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(Math.max(.001,gain),at+Math.min(.04,duration/4));env.gain.exponentialRampToValueAtTime(.0001,at+duration);
    stereo.pan.value=Math.max(-.8,Math.min(.8,pan));osc.connect(env);env.connect(stereo);stereo.connect(music?this.music:this.master);
    osc.start(at);osc.stop(at+duration+.03);this.voices++;
    osc.onended=()=>{osc.disconnect();env.disconnect();stereo.disconnect();this.voices--;};
  }
  noise(duration,gain,frequency,delay=0,type='lowpass',music=false) {
    if(!this.ctx||this.ctx.state!=='running'||this.muted||this.voices>=48)return;
    const ctx=this.ctx,at=ctx.currentTime+delay,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();
    source.buffer=this.noiseBuffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.7;
    env.gain.setValueAtTime(.0001,at);env.gain.exponentialRampToValueAtTime(gain,at+.012);env.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(env);env.connect(music?this.music:this.master);source.start(at);source.stop(at+duration+.02);this.voices++;
    source.onended=()=>{source.disconnect();filter.disconnect();env.disconnect();this.voices--;};
  }
  play(event,width) {
    if(!this.ctx||this.muted)return;
    const pan=event.x/width*1.6-.8,tension=event.tension??this.tension;
    if(event.type==='impact') {
      this.noise(.65,.22,750);this.tone(130,27,.85,.28,0,pan);
    } else if(event.type==='destroyed') {
      this.noise(.8,.28,920);this.tone(145,26,1.25,.32);this.tone(67,31,1.7,.14,.18,pan,'triangle');
    } else if(event.type==='failed') {
      this.tone(73.416,36.708,1.1,.12);this.tone(55,27.5,1.3,.09,.12);
    } else if(event.type==='warning') {
      this.tone(146.83,146.83,.22,.035);this.tone(110,110,.28,.035,.3);
    } else if(event.type==='eat') {
      if(this.ctx.currentTime-this.lastEat<.07)return;this.lastEat=this.ctx.currentTime;
      // 越庞大，撞击越低沉、余震越长；消除之前的清脆电子提示音。
      this.tone(125-tension*38,48-tension*20,.32+tension*.72,.16+tension*.16,0,pan);
      this.noise(.22+tension*.4,.13+tension*.12,650-tension*360);
      this.tone(68,31,.4+tension*.35,.08+tension*.07,.08,pan,'triangle');
    } else if(event.type==='split') {
      this.noise(.58,.25,1700);this.tone(110,35,.5,.22);this.tone(330,120,.38,.07,.03,-.6,'triangle');this.tone(280,90,.42,.07,.06,.6,'triangle');
    } else if(event.type==='merge') {
      const duration=CONFIG.gameplay.mergeDuration;
      this.noise(duration,.10,380);this.tone(42,150,duration,.13);this.tone(55,190,duration*.92,.05,.05,0,'triangle');
    } else if(event.type==='formed') {
      this.tone(92,28,.95,.28);this.noise(.65,.19,260);
    } else if(event.type==='pulse'||event.type==='evolve') {
      this.tone(65,26,1.2,.22);this.noise(1,.12,450);
      if(event.type==='evolve')[73.416,110,155.56].forEach((f,i)=>this.tone(f,f*.98,1.8,.065,i*.09,(i-1)*.3,'triangle'));
    }
  }
  close(){this.ctx?.close();}
}
