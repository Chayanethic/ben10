'use client';

export type SoundEffectType =
  | 'button-click'
  | 'card-draw'
  | 'card-flip'
  | 'stat-select'
  | 'battle-clash'
  | 'backlash-hit'
  | 'timer-tick'
  | 'chat-pop'
  | 'round-win'
  | 'round-loss'
  | 'match-victory'
  | 'boot-up';

export type MusicTrackType = 'menu' | 'battle' | 'none';

export interface AudioSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  muted: boolean;
  musicVolume: number; // 0..1
  sfxVolume: number;   // 0..1
  reducedMotion: boolean;
}

const STORAGE_KEY = 'omnitrix_arena_audio_settings_v3';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  soundEnabled: true,
  musicEnabled: false,
  muted: false,
  musicVolume: 0.35,
  sfxVolume: 0.75,
  reducedMotion: false,
};

class OmnitrixSoundEngine {
  private ctx: AudioContext | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private currentMusicTrack: MusicTrackType = 'none';
  private stepIndex = 0;
  private hasInteracted = false;
  private listeners: Set<(s: AudioSettings) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...parsed };
        } else if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          this.settings.reducedMotion = true;
        }
      } catch {
        // ignore
      }
    }
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  subscribe(listener: (s: AudioSettings) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => {
      this.listeners.delete(listener);
    };
  }

  updateSettings(partial: Partial<AudioSettings>): AudioSettings {
    this.settings = { ...this.settings, ...partial };
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch {
        // ignore
      }
    }
    if (!this.settings.musicEnabled || this.settings.muted || !this.settings.soundEnabled) {
      this.stopMusicLoop();
    } else if (this.currentMusicTrack !== 'none') {
      this.startMusicLoop(this.currentMusicTrack);
    }
    const snapshot = this.getSettings();
    this.listeners.forEach((fn) => fn(snapshot));
    return snapshot;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.hasInteracted = true;
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainScale = 1
  ) {
    if (!this.settings.soundEnabled || this.settings.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(18, freqEnd), now + durationSec);
      }

      const vol = Math.max(0.001, Math.min(1, this.settings.sfxVolume * gainScale * 0.42));
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec);
    } catch {
      // ignore
    }
  }

  /**
   * Generates a white-noise burst + sub-bass drop for dramatic arcade fighting impact / backlash recoil!
   */
  private playImpactNoise(durationSec: number, filterFreq: number, gainScale = 1) {
    if (!this.settings.soundEnabled || this.settings.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * durationSec);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + durationSec);

      const gain = ctx.createGain();
      const vol = Math.max(0.001, Math.min(1, this.settings.sfxVolume * gainScale * 0.55));
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } catch {
      // ignore
    }
  }

  playSfx(effect: SoundEffectType) {
    if (!this.settings.soundEnabled || this.settings.muted) return;

    switch (effect) {
      case 'button-click':
        this.playTone(980, 1360, 0.06, 'triangle', 0.55);
        break;
      case 'chat-pop':
        this.playTone(620, 1180, 0.09, 'sine', 0.65);
        break;
      case 'timer-tick':
        this.playTone(880, 440, 0.05, 'square', 0.45);
        break;
      case 'boot-up':
        this.playTone(220, 880, 0.28, 'sawtooth', 0.6);
        setTimeout(() => this.playTone(660, 1320, 0.22, 'sine', 0.6), 120);
        break;
      case 'card-draw':
        this.playTone(320, 820, 0.14, 'sine', 0.65);
        break;
      case 'card-flip':
        this.playTone(460, 920, 0.16, 'triangle', 0.7);
        break;
      case 'stat-select':
        this.playTone(587.33, 987.77, 0.13, 'sine', 0.75);
        break;
      case 'battle-clash':
      case 'backlash-hit':
        // Fighting-style heavy clash + backlash shockwave!
        this.playImpactNoise(0.32, 1600, 1.0);
        this.playTone(165, 38, 0.34, 'sawtooth', 0.95);
        setTimeout(() => this.playTone(310, 62, 0.24, 'square', 0.75), 60);
        break;
      case 'round-win':
        // Fighting impact followed by victorious arcade power-chord fanfare!
        this.playImpactNoise(0.24, 1400, 0.85);
        this.playTone(150, 45, 0.25, 'sawtooth', 0.85);
        setTimeout(() => this.playTone(523.25, 659.25, 0.14, 'triangle', 0.85), 110);
        setTimeout(() => this.playTone(659.25, 783.99, 0.15, 'triangle', 0.9), 220);
        setTimeout(() => this.playTone(783.99, 1046.5, 0.28, 'triangle', 0.95), 330);
        break;
      case 'round-loss':
        // Heavy backlash recoil hit + descending power-down
        this.playImpactNoise(0.28, 950, 0.9);
        this.playTone(190, 42, 0.32, 'sawtooth', 0.85);
        setTimeout(() => this.playTone(349.23, 220.0, 0.28, 'sawtooth', 0.7), 120);
        break;
      case 'match-victory':
        this.playImpactNoise(0.3, 1800, 0.95);
        this.playTone(523.25, 659.25, 0.16, 'triangle', 0.9);
        setTimeout(() => this.playTone(659.25, 783.99, 0.16, 'triangle', 0.9), 140);
        setTimeout(() => this.playTone(783.99, 1046.5, 0.18, 'triangle', 0.95), 280);
        setTimeout(() => this.playTone(1046.5, 1318.5, 0.42, 'triangle', 1.0), 420);
        break;
    }
  }

  setMusicTrack(track: MusicTrackType) {
    this.currentMusicTrack = track;
    if (track === 'none' || !this.settings.musicEnabled || this.settings.muted || !this.settings.soundEnabled) {
      this.stopMusicLoop();
      return;
    }
    if (this.hasInteracted) {
      this.startMusicLoop(track);
    }
  }

  private startMusicLoop(track: MusicTrackType) {
    this.stopMusicLoop();
    if (!this.settings.musicEnabled || this.settings.muted || !this.settings.soundEnabled) return;

    const menuNotes = [110, 130.81, 146.83, 164.81, 146.83, 130.81];
    const battleNotes = [146.83, 174.61, 196.0, 220.0, 196.0, 164.81, 146.83, 130.81];
    const notes = track === 'battle' ? battleNotes : menuNotes;
    const intervalMs = track === 'battle' ? 360 : 520;

    this.musicTimer = setInterval(() => {
      if (!this.settings.musicEnabled || this.settings.muted || !this.settings.soundEnabled) {
        this.stopMusicLoop();
        return;
      }
      const ctx = this.ensureContext();
      if (!ctx) return;
      const freq = notes[this.stepIndex % notes.length];
      this.stepIndex++;

      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = track === 'battle' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        const vol = Math.max(0.001, Math.min(0.25, this.settings.musicVolume * 0.12));
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + intervalMs / 1000);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + intervalMs / 1000);
      } catch {
        // ignore
      }
    }, intervalMs);
  }

  stopMusicLoop() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const soundEngine = new OmnitrixSoundEngine();
