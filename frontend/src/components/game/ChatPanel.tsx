import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatEntry } from '../../context/gameReducer';
import { errorMessage } from '../../lib/socket';
import type { GamePhase } from '../../types/game';

interface Props {
  messages: ChatEntry[];
  meId: string | null;
  phase: GamePhase;
  isDrawer: boolean;
  hasGuessed: boolean;
  onSend: (text: string, asGuess: boolean) => Promise<void>;
}

function Message({ m, meId }: { m: ChatEntry; meId: string | null }) {
  const you = m.playerId === meId;
  switch (m.kind) {
    case 'system':
      return <li className="py-0.5 text-center text-sm font-semibold text-ink-soft">{m.text}</li>;
    case 'correct':
      return (
        <li className="rounded-lg bg-marker-green/15 px-2 py-1 font-bold text-marker-green">
          {you ? 'You' : m.playerName} guessed the word!{' '}
          <span className="whitespace-nowrap">+{m.points}</span>
        </li>
      );
    case 'close':
      return <li className="rounded-lg bg-highlighter/70 px-2 py-1 font-semibold">{m.text}</li>;
    default: {
      const secret = m.channel === 'guessed';
      return (
        <li className={`rounded-lg px-2 py-1 ${secret ? 'bg-marker-blue/10' : ''}`}>
          <span className="font-bold">{you ? 'You' : m.playerName}: </span>
          <span className="break-words">{m.text}</span>
          {secret && <span className="ml-1.5 text-xs font-bold uppercase tracking-wide text-marker-blue">guessers only</span>}
        </li>
      );
    }
  }
}

export function ChatPanel({ messages, meId, phase, isDrawer, hasGuessed, onSend }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const stick = useRef(true);

  // Follow new messages unless the user scrolled up to read history.
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const drawing = phase === 'drawing';
  const asGuess = drawing && !isDrawer && !hasGuessed;
  const placeholder = !drawing
    ? 'Say something…'
    : isDrawer
      ? 'Chat with players who guessed…'
      : hasGuessed
        ? 'You got it! Chat with other guessers…'
        : 'Type your guess…';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    setError(null);
    try {
      await onSend(value, asGuess);
    } catch (err) {
      setError(errorMessage(err));
      window.setTimeout(() => setError(null), 2500);
    }
  }

  return (
    <section className="panel flex h-80 flex-col !p-3 lg:h-full lg:min-h-[28rem]" aria-labelledby="chat-heading">
      <h2 id="chat-heading" className="mb-2 px-1 text-xl font-extrabold">Chat &amp; guesses</h2>
      <ul
        ref={listRef}
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 space-y-1 overflow-y-auto pr-1"
      >
        {messages.map((m) => <Message key={m.id} m={m} meId={meId} />)}
      </ul>
      <form onSubmit={submit} className="mt-2">
        {error && <p role="alert" className="mb-1 text-sm font-semibold text-marker-red">{error}</p>}
        <input
          className="field !py-2 text-base"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={asGuess ? 'Your guess' : 'Chat message'}
          autoComplete="off"
        />
      </form>
    </section>
  );
}
