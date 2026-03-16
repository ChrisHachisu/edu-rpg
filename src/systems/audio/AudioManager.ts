// Singleton audio manager — coordinates BGM (Tone.js) and SFX (Web Audio API)
// Lazy-initializes on first user gesture (required by Chrome/Safari autoplay policy)

import * as Tone from 'tone';
import { MusicComposer, BgmTrack } from './MusicComposer';
import { SfxLibrary, SfxId } from './SfxLibrary';

export type { BgmTrack, SfxId };

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private composer: MusicComposer | null = null;
  private sfx: SfxLibrary | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  soundEnabled = true;
  masterVolume = 0.7; // 0.0 - 1.0

  // Called on first user gesture (click/keydown)
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      // Start Tone.js FIRST — must happen in user gesture context before any
      // other awaits, otherwise the browser blocks the AudioContext as autoplay.
      await Tone.start();

      // Reuse Tone's AudioContext for SFX (single context = better compatibility)
      const toneRaw = Tone.getContext().rawContext;
      this.ctx = toneRaw instanceof AudioContext
        ? toneRaw
        : new AudioContext();

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.soundEnabled ? this.masterVolume : 0;
      this.masterGain.connect(this.ctx.destination);

      this.composer = new MusicComposer();
      this.sfx = new SfxLibrary(this.ctx, this.masterGain);

      this.initialized = true;
    } catch (e) {
      console.warn('[AudioManager] init failed:', e);
      this.initialized = false;
    }
  }

  playBgm(track: BgmTrack): void {
    if (!this.initialized || !this.soundEnabled || !this.composer) return;
    if (this.composer.currentBgm === track) return;
    this.composer.play(track).catch(e => console.warn('[AudioManager] BGM error:', e));
  }

  stopBgm(): void {
    this.composer?.stop();
  }

  playSfx(id: SfxId): void {
    if (!this.initialized || !this.soundEnabled || !this.sfx) return;
    this.sfx.play(id);
  }

  setVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.soundEnabled) {
      this.masterGain.gain.value = this.masterVolume;
    }
    if (this.composer) {
      // Map 0-1 to -30dB..0dB for Tone.js
      const db = this.masterVolume > 0 ? -30 + this.masterVolume * 24 : -Infinity;
      this.composer.setVolume(db);
    }
  }

  setMuted(muted: boolean): void {
    this.soundEnabled = !muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : this.masterVolume;
    }
    if (muted) {
      this.stopBgm();
    }
  }

  // Load settings from player state
  loadSettings(soundEnabled: boolean, volume: number): void {
    this.soundEnabled = soundEnabled;
    this.masterVolume = volume;
    if (this.masterGain) {
      this.masterGain.gain.value = soundEnabled ? volume : 0;
    }
  }

  dispose(): void {
    this.stopBgm();
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.composer = null;
    this.sfx = null;
    this.initialized = false;
  }
}

// Export singleton
export const audioManager = new AudioManagerImpl();
