import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted, initSound } from '../lib/sound';

export function SoundToggle({ className = '' }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted);
  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={() => { initSound(); setMuted(!muted); }}
      className={`grid size-10 shrink-0 place-items-center rounded-xl border-2 border-ink/25 text-ink-soft transition hover:border-ink hover:text-ink ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5 6 9H3v6h3l5 4V5z" />
        {muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </button>
  );
}
