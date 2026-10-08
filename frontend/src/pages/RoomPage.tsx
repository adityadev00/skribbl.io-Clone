import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useGame } from '../hooks/useGame';
import { errorMessage } from '../lib/socket';
import { getSavedName, saveName } from '../lib/session';
import { MAX_NAME_LENGTH } from '../lib/constants';
import { GamePage } from './GamePage';
import { LobbyPage } from './LobbyPage';

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto grid min-h-screen max-w-md place-items-center px-5"><div className="panel w-full">{children}</div></main>;
}

/** Opened an invite link (/room/ABCDE) without being in that room yet. */
function JoinByLink({ code }: { code: string }) {
  const { joinRoom } = useGame();
  const [name, setName] = useState(getSavedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name first.');
    setBusy(true);
    setError(null);
    try {
      saveName(name.trim());
      await joinRoom(code, name); // state.room is set → RoomPage re-renders into the lobby
    } catch (err) {
      setError(errorMessage(err));
      setNotFound(err instanceof Error && 'code' in err && err.code === 'ROOM_NOT_FOUND');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <p className="font-semibold text-ink-soft">You've been invited to room</p>
          <h1 className="font-marker text-5xl tracking-widest">{code}</h1>
        </div>
        <div>
          <label htmlFor="join-name" className="mb-1.5 block font-semibold">Your name</label>
          <input id="join-name" className="field" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="nickname" />
        </div>
        {error && <p role="alert" className="font-semibold text-marker-red">{error}</p>}
        <Button type="submit" loading={busy}>Join room</Button>
        {notFound && <Link to="/" className="font-semibold text-marker-blue underline">Back to the home page</Link>}
      </form>
    </Centered>
  );
}

export function RoomPage() {
  const { code = '' } = useParams();
  const wanted = code.toUpperCase();
  const { state, leaveRoom } = useGame();
  const { room, ready } = state;

  if (!ready) return <Centered><p className="text-lg font-semibold">Getting your seat ready…</p></Centered>;

  if (!room) return <JoinByLink code={wanted} />;

  if (room.code !== wanted) {
    return (
      <Centered>
        <h1 className="mb-2 text-2xl font-extrabold">You're already in room {room.code}</h1>
        <p className="mb-4 text-ink-soft">Leave it to join {wanted}.</p>
        <div className="flex flex-wrap gap-2">
          <Link to={`/room/${room.code}`}><Button variant="secondary">Go to {room.code}</Button></Link>
          <Button onClick={() => void leaveRoom()}>Leave and join {wanted}</Button>
        </div>
      </Centered>
    );
  }

  if (room.phase === 'lobby') return <LobbyPage />;

  return <GamePage />;
}
