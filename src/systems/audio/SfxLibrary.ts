// Procedural sound effects using raw Web Audio API
// Each SFX is a short-lived oscillator/noise burst — no external files needed

export type SfxId =
  | 'attack_hit' | 'attack_miss' | 'heal' | 'level_up'
  | 'menu_select' | 'menu_cancel' | 'treasure_open' | 'victory_fanfare'
  | 'defeat' | 'flee' | 'equip' | 'save' | 'boss_intro'
  | 'crystal_obtain' | 'damage_taken' | 'shop_buy' | 'shop_sell';

export class SfxLibrary {
  private ctx: AudioContext;
  private masterGain: GainNode;

  constructor(ctx: AudioContext, masterGain: GainNode) {
    this.ctx = ctx;
    this.masterGain = masterGain;
  }

  play(id: SfxId): void {
    const fn = this.sfxMap[id];
    if (fn) fn();
  }

  private get sfxMap(): Record<SfxId, () => void> {
    return {
      attack_hit: () => this.attackHit(),
      attack_miss: () => this.attackMiss(),
      heal: () => this.heal(),
      level_up: () => this.levelUp(),
      menu_select: () => this.menuSelect(),
      menu_cancel: () => this.menuCancel(),
      treasure_open: () => this.treasureOpen(),
      victory_fanfare: () => this.victoryFanfare(),
      defeat: () => this.defeatSfx(),
      flee: () => this.fleeSfx(),
      equip: () => this.equipSfx(),
      save: () => this.saveSfx(),
      boss_intro: () => this.bossIntro(),
      crystal_obtain: () => this.crystalObtain(),
      damage_taken: () => this.damageTaken(),
      shop_buy: () => this.shopBuy(),
      shop_sell: () => this.shopSell(),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private osc(type: OscillatorType, freq: number, duration: number, vol = 0.3, delay = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;
    g.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
    o.connect(g).connect(this.masterGain);
    o.start(this.ctx.currentTime + delay);
    o.stop(this.ctx.currentTime + delay + duration + 0.05);
    return o;
  }

  private noise(duration: number, vol = 0.15, delay = 0): void {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
    // High-pass filter for crispness
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 800;
    src.connect(hp).connect(g).connect(this.masterGain);
    src.start(this.ctx.currentTime + delay);
    src.stop(this.ctx.currentTime + delay + duration + 0.05);
  }

  private sweep(type: OscillatorType, startFreq: number, endFreq: number, duration: number, vol = 0.2, delay = 0): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(startFreq, this.ctx.currentTime + delay);
    o.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + delay + duration);
    g.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
    o.connect(g).connect(this.masterGain);
    o.start(this.ctx.currentTime + delay);
    o.stop(this.ctx.currentTime + delay + duration + 0.05);
  }

  // ── SFX Implementations ─────────────────────────────────────────

  private attackHit(): void {
    // Sharp impact: noise burst + descending sine
    this.noise(0.06, 0.25);
    this.sweep('sine', 600, 100, 0.1, 0.3);
  }

  private attackMiss(): void {
    // Whoosh: sine sweep up then down
    this.sweep('sine', 200, 800, 0.1, 0.15);
    this.sweep('sine', 800, 200, 0.15, 0.15, 0.1);
  }

  private heal(): void {
    // Ascending sparkle: C5-E5-G5-C6
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.osc('sine', f, 0.15, 0.2, i * 0.08));
  }

  private levelUp(): void {
    // Triumphant ascending: C5-E5-G5-C6 (faster, louder) + sustained chord
    const arp = [523, 659, 784, 1047];
    arp.forEach((f, i) => this.osc('square', f, 0.12, 0.15, i * 0.06));
    // Sustained major chord
    const chord = [523, 659, 784];
    chord.forEach(f => this.osc('sine', f, 0.5, 0.12, 0.3));
  }

  private menuSelect(): void {
    // Short blip
    this.osc('square', 880, 0.05, 0.15);
  }

  private menuCancel(): void {
    // Lower blip
    this.osc('square', 330, 0.06, 0.12);
  }

  private treasureOpen(): void {
    // Descending sparkle then ascending fanfare
    const down = [1047, 880, 784];
    down.forEach((f, i) => this.osc('sine', f, 0.1, 0.15, i * 0.06));
    const up = [523, 659, 784, 1047];
    up.forEach((f, i) => this.osc('square', f, 0.12, 0.18, 0.25 + i * 0.07));
  }

  private victoryFanfare(): void {
    // 8-note ascending major melody: C-D-E-F-G-A-B-C
    const melody = [523, 587, 659, 698, 784, 880, 988, 1047];
    melody.forEach((f, i) => this.osc('square', f, 0.12, 0.18, i * 0.09));
    // Final sustained chord
    [523, 659, 784, 1047].forEach(f => this.osc('sine', f, 0.6, 0.12, 0.8));
  }

  private defeatSfx(): void {
    // Descending minor tones, slowing
    const notes = [440, 392, 349, 294, 262];
    let t = 0;
    notes.forEach((f, i) => {
      const dur = 0.15 + i * 0.04;
      this.osc('sawtooth', f, dur, 0.12, t);
      t += dur;
    });
  }

  private fleeSfx(): void {
    // Quick high-freq sweep down
    this.sweep('square', 1200, 200, 0.15, 0.15);
  }

  private equipSfx(): void {
    // Metallic clink: triangle burst + harmonic
    this.osc('triangle', 1200, 0.06, 0.2);
    this.osc('triangle', 2400, 0.04, 0.1, 0.02);
  }

  private saveSfx(): void {
    // Crystal chime: glass-like harmonics
    this.osc('sine', 1047, 0.3, 0.15);
    this.osc('sine', 1568, 0.25, 0.1, 0.05);
    this.osc('sine', 2093, 0.2, 0.08, 0.1);
  }

  private bossIntro(): void {
    // Ominous low-freq rumble swell
    this.sweep('sawtooth', 40, 80, 0.8, 0.2);
    this.sweep('sawtooth', 60, 120, 0.6, 0.1, 0.2);
    this.noise(0.4, 0.06, 0.4);
  }

  private crystalObtain(): void {
    // Extended sparkling arpeggio
    const notes = [523, 659, 784, 1047, 1319, 1568, 2093];
    notes.forEach((f, i) => this.osc('sine', f, 0.2, 0.18, i * 0.1));
    // Shimmer
    [1047, 1319, 1568].forEach(f => this.osc('sine', f, 0.8, 0.08, 0.7));
  }

  private damageTaken(): void {
    // Thud: low square + noise
    this.osc('square', 80, 0.08, 0.25);
    this.noise(0.05, 0.2);
  }

  private shopBuy(): void {
    // Coin clink: high metallic ping
    this.osc('sine', 2200, 0.08, 0.15);
    this.osc('sine', 3300, 0.06, 0.08, 0.02);
  }

  private shopSell(): void {
    // Descending two-note
    this.osc('sine', 1800, 0.07, 0.12);
    this.osc('sine', 1200, 0.07, 0.12, 0.07);
  }
}
