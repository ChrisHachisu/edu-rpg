// Procedural chiptune BGM using Tone.js
// Each track is a looping composition with melody + bass + optional harmony

import * as Tone from 'tone';

export type BgmTrack =
  | 'town' | 'overworld' | 'dungeon' | 'battle'
  | 'bossBattle' | 'finalBoss' | 'victory' | 'gameOver' | 'title';

interface ActiveTrack {
  parts: Tone.Part[];
  synths: Tone.ToneAudioNode[];
  dispose: () => void;
}

export class MusicComposer {
  private active: ActiveTrack | null = null;
  private currentTrack: BgmTrack | null = null;
  private masterVol: Tone.Volume;
  private started = false;

  constructor() {
    this.masterVol = new Tone.Volume(-6).toDestination();
  }

  get currentBgm(): BgmTrack | null {
    return this.currentTrack;
  }

  async play(track: BgmTrack): Promise<void> {
    if (this.currentTrack === track) return;
    this.stop();
    this.currentTrack = track;

    const builder = this.trackBuilders[track];
    if (!builder) return;

    this.active = builder();

    if (!this.started) {
      await Tone.start();
      this.started = true;
    }
    Tone.getTransport().cancel();
    Tone.getTransport().bpm.value = this.getBpm(track);
    this.active.parts.forEach(p => p.start(0));
    Tone.getTransport().start();
  }

  stop(): void {
    if (this.active) {
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
      this.active.dispose();
      this.active = null;
    }
    this.currentTrack = null;
  }

  setVolume(db: number): void {
    this.masterVol.volume.value = db;
  }

  private getBpm(track: BgmTrack): number {
    const bpms: Record<BgmTrack, number> = {
      town: 120, overworld: 140, dungeon: 100, battle: 160,
      bossBattle: 140, finalBoss: 130, victory: 140, gameOver: 80, title: 130,
    };
    return bpms[track];
  }

  // ── Track Builders ──────────────────────────────────────────────

  private get trackBuilders(): Record<BgmTrack, () => ActiveTrack> {
    return {
      town: () => this.buildTown(),
      overworld: () => this.buildOverworld(),
      dungeon: () => this.buildDungeon(),
      battle: () => this.buildBattle(),
      bossBattle: () => this.buildBossBattle(),
      finalBoss: () => this.buildFinalBoss(),
      victory: () => this.buildVictory(),
      gameOver: () => this.buildGameOver(),
      title: () => this.buildTitle(),
    };
  }

