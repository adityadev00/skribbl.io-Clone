/**
 * Zero-asset sound effects: every sound is synthesised with the Web Audio API (oscillators + gain
 * envelopes), so there are no files to download, license or cache.
 *
 * Browsers block audio until the user interacts with the page, so the AudioContext is created on the
 * first pointer/key press (`initSound()`); sounds requested earlier are silently skipped.
 */

const MUTE_KEY = 'skribbl.muted';
const MASTER_VOLUME = 0.35;

type Ctor = typeof AudioContext;
interface ToneSpec {
  freq: number;
  /** glide to this frequency over the note (pitch sweep → "pop") */
  endFreq?: number;
  /** start offset in seconds */
  at?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let armed = false;

let muted = (() => {
  try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
})();
const listeners = new Set<() => void>();

// ── mute state (consumed by <SoundToggle/> through useSyncExternalStore) ──
export const isMuted = (): boolean => muted;
export const subscribeMuted = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
export function setMuted(value: boolean): void {
  muted = value;
  try { window.localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

// ── context lifecycle ──
function create(): void {
  if (ctx || typeof window === 'undefined') return;
  const AC: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

/** Call once at startup: unlocks audio on the first user gesture, then removes its own listeners. */
export function initSound(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const unlock = () => {
    create();
    if (ctx?.state === 'suspended') void ctx.resume();
    if (ctx) ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.removeEventListener(t, unlock));
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, unlock, { passive: true }));
}

/** The context, but only when a sound may actually play right now. */
function ready(): AudioContext | null {
  if (muted || !ctx || !master || ctx.state !== 'running') return null;
  return ctx;
}

function tone(c: AudioContext, { freq, endFreq, at = 0, dur, type = 'sine', vol = 0.5 }: ToneSpec): void {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  // Fast attack + exponential decay = percussive note without clicks at start/end.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(master!);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

const play = (notes: ToneSpec[]): void => {
  const c = ready();
  if (c) notes.forEach((n) => tone(c, n));
};

// ── the sounds ──
const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568, A6: 1760 };

export const sound = {
  /** Someone guessed the word. Your own guess gets a brighter 3-note arpeggio; others hear a soft single ding. */
  correct(self: boolean): void {
    play(self
      ? [
          { freq: NOTE.C6, dur: 0.28, type: 'triangle', vol: 0.5 },
          { freq: NOTE.E6, at: 0.08, dur: 0.28, type: 'triangle', vol: 0.5 },
          { freq: NOTE.G6, at: 0.16, dur: 0.5, type: 'triangle', vol: 0.55 },
        ]
      : [{ freq: NOTE.E6, dur: 0.35, type: 'sine', vol: 0.3 }]);
  },
  /** Last-seconds warning. `final` = the 1-second mark: higher and longer. */
  tick(final = false): void {
    play([{ freq: final ? 1320 : 880, dur: final ? 0.12 : 0.06, type: 'square', vol: final ? 0.18 : 0.14 }]);
  },
  /** A new turn begins (rising pop). */
  roundStart(): void {
    play([{ freq: 300, endFreq: 640, dur: 0.16, type: 'sine', vol: 0.5 }]);
  },
  /** The drawer picked a word and the clock starts (higher double pop). */
  wordChosen(): void {
    play([
      { freq: 520, endFreq: 1040, dur: 0.1, type: 'sine', vol: 0.45 },
      { freq: 780, endFreq: 1560, at: 0.09, dur: 0.1, type: 'sine', vol: 0.4 },
    ]);
  },
  /** Game over fanfare: rising arpeggio into a held chord. */
  victory(): void {
    play([
      { freq: NOTE.C5, dur: 0.22, type: 'triangle', vol: 0.45 },
      { freq: NOTE.E5, at: 0.14, dur: 0.22, type: 'triangle', vol: 0.45 },
      { freq: NOTE.G5, at: 0.28, dur: 0.22, type: 'triangle', vol: 0.45 },
      { freq: NOTE.C6, at: 0.42, dur: 0.25, type: 'triangle', vol: 0.5 },
      { freq: NOTE.C5, at: 0.62, dur: 1.0, type: 'triangle', vol: 0.3 },
      { freq: NOTE.E5, at: 0.62, dur: 1.0, type: 'triangle', vol: 0.3 },
      { freq: NOTE.G5, at: 0.62, dur: 1.0, type: 'triangle', vol: 0.3 },
      { freq: NOTE.C6, at: 0.62, dur: 1.0, type: 'sine', vol: 0.35 },
    ]);
  },
};
