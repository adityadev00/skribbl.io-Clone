import { useCallback, useState } from 'react';
import { Canvas } from '../components/game/Canvas';
import { ChatPanel } from '../components/game/ChatPanel';
import { GameOverScreen } from '../components/game/GameOverScreen';
import { RoundEndOverlay } from '../components/game/RoundEndOverlay';
import { Scoreboard } from '../components/game/Scoreboard';
import { Timer } from '../components/game/Timer';
import { TurnBanner } from '../components/game/TurnBanner';
import { WordChoiceModal } from '../components/game/WordChoiceModal';
import { WordHint } from '../components/game/WordHint';
import { SoundToggle } from '../components/SoundToggle';
import { useGame } from '../hooks/useGame';
import { useRoom } from '../hooks/useRoom';

export function GamePage() {
  const { state, chooseWord, sendMessage } = useGame();
  const { room, game, players, me, playerId } = useRoom();
  const [introDone, setIntroDone] = useState('');

  const turnKey = game ? `${game.round}:${game.drawerId}` : '';
  const finishIntro = useCallback(() => setIntroDone(turnKey), [turnKey]);

  if (!room || !game) return null;
  if (game.phase === 'game_over') return <GameOverScreen />;

  const isDrawer = game.drawerId === playerId;
  const drawer = players.find((p) => p.id === game.drawerId);
  const drawing = game.phase === 'drawing';
  const choosing = game.phase === 'choosing';
  const introActive = choosing && introDone !== turnKey;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-4">
      <header className="panel flex items-center justify-between gap-4 !p-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wider text-ink-soft">Round</p>
          <p className="text-2xl font-extrabold leading-none">{game.round}<span className="text-ink-soft">/{game.totalRounds}</span></p>
        </div>
        <WordHint phase={game.phase} hint={game.hint} word={game.word} isDrawer={isDrawer} />
        <div className="flex items-center gap-3">
          <SoundToggle />
          <Timer endAt={game.syncedAt + game.timeLeftMs} totalMs={room.settings.drawTime * 1000} active={drawing} />
        </div>
      </header>

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <div className="order-2 lg:order-1"><Scoreboard players={players} meId={playerId} /></div>

        <div className="order-1 lg:order-2">
          <Canvas canDraw={isDrawer && drawing} showToolbar={isDrawer} phase={game.phase} strokes={game.strokes} syncKey={game.syncedAt}>
            {introActive && (
              <TurnBanner name={drawer?.name ?? 'Someone'} isYou={isDrawer} round={game.round} totalRounds={game.totalRounds} onDone={finishIntro} />
            )}
            {choosing && !introActive && isDrawer && (
              <WordChoiceModal options={game.wordOptions} startedAt={game.syncedAt} onChoose={chooseWord} />
            )}
            {choosing && !introActive && !isDrawer && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-white/85" role="status">
                <p className="animate-pop rounded-xl border-2 border-ink bg-highlighter px-5 py-3 text-xl font-bold">
                  {drawer?.name ?? 'The drawer'} is choosing a word…
                </p>
              </div>
            )}
            {game.phase === 'round_end' && <RoundEndOverlay game={game} players={players} meId={playerId} />}
          </Canvas>
        </div>

        <div className="order-3">
          <ChatPanel
            messages={state.messages}
            meId={playerId}
            phase={game.phase}
            isDrawer={isDrawer}
            hasGuessed={!!me?.hasGuessed}
            onSend={sendMessage}
          />
        </div>
      </div>
    </main>
  );
}