  private makeSynth(type: 'square' | 'sawtooth' | 'triangle' | 'sine', vol = -8): Tone.Synth {
    const s = new Tone.Synth({
      oscillator: { type },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.3 },
    });
    const v = new Tone.Volume(vol);
    s.connect(v);
    v.connect(this.masterVol);
    return s;
  }

  private makeBassSynth(type: 'sawtooth' | 'triangle' | 'square' | 'sine' = 'triangle', vol = -10): Tone.Synth {
    const s = new Tone.Synth({
      oscillator: { type },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.4 },
    });
    const v = new Tone.Volume(vol);
    s.connect(v);
    v.connect(this.masterVol);
    return s;
  }

  private buildPart(synth: Tone.Synth, notes: [string, string, string][], loop = true): Tone.Part {
    const part = new Tone.Part((time, value) => {
      synth.triggerAttackRelease(value.note, value.dur, time);
    }, notes.map(([time, note, dur]) => ({ time, note, dur })));
    part.loop = loop;
    part.loopEnd = notes.length > 0 ? this.getLoopEnd(notes) : '4m';
    return part;
  }

  private getLoopEnd(notes: [string, string, string][]): string {
    // Estimate from last note timing — default to 4 measures
    return '4m';
  }

  private buildTrack(melodySynth: Tone.Synth, bassSynth: Tone.Synth,
    melodyNotes: [string, string, string][], bassNotes: [string, string, string][],
    harmonySynth?: Tone.Synth, harmonyNotes?: [string, string, string][]): ActiveTrack {
    const parts: Tone.Part[] = [];
    const synths: Tone.ToneAudioNode[] = [melodySynth, bassSynth];

    parts.push(this.buildPart(melodySynth, melodyNotes));
    parts.push(this.buildPart(bassSynth, bassNotes));

    if (harmonySynth && harmonyNotes) {
      parts.push(this.buildPart(harmonySynth, harmonyNotes));
      synths.push(harmonySynth);
    }

    return {
      parts,
      synths,
      dispose: () => {
        parts.forEach(p => { p.stop(); p.dispose(); });
        synths.forEach(s => s.dispose());
      },
    };
  }

  // ── Town BGM — C major pentatonic, warm & gentle ────────────────

  private buildTown(): ActiveTrack {
    const lead = this.makeSynth('square', -12);
    const bass = this.makeBassSynth('triangle', -14);

    // Gentle melody in C major pentatonic
    const melody: [string, string, string][] = [
      ['0:0:0', 'C5', '8n'], ['0:0:2', 'E5', '8n'], ['0:1:0', 'G5', '4n'],
      ['0:2:0', 'E5', '8n'], ['0:2:2', 'D5', '8n'], ['0:3:0', 'C5', '4n'],
      ['1:0:0', 'D5', '8n'], ['1:0:2', 'E5', '8n'], ['1:1:0', 'G5', '8n'], ['1:1:2', 'A5', '8n'],
      ['1:2:0', 'G5', '4n'], ['1:3:0', 'E5', '4n'],
      ['2:0:0', 'A5', '8n'], ['2:0:2', 'G5', '8n'], ['2:1:0', 'E5', '4n'],
      ['2:2:0', 'D5', '8n'], ['2:2:2', 'C5', '8n'], ['2:3:0', 'D5', '4n'],
      ['3:0:0', 'E5', '8n'], ['3:0:2', 'G5', '8n'], ['3:1:0', 'A5', '4n'],
      ['3:2:0', 'G5', '8n'], ['3:2:2', 'E5', '8n'], ['3:3:0', 'C5', '4n'],
    ];

    // Walking bass
    const bassLine: [string, string, string][] = [
      ['0:0:0', 'C3', '4n'], ['0:1:0', 'E3', '4n'], ['0:2:0', 'G3', '4n'], ['0:3:0', 'E3', '4n'],
      ['1:0:0', 'F3', '4n'], ['1:1:0', 'A3', '4n'], ['1:2:0', 'G3', '4n'], ['1:3:0', 'E3', '4n'],
      ['2:0:0', 'A3', '4n'], ['2:1:0', 'G3', '4n'], ['2:2:0', 'F3', '4n'], ['2:3:0', 'D3', '4n'],
      ['3:0:0', 'C3', '4n'], ['3:1:0', 'D3', '4n'], ['3:2:0', 'E3', '4n'], ['3:3:0', 'G3', '4n'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine);
  }

  // ── Overworld BGM — G major, adventurous ────────────────────────

  private buildOverworld(): ActiveTrack {
    const lead = this.makeSynth('square', -10);
    const bass = this.makeBassSynth('sawtooth', -14);
    const harm = this.makeSynth('triangle', -16);

    const melody: [string, string, string][] = [
      ['0:0:0', 'G4', '8n'], ['0:0:2', 'B4', '8n'], ['0:1:0', 'D5', '8n'], ['0:1:2', 'G5', '8n'],
      ['0:2:0', 'F#5', '8n'], ['0:2:2', 'E5', '8n'], ['0:3:0', 'D5', '4n'],
      ['1:0:0', 'E5', '8n'], ['1:0:2', 'D5', '8n'], ['1:1:0', 'B4', '8n'], ['1:1:2', 'A4', '8n'],
      ['1:2:0', 'G4', '4n'], ['1:3:0', 'A4', '8n'], ['1:3:2', 'B4', '8n'],
      ['2:0:0', 'C5', '8n'], ['2:0:2', 'D5', '8n'], ['2:1:0', 'E5', '8n'], ['2:1:2', 'F#5', '8n'],
      ['2:2:0', 'G5', '4n'], ['2:3:0', 'F#5', '8n'], ['2:3:2', 'E5', '8n'],
      ['3:0:0', 'D5', '8n'], ['3:0:2', 'C5', '8n'], ['3:1:0', 'B4', '8n'], ['3:1:2', 'A4', '8n'],
      ['3:2:0', 'G4', '4n'], ['3:3:0', 'D5', '4n'],
    ];

    const bassLine: [string, string, string][] = [
      ['0:0:0', 'G2', '4n'], ['0:1:0', 'G2', '4n'], ['0:2:0', 'D3', '4n'], ['0:3:0', 'B2', '4n'],
      ['1:0:0', 'C3', '4n'], ['1:1:0', 'D3', '4n'], ['1:2:0', 'G2', '4n'], ['1:3:0', 'D3', '4n'],
      ['2:0:0', 'C3', '4n'], ['2:1:0', 'D3', '4n'], ['2:2:0', 'E3', '4n'], ['2:3:0', 'D3', '4n'],
      ['3:0:0', 'G2', '4n'], ['3:1:0', 'A2', '4n'], ['3:2:0', 'B2', '4n'], ['3:3:0', 'D3', '4n'],
    ];

    // Arpeggio harmony
    const harmony: [string, string, string][] = [
      ['0:0:0', 'B4', '8n'], ['0:1:0', 'D5', '8n'], ['0:2:0', 'B4', '8n'], ['0:3:0', 'G4', '8n'],
      ['1:0:0', 'C5', '8n'], ['1:1:0', 'E5', '8n'], ['1:2:0', 'D5', '8n'], ['1:3:0', 'B4', '8n'],
      ['2:0:0', 'E5', '8n'], ['2:1:0', 'G5', '8n'], ['2:2:0', 'E5', '8n'], ['2:3:0', 'D5', '8n'],
      ['3:0:0', 'B4', '8n'], ['3:1:0', 'D5', '8n'], ['3:2:0', 'G4', '8n'], ['3:3:0', 'B4', '8n'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine, harm, harmony);
  }

  // ── Dungeon BGM — A minor, tense & mysterious ──────────────────

  private buildDungeon(): ActiveTrack {
    const lead = this.makeSynth('sawtooth', -14);
    const bass = this.makeBassSynth('sawtooth', -12);

    // Sparse, unsettling minor melody
    const melody: [string, string, string][] = [
      ['0:0:0', 'A4', '4n'], ['0:2:0', 'E4', '8n'], ['0:3:0', 'F4', '4n'],
      ['1:1:0', 'E4', '8n'], ['1:2:0', 'D4', '4n'],
      ['2:0:0', 'C4', '4n'], ['2:2:0', 'D4', '8n'], ['2:3:0', 'E4', '4n'],
      ['3:1:0', 'A3', '4n'], ['3:3:0', 'E4', '8n'],
    ];

    // Low drone pulses
    const bassLine: [string, string, string][] = [
      ['0:0:0', 'A2', '2n'], ['0:2:0', 'A2', '2n'],
      ['1:0:0', 'F2', '2n'], ['1:2:0', 'E2', '2n'],
      ['2:0:0', 'D2', '2n'], ['2:2:0', 'E2', '2n'],
      ['3:0:0', 'A2', '2n'], ['3:2:0', 'E2', '2n'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine);
  }

  // ── Battle BGM — D minor, fast & urgent ─────────────────────────

  private buildBattle(): ActiveTrack {
    const lead = this.makeSynth('square', -8);
    const bass = this.makeBassSynth('square', -12);
    const harm = this.makeSynth('sawtooth', -14);

    // Fast aggressive arpeggios
    const melody: [string, string, string][] = [
      ['0:0:0', 'D5', '16n'], ['0:0:1', 'F5', '16n'], ['0:0:2', 'A5', '16n'], ['0:0:3', 'D6', '16n'],
      ['0:1:0', 'C6', '8n'], ['0:1:2', 'A5', '8n'],
      ['0:2:0', 'Bb5', '16n'], ['0:2:1', 'A5', '16n'], ['0:2:2', 'G5', '16n'], ['0:2:3', 'F5', '16n'],
      ['0:3:0', 'E5', '8n'], ['0:3:2', 'D5', '8n'],
      ['1:0:0', 'F5', '16n'], ['1:0:1', 'A5', '16n'], ['1:0:2', 'C6', '16n'], ['1:0:3', 'F6', '16n'],
      ['1:1:0', 'E6', '8n'], ['1:1:2', 'D6', '8n'],
      ['1:2:0', 'C6', '16n'], ['1:2:1', 'Bb5', '16n'], ['1:2:2', 'A5', '16n'], ['1:2:3', 'G5', '16n'],
      ['1:3:0', 'F5', '8n'], ['1:3:2', 'E5', '8n'],
      ['2:0:0', 'G5', '8n'], ['2:0:2', 'A5', '8n'], ['2:1:0', 'Bb5', '8n'], ['2:1:2', 'C6', '8n'],
      ['2:2:0', 'D6', '4n'], ['2:3:0', 'A5', '8n'], ['2:3:2', 'D5', '8n'],
      ['3:0:0', 'Bb5', '8n'], ['3:0:2', 'A5', '8n'], ['3:1:0', 'G5', '8n'], ['3:1:2', 'F5', '8n'],
      ['3:2:0', 'E5', '4n'], ['3:3:0', 'D5', '4n'],
    ];

    // Driving staccato bass
    const bassLine: [string, string, string][] = [
      ['0:0:0', 'D2', '8n'], ['0:0:2', 'D2', '8n'], ['0:1:0', 'D2', '8n'], ['0:1:2', 'D2', '8n'],
      ['0:2:0', 'Bb1', '8n'], ['0:2:2', 'Bb1', '8n'], ['0:3:0', 'A1', '8n'], ['0:3:2', 'A1', '8n'],
      ['1:0:0', 'F2', '8n'], ['1:0:2', 'F2', '8n'], ['1:1:0', 'F2', '8n'], ['1:1:2', 'F2', '8n'],
      ['1:2:0', 'C2', '8n'], ['1:2:2', 'C2', '8n'], ['1:3:0', 'E2', '8n'], ['1:3:2', 'E2', '8n'],
      ['2:0:0', 'G2', '8n'], ['2:0:2', 'G2', '8n'], ['2:1:0', 'Bb2', '8n'], ['2:1:2', 'Bb2', '8n'],
      ['2:2:0', 'D2', '8n'], ['2:2:2', 'D2', '8n'], ['2:3:0', 'A1', '8n'], ['2:3:2', 'A1', '8n'],
      ['3:0:0', 'Bb1', '8n'], ['3:0:2', 'A1', '8n'], ['3:1:0', 'G1', '8n'], ['3:1:2', 'F1', '8n'],
      ['3:2:0', 'E1', '8n'], ['3:2:2', 'E1', '8n'], ['3:3:0', 'D2', '8n'], ['3:3:2', 'D2', '8n'],
    ];

    // Power chord stabs on offbeats
    const harmony: [string, string, string][] = [
      ['0:1:0', 'D4', '16n'], ['0:3:0', 'Bb3', '16n'],
      ['1:1:0', 'F4', '16n'], ['1:3:0', 'C4', '16n'],
      ['2:1:0', 'Bb3', '16n'], ['2:3:0', 'A3', '16n'],
      ['3:1:0', 'G3', '16n'], ['3:3:0', 'D4', '16n'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine, harm, harmony);
  }

  // ── Boss Battle BGM — E minor, epic & heavy ─────────────────────

  private buildBossBattle(): ActiveTrack {
    const lead = this.makeSynth('square', -8);
    const bass = this.makeBassSynth('sawtooth', -10);
    const harm = this.makeSynth('sawtooth', -12);

    const melody: [string, string, string][] = [
      ['0:0:0', 'E5', '8n'], ['0:0:2', 'G5', '8n'], ['0:1:0', 'B5', '4n'],
      ['0:2:0', 'A5', '8n'], ['0:2:2', 'G5', '8n'], ['0:3:0', 'F#5', '4n'],
      ['1:0:0', 'E5', '8n'], ['1:0:2', 'D5', '8n'], ['1:1:0', 'C5', '8n'], ['1:1:2', 'D5', '8n'],
      ['1:2:0', 'E5', '4n'], ['1:3:0', 'B4', '4n'],
      ['2:0:0', 'C5', '8n'], ['2:0:2', 'D5', '8n'], ['2:1:0', 'E5', '8n'], ['2:1:2', 'G5', '8n'],
      ['2:2:0', 'A5', '4n'], ['2:3:0', 'G5', '8n'], ['2:3:2', 'F#5', '8n'],
      ['3:0:0', 'E5', '8n'], ['3:0:2', 'D#5', '8n'], ['3:1:0', 'E5', '8n'], ['3:1:2', 'B5', '8n'],
      ['3:2:0', 'A5', '4n'], ['3:3:0', 'E5', '4n'],
    ];

    // Heavy driving bass
    const bassLine: [string, string, string][] = [
      ['0:0:0', 'E2', '8n'], ['0:0:2', 'E2', '8n'], ['0:1:0', 'E2', '8n'], ['0:1:2', 'G2', '8n'],
      ['0:2:0', 'A2', '8n'], ['0:2:2', 'A2', '8n'], ['0:3:0', 'B2', '8n'], ['0:3:2', 'B2', '8n'],
      ['1:0:0', 'C3', '8n'], ['1:0:2', 'B2', '8n'], ['1:1:0', 'A2', '8n'], ['1:1:2', 'G2', '8n'],
      ['1:2:0', 'E2', '8n'], ['1:2:2', 'E2', '8n'], ['1:3:0', 'B1', '8n'], ['1:3:2', 'B1', '8n'],
      ['2:0:0', 'C2', '8n'], ['2:0:2', 'C2', '8n'], ['2:1:0', 'D2', '8n'], ['2:1:2', 'D2', '8n'],
      ['2:2:0', 'A2', '8n'], ['2:2:2', 'A2', '8n'], ['2:3:0', 'G2', '8n'], ['2:3:2', 'F#2', '8n'],
      ['3:0:0', 'E2', '8n'], ['3:0:2', 'D#2', '8n'], ['3:1:0', 'E2', '8n'], ['3:1:2', 'E2', '8n'],
      ['3:2:0', 'A2', '8n'], ['3:2:2', 'B2', '8n'], ['3:3:0', 'E2', '4n'],
    ];

    // Chord stabs
    const harmony: [string, string, string][] = [
      ['0:0:0', 'E4', '8n'], ['0:2:0', 'A4', '8n'],
      ['1:0:0', 'C4', '8n'], ['1:2:0', 'E4', '8n'],
      ['2:0:0', 'C4', '8n'], ['2:2:0', 'A4', '8n'],
      ['3:0:0', 'E4', '8n'], ['3:2:0', 'A4', '8n'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine, harm, harmony);
  }

  // ── Final Boss BGM — C minor modulating, dramatic & climactic ───

  private buildFinalBoss(): ActiveTrack {
    const lead = this.makeSynth('square', -6);
    const bass = this.makeBassSynth('sawtooth', -10);
    const harm = this.makeSynth('sawtooth', -10);

    // Dramatic melody with chromatic tension
    const melody: [string, string, string][] = [
      ['0:0:0', 'C5', '8n'], ['0:0:2', 'Eb5', '8n'], ['0:1:0', 'G5', '4n'],
      ['0:2:0', 'Ab5', '8n'], ['0:2:2', 'G5', '8n'], ['0:3:0', 'F5', '8n'], ['0:3:2', 'Eb5', '8n'],
      ['1:0:0', 'D5', '4n'], ['1:1:0', 'Eb5', '8n'], ['1:1:2', 'F5', '8n'],
      ['1:2:0', 'G5', '8n'], ['1:2:2', 'Ab5', '8n'], ['1:3:0', 'Bb5', '4n'],
      ['2:0:0', 'C6', '4n'], ['2:1:0', 'Bb5', '8n'], ['2:1:2', 'Ab5', '8n'],
      ['2:2:0', 'G5', '8n'], ['2:2:2', 'F5', '8n'], ['2:3:0', 'Eb5', '8n'], ['2:3:2', 'D5', '8n'],
      ['3:0:0', 'C5', '8n'], ['3:0:2', 'D5', '8n'], ['3:1:0', 'Eb5', '8n'], ['3:1:2', 'F#5', '8n'],
      ['3:2:0', 'G5', '4n'], ['3:3:0', 'C5', '4n'],
    ];

    // Chromatic walking bass
    const bassLine: [string, string, string][] = [
      ['0:0:0', 'C2', '8n'], ['0:0:2', 'C2', '8n'], ['0:1:0', 'Eb2', '8n'], ['0:1:2', 'G2', '8n'],
      ['0:2:0', 'Ab2', '8n'], ['0:2:2', 'G2', '8n'], ['0:3:0', 'F2', '8n'], ['0:3:2', 'Eb2', '8n'],
      ['1:0:0', 'D2', '8n'], ['1:0:2', 'D2', '8n'], ['1:1:0', 'Eb2', '8n'], ['1:1:2', 'F2', '8n'],
      ['1:2:0', 'G2', '8n'], ['1:2:2', 'Ab2', '8n'], ['1:3:0', 'Bb2', '8n'], ['1:3:2', 'Bb2', '8n'],
      ['2:0:0', 'C2', '8n'], ['2:0:2', 'C2', '8n'], ['2:1:0', 'Bb2', '8n'], ['2:1:2', 'Ab2', '8n'],
      ['2:2:0', 'G2', '8n'], ['2:2:2', 'F2', '8n'], ['2:3:0', 'Eb2', '8n'], ['2:3:2', 'D2', '8n'],
      ['3:0:0', 'C2', '8n'], ['3:0:2', 'D2', '8n'], ['3:1:0', 'Eb2', '8n'], ['3:1:2', 'F#2', '8n'],
      ['3:2:0', 'G2', '8n'], ['3:2:2', 'G2', '8n'], ['3:3:0', 'C2', '4n'],
    ];

    // Heavy chord rhythm
    const harmony: [string, string, string][] = [
      ['0:0:0', 'Eb4', '8n'], ['0:1:0', 'G4', '8n'], ['0:2:0', 'Ab4', '8n'], ['0:3:0', 'Eb4', '8n'],
      ['1:0:0', 'D4', '8n'], ['1:1:0', 'F4', '8n'], ['1:2:0', 'G4', '8n'], ['1:3:0', 'Bb4', '8n'],
      ['2:0:0', 'C5', '8n'], ['2:1:0', 'Ab4', '8n'], ['2:2:0', 'G4', '8n'], ['2:3:0', 'Eb4', '8n'],
      ['3:0:0', 'C4', '8n'], ['3:1:0', 'Eb4', '8n'], ['3:2:0', 'G4', '8n'], ['3:3:0', 'C4', '8n'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine, harm, harmony);
  }

  // ── Victory BGM — C major, triumphant ───────────────────────────

  private buildVictory(): ActiveTrack {
    const lead = this.makeSynth('square', -8);
    const bass = this.makeBassSynth('triangle', -12);

    const melody: [string, string, string][] = [
      ['0:0:0', 'C5', '8n'], ['0:0:2', 'E5', '8n'], ['0:1:0', 'G5', '8n'], ['0:1:2', 'C6', '8n'],
      ['0:2:0', 'B5', '4n'], ['0:3:0', 'A5', '8n'], ['0:3:2', 'G5', '8n'],
      ['1:0:0', 'A5', '8n'], ['1:0:2', 'B5', '8n'], ['1:1:0', 'C6', '4n'],
      ['1:2:0', 'G5', '8n'], ['1:2:2', 'A5', '8n'], ['1:3:0', 'B5', '4n'],
      ['2:0:0', 'C6', '4n'], ['2:1:0', 'G5', '4n'],
      ['2:2:0', 'E5', '4n'], ['2:3:0', 'C5', '4n'],
      ['3:0:0', 'C5', '2n'], ['3:2:0', 'C5', '2n'],
    ];

    const bassLine: [string, string, string][] = [
      ['0:0:0', 'C3', '4n'], ['0:1:0', 'E3', '4n'], ['0:2:0', 'G3', '4n'], ['0:3:0', 'C3', '4n'],
      ['1:0:0', 'F3', '4n'], ['1:1:0', 'G3', '4n'], ['1:2:0', 'E3', '4n'], ['1:3:0', 'G3', '4n'],
      ['2:0:0', 'C3', '4n'], ['2:1:0', 'E3', '4n'], ['2:2:0', 'G3', '4n'], ['2:3:0', 'C3', '4n'],
      ['3:0:0', 'C3', '2n'], ['3:2:0', 'C3', '2n'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine);
  }

  // ── Game Over BGM — D minor, somber & slow ──────────────────────

  private buildGameOver(): ActiveTrack {
    const lead = this.makeSynth('triangle', -12);
    const bass = this.makeBassSynth('sine', -14);

    const melody: [string, string, string][] = [
      ['0:0:0', 'D4', '2n'], ['0:2:0', 'C4', '4n'], ['0:3:0', 'Bb3', '4n'],
      ['1:0:0', 'A3', '2n'], ['1:2:0', 'G3', '2n'],
      ['2:0:0', 'F3', '2n'], ['2:2:0', 'E3', '4n'], ['2:3:0', 'D3', '4n'],
      ['3:0:0', 'D3', '1m'],
    ];

    const bassLine: [string, string, string][] = [
      ['0:0:0', 'D2', '2n'], ['0:2:0', 'Bb1', '2n'],
      ['1:0:0', 'A1', '2n'], ['1:2:0', 'G1', '2n'],
      ['2:0:0', 'F1', '2n'], ['2:2:0', 'A1', '2n'],
      ['3:0:0', 'D2', '1m'],
    ];

    return this.buildTrack(lead, bass, melody, bassLine);
  }

  // ── Title BGM — Reuse overworld with slight variation ───────────

  private buildTitle(): ActiveTrack {
    return this.buildOverworld(); // Same adventurous feel
  }
}
