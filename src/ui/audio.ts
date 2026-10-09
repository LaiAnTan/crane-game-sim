// Tiny WebAudio synth for arcade blips — no audio files needed.
export class Sfx {
  private ctx: AudioContext | null = null;
  private motor: { osc: OscillatorNode; gain: GainNode } | null = null;
  muted = false;

  private ac() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, at = 0) {
    if (this.muted) return;
    const ac = this.ac();
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  coin() {
    this.tone(988, 0.08, 'square', 0.05);
    this.tone(1319, 0.25, 'square', 0.05, 0.08);
  }
  button() {
    this.tone(660, 0.06, 'triangle', 0.08);
  }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, 'square', 0.05, i * 0.11));
  }
  miss() {
    this.tone(392, 0.12, 'triangle', 0.05);
    this.tone(330, 0.2, 'triangle', 0.05, 0.12);
  }
  chime() {
    this.tone(880, 0.3, 'sine', 0.07);
    this.tone(660, 0.4, 'sine', 0.07, 0.25);
  }

  setMotor(on: boolean) {
    if (this.muted) on = false;
    if (on && !this.motor) {
      const ac = this.ac();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 72;
      gain.gain.value = 0.012;
      osc.connect(gain).connect(ac.destination);
      osc.start();
      this.motor = { osc, gain };
    } else if (!on && this.motor) {
      this.motor.osc.stop();
      this.motor = null;
    }
  }
}
