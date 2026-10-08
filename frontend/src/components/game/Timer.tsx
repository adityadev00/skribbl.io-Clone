import { useEffect } from 'react';
import { useNow } from '../../hooks/useNow';
import { sound } from '../../lib/sound';

interface Props { endAt: number; totalMs: number; active: boolean }

/** Ring + seconds. Counts down from the server-provided deadline, so reconnects stay in sync. */
export function Timer({ endAt, totalMs, active }: Props) {
  const now = useNow(200, active);
  const left = active ? Math.max(0, endAt - now) : 0;
  const secs = Math.ceil(left / 1000);
  const frac = totalMs > 0 ? Math.min(1, left / totalMs) : 0;
  const urgent = active && secs <= 10;

  // Clock tick for each of the last 5 seconds (the 1-second mark is higher/longer).
  useEffect(() => {
    if (active && secs >= 1 && secs <= 5) sound.tick(secs === 1);
  }, [secs, active]);
  const R = 22;
  const C = 2 * Math.PI * R;

  return (
    <div className="relative size-16 shrink-0" role="timer" aria-label={active ? `${secs} seconds left` : 'Timer idle'}>
      <svg viewBox="0 0 56 56" className="size-full -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={R} fill="none" stroke="var(--color-grid)" strokeWidth="6" />
        <circle
          cx="28" cy="28" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
          stroke={urgent ? 'var(--color-marker-red)' : 'var(--color-marker-blue)'}
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
      </svg>
      <span className={`absolute inset-0 grid place-items-center text-xl font-extrabold ${urgent ? 'text-marker-red' : ''}`}>
        {active ? secs : '–'}
      </span>
    </div>
  );
}
