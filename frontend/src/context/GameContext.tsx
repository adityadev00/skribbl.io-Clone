import { createContext, useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { EVENTS } from '../lib/events';
import { emitAck, socket } from '../lib/socket';
import { gameReducer, initialState, type GameContextState } from './gameReducer';
import { useSoundEffects } from '../hooks/useSoundEffects';
import type {
  ChatMessagePayload, GameOverPayload, GameStatePayload, GuessResultPayload, PublicPlayer, RoomJoinedPayload, RoomSnapshot,
  RoundEndPayload, RoundStartPayload, SessionPayload,
} from '../types/game';
import type { SettingsPatch } from '../lib/constants';

export interface GameContextValue {
  state: GameContextState;
  createRoom: (hostName: string, settings?: SettingsPatch) => Promise<RoomSnapshot>;
  joinRoom: (code: string, playerName: string) => Promise<RoomSnapshot>;
  /** Joins a random open public lobby; rejects with code NO_ROOMS_AVAILABLE (and the server also emits `room:error`). */
  joinRandomRoom: (playerName: string) => Promise<RoomSnapshot>;
  updateSettings: (patch: SettingsPatch) => Promise<void>;
  startGame: () => Promise<void>;
  chooseWord: (word: string) => Promise<void>;
  /** While a word is being drawn a guesser's message is a guess; the server treats both the same way. */
  sendMessage: (text: string, asGuess: boolean) => Promise<void>;
  leaveRoom: () => Promise<void>;
}

type Handler = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export const GameContext = createContext<GameContextValue | null>(null);

/** Owns the socket lifecycle and turns server events into reducer actions. */
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  useSoundEffects(state.playerId);

  useEffect(() => {
    // Handlers are registered BEFORE connect(): the server emits `session` / `room_rejoined`
    // immediately on connection and we must not miss them.
    const h = {
      connect: () => dispatch({ type: 'online' }),
      disconnect: () => dispatch({ type: 'offline' }),
      connect_error: () => dispatch({ type: 'offline' }),
      [EVENTS.SESSION]: (p: SessionPayload) => dispatch({ type: 'session', playerId: p.playerId, inRoom: p.inRoom }),
      [EVENTS.ROOM_REJOINED]: (p: RoomJoinedPayload) => dispatch({ type: 'joined', playerId: p.playerId, room: p.room, state: p.state, fresh: false }),
      [EVENTS.ROOM_UPDATED]: (room: RoomSnapshot) => dispatch({ type: 'room_updated', room }),
      [EVENTS.PLAYER_JOINED]: (p: { player: PublicPlayer; players: PublicPlayer[] }) =>
        dispatch({ type: 'players', players: p.players, joined: p.player.name }),
      [EVENTS.PLAYER_LEFT]: (p: { playerId: string; players: PublicPlayer[]; hostId: string }) =>
        dispatch({ type: 'players', players: p.players, hostId: p.hostId, leftId: p.playerId }),
      [EVENTS.PLAYERS_UPDATE]: (p: { players: PublicPlayer[] }) => dispatch({ type: 'players', players: p.players }),
      [EVENTS.ROUND_START]: (payload: RoundStartPayload) => dispatch({ type: 'round_start', payload }),
      [EVENTS.GAME_STATE]: (payload: GameStatePayload) => dispatch({ type: 'game_state', payload }),
      [EVENTS.HINT_UPDATE]: (p: { hint: string[] }) => dispatch({ type: 'hint', hint: p.hint }),
      [EVENTS.ROUND_END]: (payload: RoundEndPayload) => dispatch({ type: 'round_end', payload }),
      [EVENTS.GAME_OVER]: (payload: GameOverPayload) => dispatch({ type: 'game_over', payload }),
      [EVENTS.CHAT_MESSAGE]: (payload: ChatMessagePayload) => dispatch({ type: 'chat', payload }),
      [EVENTS.GUESS_RESULT]: (payload: GuessResultPayload) => dispatch({ type: 'guess_result', payload }),
    } as const;

    Object.entries(h).forEach(([event, fn]) => socket.on(event, fn as Handler));
    if (!socket.active) socket.connect(); // `active` stays true while auto-reconnecting; avoids double-connect in StrictMode
    if (socket.connected) dispatch({ type: 'online' });

    // Only listeners are removed on cleanup; the socket itself lives for the whole app lifetime.
    return () => {
      Object.entries(h).forEach(([event, fn]) => socket.off(event, fn as Handler));
    };
  }, []);

  const createRoom = useCallback(async (hostName: string, settings?: SettingsPatch) => {
    const d = await emitAck<RoomJoinedPayload>(EVENTS.CREATE_ROOM, { hostName, settings });
    dispatch({ type: 'joined', playerId: d.playerId, room: d.room, state: null, fresh: true });
    return d.room;
  }, []);

  const joinRoom = useCallback(async (code: string, playerName: string) => {
    const d = await emitAck<RoomJoinedPayload>(EVENTS.JOIN_ROOM, { roomId: code, playerName });
    dispatch({ type: 'joined', playerId: d.playerId, room: d.room, state: d.state, fresh: true });
    return d.room;
  }, []);

  const joinRandomRoom = useCallback(async (playerName: string) => {
    const d = await emitAck<RoomJoinedPayload>(EVENTS.JOIN_RANDOM_ROOM, { playerName });
    dispatch({ type: 'joined', playerId: d.playerId, room: d.room, state: d.state, fresh: true });
    return d.room;
  }, []);

  // The server echoes the result via `room_updated`, so no local dispatch is needed here.
  const updateSettings = useCallback(async (patch: SettingsPatch) => {
    await emitAck(EVENTS.UPDATE_SETTINGS, patch);
  }, []);

  const startGame = useCallback(async () => {
    await emitAck(EVENTS.START_GAME);
  }, []);

  const chooseWord = useCallback(async (word: string) => {
    await emitAck(EVENTS.WORD_CHOSEN, { word });
  }, []);

  const sendMessage = useCallback(async (text: string, asGuess: boolean) => {
    await emitAck(asGuess ? EVENTS.GUESS : EVENTS.CHAT, { text });
  }, []);

  const leaveRoom = useCallback(async () => {
    try { await emitAck(EVENTS.LEAVE_ROOM); } finally { dispatch({ type: 'left' }); }
  }, []);

  const value = useMemo(
    () => ({ state, createRoom, joinRoom, joinRandomRoom, updateSettings, startGame, chooseWord, sendMessage, leaveRoom }),
    [state, createRoom, joinRoom, joinRandomRoom, updateSettings, startGame, chooseWord, sendMessage, leaveRoom],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
