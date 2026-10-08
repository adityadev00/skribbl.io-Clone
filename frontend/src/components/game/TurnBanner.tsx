import { useEffect } from 'react';

interface Props { name: string; isYou: boolean; round: number; totalRounds: number; onDone: () => void }

/** Short "whose turn" transition played at the start of every turn. `onDone` must be stable. */
export function TurnBanner({ name, isYou, round, totalRounds, onDone }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDone, isYou ? 1200 : 1700);
    return () => window.clearTimeout(t);
  }, [onDone, isYou]);

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-ink/25" role="status" aria-live="polite">
      <div className="animate-banner rounded-2xl border-2 border-ink bg-highlighter px-8 py-5 text-center shadow-[4px_4px_0_0_var(--color-ink)]">
        <p className="text-sm font-bold uppercase tracking-wider">Round {round} of {totalRounds}</p>
        <p className="font-marker text-3xl sm:text-4xl">{isYou ? 'Your turn to draw!' : `${name} is drawing`}</p>
      </div>
    </div>
  );
}
