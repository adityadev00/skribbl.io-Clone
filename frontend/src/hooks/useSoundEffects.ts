import { useEffect, useRef } from 'react';
import { EVENTS } from '../lib/events';
import { initSound, sound } from '../lib/sound';
import { socket } from '../lib/socket';
import type { GameStatePayload, GuessResultPayload } from '../types/game';

/**
 * Maps server events to sounds. Mounted once in <GameProvider>, so sounds work on every screen
 * (the clock-tick sound lives in <Timer>, next to the countdown it follows).
 */
export function useSoundEffects(playerId: string | null): void {
  const me = useRef(playerId);
  me.current = playerId;

  useEffect(() => {
    initSound();
    const onRoundStart = () => sound.roundStart();
    // game_state is only broadcast when a word is chosen and drawing begins
    const onState = (s: GameStatePayload) => { if (s.phase === 'drawing') sound.wordChosen(); };
    const onGuess = (g: GuessResultPayload) => { if (g.correct) sound.correct(g.playerId === me.current); };
    const onGameOver = () => sound.victory();

    socket.on(EVENTS.ROUND_START, onRoundStart);
    socket.on(EVENTS.GAME_STATE, onState);
    socket.on(EVENTS.GUESS_RESULT, onGuess);
    socket.on(EVENTS.GAME_OVER, onGameOver);
    return () => {
      socket.off(EVENTS.ROUND_START, onRoundStart);
      socket.off(EVENTS.GAME_STATE, onState);
      socket.off(EVENTS.GUESS_RESULT, onGuess);
      socket.off(EVENTS.GAME_OVER, onGameOver);
    };
  }, []);
}
