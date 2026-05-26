/**
 * Tiny WebAudio synth — no asset files needed.
 * Synthesizes percussive SFX and a slow ambient drone for music.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private musicNodes: { stop: () => void } | null = null;
  private muted = false;

  setMuted(value: boolean): void {
    this.muted = value;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = (window as Window & typeof globalThis).AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  playLaunch(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  playMeleeHit(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.32, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  playArrowShoot(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(950, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }

  playArrowHit(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(540, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  playWallHit(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 95;
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  playVictoryFanfare(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const notes = [261.63, 329.63, 392.0, 523.25];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(notes[i], ctx.currentTime + i * 0.13, 0.32, "triangle", 0.18);
    }
  }

  playDefeatTone(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const notes = [261.63, 246.94, 220.0, 196.0];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(notes[i], ctx.currentTime + i * 0.18, 0.4, "sawtooth", 0.12);
    }
  }

  startMusic(): void {
    if (this.musicNodes || this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.value = 110; // A2
    osc2.frequency.value = 164.81; // E3
    const main = ctx.createGain();
    main.gain.value = 0.04;
    const tremolo = ctx.createOscillator();
    tremolo.type = "sine";
    tremolo.frequency.value = 0.25;
    const tremoloGain = ctx.createGain();
    tremoloGain.gain.value = 0.02;
    tremolo.connect(tremoloGain).connect(main.gain);
    osc1.connect(main);
    osc2.connect(main);
    main.connect(ctx.destination);
    osc1.start();
    osc2.start();
    tremolo.start();
    this.musicNodes = {
      stop: () => {
        try {
          osc1.stop();
          osc2.stop();
          tremolo.stop();
        } catch {
          // ignore
        }
      },
    };
  }

  stopMusic(): void {
    this.musicNodes?.stop();
    this.musicNodes = null;
  }

  private playTone(
    freq: number,
    when: number,
    duration: number,
    type: OscillatorType,
    gainAmt: number,
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainAmt, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }
}

export const sounds = new SoundManager();
