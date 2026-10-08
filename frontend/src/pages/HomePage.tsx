import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreateRoomForm } from '../components/lobby/CreateRoomForm';
import { JoinRoomForm } from '../components/lobby/JoinRoomForm';
import { Button } from '../components/ui/Button';
import { SoundToggle } from '../components/SoundToggle';
import { useGame } from '../hooks/useGame';
import { getSavedName } from '../lib/session';
import { MAX_NAME_LENGTH } from '../lib/constants';

export function HomePage() {
  const { state, leaveRoom } = useGame();
  const [name, setName] = useState(getSavedName);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-5 py-10 sm:py-16">
      <header className="relative">
        <SoundToggle className="absolute right-0 top-0" />
        <h1 className="font-marker text-6xl leading-none text-ink sm:text-8xl">Doodle Dash</h1>
        <svg viewBox="0 0 320 16" className="mt-2 h-4 w-64 sm:w-80" aria-hidden>
          <path d="M3 10 C 30 2, 50 16, 80 8 S 130 2, 160 9 S 215 15, 245 7 S 295 4, 317 9" fill="none" stroke="var(--color-marker-blue)" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <p className="mt-4 max-w-md text-xl text-ink-soft">
          Pick a word, draw it, and race your friends to guess it.
        </p>
      </header>

      {state.room && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 bg-highlighter/50">
          <p className="text-lg font-semibold">
            You're in room <span className="font-marker text-xl tracking-widest">{state.room.code}</span>
          </p>
          <div className="flex gap-2">
            <Link to={`/room/${state.room.code}`}>
              <Button>Return to room</Button>
            </Link>
            <Button variant="danger" onClick={() => void leaveRoom()}>Leave</Button>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="player-name" className="mb-1.5 block text-lg font-bold">Your name</label>
        <input
          id="player-name"
          className="field max-w-sm"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Aditya"
          autoComplete="nickname"
        />
      </div>

      <div className="grid items-stretch gap-5 md:grid-cols-2">
        <CreateRoomForm name={name} />
        <JoinRoomForm name={name} />
      </div>
    </main>
  );
}
