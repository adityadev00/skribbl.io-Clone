import { useEffect, useRef, useState } from 'react';
import { avatarColor } from '../../lib/avatar';
import type { PublicPlayer } from '../../types/game';

/** Detects score increases between renders → short-lived "+N" badges. */
function useScoreDeltas(players: PublicPlayer[]) {
  const prev = useRef(new Map<string, number>());
  const [deltas, setDeltas] = useState<Record<string, { value: number; key: number }>>({});

  useEffect(() => {
    const gained: Record<string, { value: number; key: number }> = {};
    for (const p of players) {
      const before = prev.current.get(p.id);
      if (before !== undefined && p.score > before) gained[p.id] = { value: p.score - before, key: Date.now() };
      prev.current.set(p.id, p.score);
    }
    const ids = Object.keys(gained);
    if (!ids.length) return;
    setDeltas((d) => ({ ...d, ...gained }));
    const t = window.setTimeout(() => setDeltas((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !ids.includes(id)))), 1800);
    return () => window.clearTimeout(t);
  }, [players]);

  return deltas;
}

interface Props { players: PublicPlayer[]; meId: string | null }

export function Scoreboard({ players, meId }: Props) {
  const deltas = useScoreDeltas(players);
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return (
    <section className="panel !p-3" aria-labelledby="scores-heading">
      <h2 id="scores-heading" className="mb-2 px-1 text-xl font-extrabold">Scores</h2>
      <ol className="flex flex-col gap-1.5">
        {sorted.map((p, i) => (
          <li
            key={p.id}
            className={`relative flex items-center gap-2 rounded-lg border-2 px-2 py-1.5 ${
              p.hasGuessed ? 'border-marker-green bg-marker-green/10' : 'border-ink/15'
            } ${p.isConnected ? '' : 'opacity-50'}`}
          >
            <span className="w-4 text-center text-sm font-bold text-ink-soft">{i + 1}</span>
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink text-sm font-extrabold text-white" style={{ backgroundColor: avatarColor(p.id) }}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold leading-tight">
                {p.name}{p.id === meId && <span className="text-ink-soft"> (you)</span>}
              </span>
              <span className="block text-xs font-semibold text-ink-soft">
                {p.isDrawer ? 'Drawing' : p.hasGuessed ? 'Guessed it ✓' : !p.isConnected ? 'Reconnecting…' : '\u00a0'}
              </span>
            </span>
            <span key={p.score} className="animate-pop font-extrabold tabular-nums">{p.score}</span>
            {deltas[p.id] && (
              <span key={deltas[p.id].key} className="animate-float pointer-events-none absolute right-2 -top-2 font-extrabold text-marker-green">
                +{deltas[p.id].value}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
