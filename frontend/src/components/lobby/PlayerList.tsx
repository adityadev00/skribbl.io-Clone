import { avatarColor } from '../../lib/avatar';
import type { PublicPlayer } from '../../types/game';

function Tag({ children, tone }: { children: string; tone: 'host' | 'you' | 'off' }) {
  const tones = {
    host: 'bg-highlighter border-ink',
    you: 'bg-marker-blue/10 border-marker-blue text-marker-blue',
    off: 'bg-ink/5 border-ink/30 text-ink-soft',
  };
  return <span className={`rounded-full border px-2 py-0.5 text-sm font-bold ${tones[tone]}`}>{children}</span>;
}

export function PlayerList({ players, meId, max }: { players: PublicPlayer[]; meId: string | null; max: number }) {
  return (
    <section className="panel" aria-labelledby="players-heading">
      <h2 id="players-heading" className="mb-3 text-2xl font-extrabold">
        Players <span className="text-ink-soft">{players.length}/{max}</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {players.map((p) => (
          <li key={p.id} className={`flex items-center gap-3 rounded-xl border-2 border-ink/15 px-3 py-2 ${p.isConnected ? '' : 'opacity-60'}`}>
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink text-lg font-extrabold text-white"
              style={{ backgroundColor: avatarColor(p.id) }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-lg font-bold">{p.name}</span>
            <span className="flex shrink-0 gap-1.5">
              {p.isHost && <Tag tone="host">Host</Tag>}
              {p.id === meId && <Tag tone="you">You</Tag>}
              {!p.isConnected && <Tag tone="off">Reconnecting</Tag>}
            </span>
          </li>
        ))}
      </ul>
      {players.length < 2 && <p className="mt-3 text-ink-soft">Share the invite link — you need at least one more player.</p>}
    </section>
  );
}
