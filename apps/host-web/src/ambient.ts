/**
 * Ambient library music, synthesised live with WebAudio (no audio assets, no
 * licensing): slow detuned pad chords through a lowpass and a feedback delay.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62, 65], // G7
];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export function startAmbient(): void {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 4);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.6;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  delay.connect(fb).connect(delay);
  lp.connect(master);
  lp.connect(delay).connect(master);
  master.connect(ctx.destination);
  let i = 0;
  const play = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const note of CHORDS[i % CHORDS.length]!) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midi(note);
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 2.5);
        g.gain.linearRampToValueAtTime(0, t + 8);
        osc.connect(g).connect(lp);
        osc.start(t);
        osc.stop(t + 8.2);
      }
    }
    i++;
    timer = setTimeout(play, 7000);
  };
  play();
}

export function stopAmbient(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const c = ctx;
  if (c && master) {
    master.gain.linearRampToValueAtTime(0, c.currentTime + 1);
    setTimeout(() => void c.close(), 1200);
  }
  ctx = null;
  master = null;
}
