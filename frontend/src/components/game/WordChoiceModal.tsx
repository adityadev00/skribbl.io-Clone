import { useState } from 'react';
import { Button } from '../ui/Button';
import { useNow } from '../../hooks/useNow';
import { errorMessage } from '../../lib/socket';
import { WORD_CHOICE_MS } from '../../lib/constants';

interface Props { options: string[]; startedAt: number; onChoose: (word: string) => Promise<void> }

/** Drawer-only. The server auto-picks a random option when the countdown hits zero. */
export function WordChoiceModal({ options, startedAt, onChoose }: Props) {
  const now = useNow(250);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const secs = Math.max(0, Math.ceil((startedAt + WORD_CHOICE_MS - now) / 1000));

  async function choose(word: string) {
    setPicked(word);
    setError(null);
    try {
      await onChoose(word);
    } catch (e) {
      setError(errorMessage(e));
      setPicked(null);
    }
  }

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-white/90 p-4" role="dialog" aria-modal="false" aria-label="Choose a word to draw">
      <div className="animate-pop w-full max-w-md text-center">
        {options.length === 0 ? (
          <p className="text-xl font-bold">Picking a word for you…</p>
        ) : (
          <>
            <h2 className="text-2xl font-extrabold">Choose a word to draw</h2>
            <p className="mb-4 text-ink-soft">
              Auto-picking in <b className="text-ink">{secs}s</b>
            </p>
            <div className="grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
              {options.map((w) => (
                <Button key={w} variant="secondary" disabled={picked !== null} onClick={() => void choose(w)} className="!text-xl capitalize">
                  {w}
                </Button>
              ))}
            </div>
            {error && <p role="alert" className="mt-3 font-semibold text-marker-red">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
