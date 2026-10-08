import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { useGame } from '../../hooks/useGame';
import { errorMessage } from '../../lib/socket';
import { saveName } from '../../lib/session';

export function CreateRoomForm({ name }: { name: string }) {
  const { createRoom } = useGame();
  const navigate = useNavigate();
  const [isPrivate, setPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name first.');
    setBusy(true);
    setError(null);
    try {
      saveName(name.trim());
      const room = await createRoom(name, { isPrivate });
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-extrabold">Create a room</h2>
        <p className="text-ink-soft">You set the rules, then invite friends with a link.</p>
      </div>

      <fieldset>
        <legend className="mb-1.5 font-semibold">Who can join?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: true, label: 'Private', hint: 'Invite link only' },
            { value: false, label: 'Public', hint: 'Listed for anyone' },
          ].map((o) => (
            <label
              key={o.label}
              className={`cursor-pointer rounded-xl border-2 px-3 py-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-marker-blue ${
                isPrivate === o.value ? 'border-ink bg-highlighter/60' : 'border-ink/25 hover:border-ink/60'
              }`}
            >
              <input type="radio" name="visibility" className="sr-only" checked={isPrivate === o.value} onChange={() => setPrivate(o.value)} />
              <span className="block font-bold">{o.label}</span>
              <span className="block text-sm text-ink-soft">{o.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="font-semibold text-marker-red">{error}</p>}
      <Button type="submit" loading={busy} className="mt-auto">Create room</Button>
    </form>
  );
}
