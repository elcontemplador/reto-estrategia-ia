// Original, short motifs in D major. MIDI pitch, onset, duration, relative velocity.
export const CUES = {
  enable: [[74,0,.25,.45],[81,.09,.32,.25]],
  start: [[62,0,.3,.65],[69,.11,.32,.55],[74,.23,.5,.65]],
  select: [[74,0,.12,.3]],
  confirm: [[50,0,.23,.3],[57,.08,.24,.2]],
  correct: [[74,0,.28,.55],[78,.1,.32,.48],[81,.2,.48,.55]],
  checkpoint: [[62,0,.55,.55],[69,.1,.45,.4],[74,.22,.5,.6],[78,.34,.48,.45],[81,.46,.7,.6],[62,.46,.7,.35]],
  win: [[74,0,.32,.5],[78,.12,.35,.5],[81,.24,.38,.55],[86,.4,.65,.6],[62,.62,.9,.45],[69,.62,.9,.3],[78,.62,.9,.35],[86,.62,.9,.4]],
  miss: [[59,0,.28,.45],[57,.18,.48,.4]],
  half: [[81,0,.2,.4],[74,.13,.3,.4]],
  hint: [[76,0,.3,.35],[81,.18,.48,.4]],
  swap: [[69,0,.2,.4],[76,.09,.2,.4],[74,.2,.34,.45]],
  stop: [[69,0,.3,.35],[66,.12,.35,.3],[62,.24,.5,.45]],
};

// The same renderer is used by the live game and OfflineAudioContext QA.
export function renderCue(context, destination, name, when=context.currentTime) {
  const notes=CUES[name];
  if(!notes)return null;
  const bus=context.createGain(),tone=context.createBiquadFilter();
  bus.gain.value=.36;
  tone.type='lowpass';tone.frequency.value=3200;tone.Q.value=.55;
  const compressor=context.createDynamicsCompressor();
  compressor.threshold.value=-16;compressor.knee.value=12;compressor.ratio.value=4;
  compressor.attack.value=.004;compressor.release.value=.12;
  bus.connect(tone);tone.connect(compressor);compressor.connect(destination);
  const nodes=[bus,tone,compressor],oscillators=[];
  // A very short room tail; no feedback, long echo or perpetual audio loop.
  for(const [delay,level] of [[.083,.1],[.149,.045]]){
    const tap=context.createDelay(.2),gain=context.createGain();
    tap.delayTime.value=delay;gain.gain.value=level;
    tone.connect(tap);tap.connect(gain);gain.connect(compressor);nodes.push(tap,gain);
  }
  const wave=context.createPeriodicWave(new Float32Array(5),new Float32Array([0,1,.22,.09,.025]));
  for(const [pitch,onset,duration,velocity] of notes){
    const oscillator=context.createOscillator(),envelope=context.createGain();
    const t=when+onset,peak=.24*velocity;
    oscillator.setPeriodicWave(wave);oscillator.frequency.value=440*2**((pitch-69)/12);
    // Rounded mallet attack and decaying body prevent clicks and harsh square-wave edges.
    envelope.gain.setValueAtTime(0,t);
    envelope.gain.linearRampToValueAtTime(peak,t+.012);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*.24),t+duration*.48);
    envelope.gain.exponentialRampToValueAtTime(.0001,t+duration);
    envelope.gain.linearRampToValueAtTime(0,t+duration+.016);
    oscillator.connect(envelope);envelope.connect(bus);
    oscillator.start(t);oscillator.stop(t+duration+.02);
    oscillators.push(oscillator);nodes.push(oscillator,envelope);
  }
  const duration=Math.max(...notes.map(([,onset,length])=>onset+length))+.2;
  let stopped=false,disposed=false;
  return {
    duration,
    stop(){
      if(stopped||disposed)return;stopped=true;
      const now=context.currentTime;
      bus.gain.cancelScheduledValues(now);bus.gain.setValueAtTime(bus.gain.value,now);
      bus.gain.linearRampToValueAtTime(0,now+.015);
      for(const oscillator of oscillators){try{oscillator.stop(now+.02);}catch{}}
    },
    dispose(){if(disposed)return;disposed=true;for(const node of nodes){try{node.disconnect();}catch{}}},
  };
}

export class GameSound {
  constructor(onUnavailable=()=>{}) {
    this.enabled=false;this.context=null;this.active=null;this.revision=0;
    this.onUnavailable=onUnavailable;this.timers=new Set();
  }
  later(action,ms){const timer=setTimeout(()=>{this.timers.delete(timer);action();},ms);this.timers.add(timer);}
  stop(){
    this.revision++;
    if(this.active){const cue=this.active;this.active=null;cue.stop();this.later(()=>cue.dispose(),220);}
  }
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled)this.stop();}
  async play(name){
    if(!this.enabled||!CUES[name]||globalThis.document?.hidden)return false;
    this.stop();const revision=this.revision;
    try{
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Audio)throw new Error('Web Audio unavailable');
      this.context??=new Audio();
      if(this.context.state!=='running')await this.context.resume();
      // A delayed mobile unlock must not play a cue after mute, a new action or tab switch.
      if(!this.enabled||revision!==this.revision||globalThis.document?.hidden)return false;
      const cue=renderCue(this.context,this.context.destination,name,this.context.currentTime+.006);
      this.active=cue;
      this.later(()=>{cue.dispose();if(this.active===cue)this.active=null;},(cue.duration+.06)*1000);
      return true;
    }catch{
      if(revision===this.revision){this.setEnabled(false);this.onUnavailable();}
      return false;
    }
  }
}
