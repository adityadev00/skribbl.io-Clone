import { avatarColor } from '../../lib/avatar';
import { ROUND_END_MS } from '../../lib/constants';
import type { GameView } from '../../context/gameReducer';
import type { PublicPlayer, TurnEndReason } from '../../types/game';

const REASONS: Record<TurnEndReason, string> = {
  time_up: "Time's up!",
  all_guessed: 'Everyone guessed it!',
  drawer_left: 'The drawer left the game.',
};

interface Props { game: GameView; players: PublicPlayer[]; meId: string | null }

export function RoundEndOverlay({ game, players, meId }: Props) {
  const rows = players
    .map((p) => ({ p, gain: p.score - (game.turnStartScores[p.id] ?? p.score) }))
    .sort((a, b) => b.gain - a.gain || b.p.score - a.p.score);

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-white/95 p-4" role="status" aria-live="polite">
      <div className="animate-pop w-full max-w-sm">
        <p className="text-center font-bold text-ink-soft">{game.roundEnd ? REASONS[game.roundEnd.reason] : 'Turn over'}</p>
        <p className="text-center text-sm text-ink-soft">The word was</p>
        <p className="mb-3 text-center font-marker text-4xl capitalize text-marker-blue">{game.word ?? '—'}</p>
        <ul className="flex flex-col gap-1.5">
          {rows.map(({ p, gain }) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border-2 border-ink/15 px-2.5 py-1.5">
              <span className="size-4 shrink-0 rounded-full border border-ink" style={{ backgroundColor: avatarColor(p.id) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}{p.id === meId ? ' (you)' : ''}</span>
              <span className={`font-extrabold ${gain > 0 ? 'text-marker-green' : 'text-ink-soft'}`}>{gain > 0 ? `+${gain}` : '0'}</span>
              <span className="w-12 text-right tabular-nums text-ink-soft">{p.score}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
          <div className="h-full bg-marker-blue" style={{ animation: `drain ${ROUND_END_MS}ms linear forwards` }} />
        </div>
        <p className="mt-1 text-center text-sm text-ink-soft">Next turn starting…</p>
      </div>
    </div>
  );
}
