import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useGame } from '../../hooks/useGame';
import { EVENTS } from '../../lib/events';
import { errorMessage, socket, SocketError } from '../../lib/socket';
import { saveName } from '../../lib/session';
import { parseRoomCode } from '../../lib/avatar';
import { ROOM_CODE_LENGTH } from '../../lib/constants';
import type { RoomErrorPayload } from '../../types/game';

const NO_ROOMS = 'No rooms are currently available';

export function JoinRoomForm({ name }: { name: string }) {
  const { joinRoom, joinRandomRoom } = useGame();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [randomBusy, setRandomBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<string | null>(null);
  const randomRef = useRef<HTMLButtonElement>(null);

  // The opener is disabled while its request runs, so browsers can't be trusted to restore focus: do it explicitly.
  const closePopup = () => {
    setPopup(null);
    window.setTimeout(() => randomRef.current?.focus(), 0);
  };

  // Server pushes `room:error` when "join random" finds nothing → show the popup.
  useEffect(() => {
    const onRoomError = (e: RoomErrorPayload) => setPopup(e.message || NO_ROOMS);
    socket.on(EVENTS.ROOM_ERROR, onRoomError);
    return () => { socket.off(EVENTS.ROOM_ERROR, onRoomError); };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name first.');
    const clean = parseRoomCode(code); // accepts a pasted invite link too
    if (clean.length !== ROOM_CODE_LENGTH) return setError(`Room codes have ${ROOM_CODE_LENGTH} characters.`);
    setBusy(true);
    setError(null);
    try {
      saveName(name.trim());
      const room = await joinRoom(clean, name);
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function joinRandom() {
    if (!name.trim()) return setError('Enter your name first.');
    setRandomBusy(true);
    setError(null);
    try {
      saveName(name.trim());
      const room = await joinRandomRoom(name);
      navigate(`/room/${room.code}`);
    } catch (err) {
      // "nothing available" arrives as the room:error event (popup above); the ack error is the same fact.
      if (err instanceof SocketError && err.code === 'NO_ROOMS_AVAILABLE') setPopup(err.message);
      else setError(errorMessage(err));
    } finally {
      setRandomBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="panel flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-extrabold">Join a room</h2>
          <p className="text-ink-soft">Type the code, paste the invite link, or jump into any open game.</p>
        </div>
        <div>
          <label htmlFor="room-code" className="mb-1.5 block font-semibold">Room code</label>
          <input
            id="room-code"
            className="field font-marker text-2xl tracking-[0.2em] uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="K7M2Q"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {error && <p role="alert" className="font-semibold text-marker-red">{error}</p>}
        <div className="mt-auto flex flex-col gap-2.5">
          <Button type="submit" variant="secondary" loading={busy} disabled={randomBusy}>Join room</Button>
          <div className="flex items-center gap-3 text-sm font-semibold text-ink-soft" aria-hidden>
            <span className="h-px flex-1 bg-ink/15" />or<span className="h-px flex-1 bg-ink/15" />
          </div>
          <Button ref={randomRef} type="button" variant="secondary" loading={randomBusy} disabled={busy} onClick={() => void joinRandom()}>
            🎲 Join Random Room
          </Button>
        </div>
      </form>

      {popup && (
        <Modal title="No rooms found" onClose={closePopup}>
          <p>{popup}</p>
          <p className="mt-1 text-base">Create one and invite a friend instead!</p>
        </Modal>
      )}
    </>
  );
}
