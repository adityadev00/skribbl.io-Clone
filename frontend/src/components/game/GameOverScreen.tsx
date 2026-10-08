import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { SoundToggle } from '../SoundToggle';
import { useGame } from '../../hooks/useGame';
import { useRoom } from '../../hooks/useRoom';
import { avatarColor } from '../../lib/avatar';
import { errorMessage } from '../../lib/socket';
import type { LeaderboardEntry } from '../../types/game';
import { useState } from 'react';

const PODIUM = {
  1: { h: 'h-44', delay: '0.9s', label: '1st' },
  2: { h: 'h-32', delay: '0.5s', label: '2nd' },
  3: { h: 'h-24', delay: '0.1s', label: '3rd' },
} as const;

function PodiumColumn({ entry, meId }: { entry: LeaderboardEntry; meId: string | null }) {
  const spec = PODIUM[entry.rank as 1 | 2 | 3];
  return (
    <div className="flex w-28 flex-col items-center sm:w-36">
      <span aria-hidden className="mb-1 grid size-12 place-items-center rounded-full border-2 border-ink text-xl font-extrabold text-white" style={{ backgroundColor: avatarColor(entry.playerId) }}>
        {entry.name.slice(0, 1).toUpperCase()}
      </span>
      <p className="max-w-full truncate font-bold">{entry.name}{entry.playerId === meId ? ' (you)' : ''}</p>
      <p className="mb-1 font-extrabold tabular-nums text-ink-soft">{entry.score} pts</p>
      <div
        className={`${spec.h} animate-rise grid w-full origin-bottom place-items-start rounded-t-xl border-2 border-b-0 border-ink pt-2 text-center ${entry.rank === 1 ? 'bg-highlighter' : 'bg-white'}`}
        style={{ animationDelay: spec.delay }}
      >
        <span className="w-full font-marker text-3xl">{spec.label}</span>
      </div>
    </div>
  );
}

export function GameOverScreen() {
  const { game, isHost, host, canStart, playerId } = useRoom();
  const { startGame, leaveRoom } = useGame();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const board = game?.gameOver?.leaderboard ?? [];
  const winner = game?.gameOver?.winner ?? null;
  const podium = board.filter((e) => e.rank <= 3);
  const ordered = [podium.find((e) => e.rank === 2), podium.find((e) => e.rank === 1), podium.find((e) => e.rank === 3)].filter((e): e is LeaderboardEntry => !!e);
  const rest = board.filter((e) => e.rank > 3);

  async function again() {
    setBusy(true);
    setError(null);
    try { await startGame(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center gap-6 px-5 py-10">
      <SoundToggle className="absolute right-5 top-5" />
      <header className="text-center">
        <p className="font-bold uppercase tracking-wider text-ink-soft">Game over</p>
        <h1 className="font-marker text-5xl sm:text-6xl">{winner ? `${winner.name} wins!` : 'Nobody won'}</h1>
      </header>

      <div className="flex items-end justify-center gap-2 sm:gap-4" role="list" aria-label="Podium">
        {ordered.map((e) => <div role="listitem" key={e.playerId}><PodiumColumn entry={e} meId={playerId} /></div>)}
      </div>

      {rest.length > 0 && (
        <ol start={4} className="panel w-full !p-3">
          {rest.map((e) => (
            <li key={e.playerId} className="flex items-center gap-3 border-b border-ink/10 px-2 py-1.5 last:border-0">
              <span className="w-6 text-ink-soft">{e.rank}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{e.name}{e.playerId === playerId ? ' (you)' : ''}</span>
              <span className="font-extrabold tabular-nums">{e.score}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="panel flex w-full flex-wrap items-center justify-between gap-3">
        <div role="status">
          {isHost ? (
            <p className="font-semibold">{canStart ? 'Ready for another round?' : 'Waiting for another player to be online…'}</p>
          ) : (
            <p className="font-semibold">Waiting for {host?.name ?? 'the host'} to start a new game…</p>
          )}
          {error && <p role="alert" className="font-semibold text-marker-red">{error}</p>}
        </div>
        <div className="flex gap-2">
          {isHost && <Button onClick={() => void again()} disabled={!canStart} loading={busy}>Play again</Button>}
          <Button variant="ghost" onClick={async () => { await leaveRoom(); navigate('/'); }}>Leave</Button>
        </div>
      </div>
    </main>
  );
}
