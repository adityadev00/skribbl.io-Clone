import type { GamePhase } from '../../types/game';

interface Props { phase: GamePhase; hint: string[]; word: string | null; isDrawer: boolean }

/** Drawer sees the real word; guessers see blanks + revealed letters; everyone sees it after the turn. */
export function WordHint({ phase, hint, word, isDrawer }: Props) {
  if (phase === 'choosing') return <p className="text-lg font-semibold text-ink-soft">Choosing a word…</p>;

  const reveal = word !== null && (isDrawer || phase === 'round_end' || phase === 'game_over');
  const chars = reveal ? [...word] : hint;
  if (chars.length === 0) return null;

  const letters = chars.filter((c) => c !== ' ').length;
  const label = reveal
    ? `The word is ${word}`
    : `Hint: ${chars.map((c) => (c === '_' ? 'blank' : c)).join(' ')}`;

  return (
    <div className="text-center">
      <p className="text-sm font-bold uppercase tracking-wider text-ink-soft">
        {isDrawer && phase === 'drawing' ? 'Draw this!' : reveal ? 'The word was' : 'Guess the word'}
      </p>
      <div role="img" aria-label={label} className="mt-1 flex flex-wrap justify-center gap-1.5">
        {chars.map((c, i) =>
          c === ' ' ? (
            <span key={i} className="w-4" />
          ) : (
            <span key={i} className="grid h-10 w-7 place-items-end justify-items-center border-b-4 border-ink font-marker text-3xl leading-none">
              {c === '_' ? '' : c.toUpperCase()}
            </span>
          ),
        )}
      </div>
      {!reveal && <p className="mt-1 text-sm text-ink-soft">{letters} letters</p>}
    </div>
  );
}
