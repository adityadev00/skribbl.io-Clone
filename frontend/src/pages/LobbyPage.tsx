import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InviteLink } from '../components/lobby/InviteLink';
import { PlayerList } from '../components/lobby/PlayerList';
import { SettingsPanel } from '../components/lobby/SettingsPanel';
import { Button } from '../components/ui/Button';
import { SoundToggle } from '../components/SoundToggle';
import { useGame } from '../hooks/useGame';
import { useRoom } from '../hooks/useRoom';
import { errorMessage } from '../lib/socket';

export function LobbyPage() {
  const { updateSettings, startGame, leaveRoom } = useGame();
  const { room, players, playerId, isHost, host, canStart, onlineCount, inviteUrl } = useRoom();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!room) return null; // RoomPage only renders this when a room exists

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await startGame(); // the server then broadcasts round_start; RoomPage switches screens
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  }

  async function leave() {
    await leaveRoom();
    navigate('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-semibold text-ink-soft">{room.settings.isPrivate ? 'Private room' : 'Public room'}</p>
          <h1 className="font-marker text-5xl leading-none tracking-widest sm:text-6xl">{room.code}</h1>
        </div>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <Button variant="ghost" onClick={() => void leave()}>Leave room</Button>
        </div>
      </header>

      <div className="grid items-start gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-5">
          <div className="panel">
            <InviteLink url={inviteUrl} />
          </div>
          <PlayerList players={players} meId={playerId} max={room.settings.maxPlayers} />
        </div>
        <SettingsPanel settings={room.settings} editable={isHost} onChange={updateSettings} />
      </div>

      <footer className="panel flex flex-wrap items-center justify-between gap-4">
        <div role="status" aria-live="polite">
          {isHost ? (
            canStart ? (
              <p className="text-lg font-semibold">{onlineCount} players ready. Start whenever you like.</p>
            ) : (
              <p className="text-lg font-semibold">Waiting for at least one more player to join.</p>
            )
          ) : (
            <p className="text-lg font-semibold">Waiting for {host?.name ?? 'the host'} to start the game…</p>
          )}
          {error && <p role="alert" className="font-semibold text-marker-red">{error}</p>}
        </div>
        {isHost && (
          <Button onClick={() => void start()} disabled={!canStart} loading={starting} className="text-xl">
            Start game
          </Button>
        )}
      </footer>
    </main>
  );
}
