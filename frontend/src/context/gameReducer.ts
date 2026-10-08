import type {
  ChatMessagePayload, GameOverPayload, GamePhase, GameStatePayload, GuessResultPayload,
  PublicPlayer, RoomSnapshot, RoundEndPayload, RoundStartPayload, Stroke,
} from '../types/game';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

/** Client-side view of the current game. */
export interface GameView {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  drawTime: number;
  wordOptions: string[];   // only populated for the drawer, only while choosing
  hint: string[];
  word: string | null;     // only the drawer (or everyone after the turn) ever receives it
  timeLeftMs: number;
  syncedAt: number;        // Date.now() when timeLeftMs was received → countdown = timeLeftMs - elapsed
  strokes: Stroke[];       // snapshot for (re)joiners; live drawing bypasses React state
  turnStartScores: Record<string, number>; // to show "+N this turn" at round end
  roundEnd: RoundEndPayload | null;
  gameOver: GameOverPayload | null;
}

export type ChatKind = 'chat' | 'guess' | 'close' | 'correct' | 'system';
export interface ChatEntry {
  id: number;
  kind: ChatKind;
  channel: 'all' | 'guessed' | 'private';
  playerId?: string;
  playerName?: string;
  text: string;
  points?: number;
}

export interface GameContextState {
  status: ConnectionStatus;
  everConnected: boolean;
  /** false until we know whether the server put us back in a room (avoids a flash of the join form). */
  ready: boolean;
  playerId: string | null;
  room: RoomSnapshot | null;
  game: GameView | null;
  messages: ChatEntry[];
  msgSeq: number;
}

export const initialState: GameContextState = {
  status: 'connecting', everConnected: false, ready: false, playerId: null, room: null, game: null,
  messages: [], msgSeq: 0,
};

export type Action =
  | { type: 'online' }
  | { type: 'offline' }
  | { type: 'session'; playerId: string; inRoom: boolean }
  | { type: 'joined'; playerId?: string; room: RoomSnapshot; state: GameStatePayload | null; fresh: boolean }
  | { type: 'left' }
  | { type: 'room_updated'; room: RoomSnapshot }
  | { type: 'players'; players: PublicPlayer[]; hostId?: string; joined?: string; leftId?: string }
  | { type: 'round_start'; payload: RoundStartPayload }
  | { type: 'game_state'; payload: GameStatePayload }
  | { type: 'hint'; hint: string[] }
  | { type: 'round_end'; payload: RoundEndPayload }
  | { type: 'game_over'; payload: GameOverPayload }
  | { type: 'chat'; payload: ChatMessagePayload }
  | { type: 'guess_result'; payload: GuessResultPayload };

const MAX_MESSAGES = 200;

const emptyView = (): GameView => ({
  phase: 'lobby', round: 0, totalRounds: 0, drawerId: null, drawTime: 0, wordOptions: [], hint: [],
  word: null, timeLeftMs: 0, syncedAt: Date.now(), strokes: [], turnStartScores: {}, roundEnd: null, gameOver: null,
});

const viewFromState = (s: GameStatePayload): GameView => ({
  ...emptyView(),
  phase: s.phase, round: s.round, totalRounds: s.totalRounds, drawerId: s.drawerId,
  hint: s.hint, word: s.word, timeLeftMs: s.timeLeftMs, strokes: s.strokes,
});

function push(state: GameContextState, entry: Omit<ChatEntry, 'id'>): GameContextState {
  return {
    ...state,
    messages: [...state.messages, { id: state.msgSeq, ...entry }].slice(-MAX_MESSAGES),
    msgSeq: state.msgSeq + 1,
  };
}
const system = (text: string): Omit<ChatEntry, 'id'> => ({ kind: 'system', channel: 'all', text });

export function gameReducer(state: GameContextState, a: Action): GameContextState {
  switch (a.type) {
    case 'online':
      return { ...state, status: 'connected', everConnected: true };
    case 'offline':
      return { ...state, status: state.everConnected ? 'reconnecting' : 'connecting' };

    case 'session':
      // inRoom=false → nothing to restore (fresh visit, or our seat expired while we were away).
      return a.inRoom
        ? { ...state, playerId: a.playerId }
        : { ...state, playerId: a.playerId, ready: true, room: null, game: null, messages: [] };

    case 'joined':
      return {
        ...state,
        ready: true,
        playerId: a.playerId ?? state.playerId, // acks carry our id too → state never depends on one event
        room: a.room,
        game: a.state ? viewFromState(a.state) : null,
        messages: a.fresh ? [] : state.messages, // a rejoin keeps the chat we already have
      };
    case 'left':
      return { ...state, room: null, game: null, messages: [] };

    case 'room_updated':
      return { ...state, room: a.room };

    case 'players': {
      if (!state.room) return state;
      let next: GameContextState = {
        ...state,
        room: { ...state.room, players: a.players, hostId: a.hostId ?? state.room.hostId },
      };
      if (a.joined) next = push(next, system(`${a.joined} joined`));
      if (a.leftId) {
        const name = state.room.players.find((p) => p.id === a.leftId)?.name;
        if (name) next = push(next, system(`${name} left`));
      }
      return next;
    }

    case 'round_start': {
      if (!state.room) return state;
      const p = a.payload;
      return {
        ...state,
        room: { ...state.room, phase: 'choosing', players: p.players },
        game: {
          ...emptyView(), phase: 'choosing', round: p.round, totalRounds: p.totalRounds,
          drawerId: p.drawerId, drawTime: p.drawTime, wordOptions: p.wordOptions,
          turnStartScores: Object.fromEntries(p.players.map((x) => [x.id, x.score])),
        },
      };
    }
    case 'game_state': {
      if (!state.room) return state;
      const prev = state.game;
      return {
        ...state,
        room: { ...state.room, phase: a.payload.phase, players: a.payload.players },
        game: {
          ...viewFromState(a.payload),
          drawTime: prev?.drawTime ?? 0,
          turnStartScores: prev?.turnStartScores ?? {},
          syncedAt: Date.now(),
        },
      };
    }
    case 'hint':
      return state.game ? { ...state, game: { ...state.game, hint: a.hint } } : state;

    case 'round_end': {
      if (!state.room) return state;
      const base = state.game ?? emptyView();
      const next: GameContextState = {
        ...state,
        room: { ...state.room, phase: 'round_end', players: a.payload.players },
        game: { ...base, phase: 'round_end', word: a.payload.word, roundEnd: a.payload },
      };
      return a.payload.word ? push(next, system(`The word was “${a.payload.word}”`)) : next;
    }
    case 'game_over': {
      if (!state.room) return state;
      const base = state.game ?? emptyView();
      return {
        ...state,
        room: { ...state.room, phase: 'game_over' },
        game: { ...base, phase: 'game_over', gameOver: a.payload },
      };
    }

    case 'chat': {
      const p = a.payload;
      return push(state, {
        kind: p.type, channel: p.channel, playerId: p.playerId, playerName: p.playerName, text: p.text,
      });
    }
    case 'guess_result': {
      const p = a.payload;
      if (!p.correct) return state;
      return push(state, {
        kind: 'correct', channel: 'all', playerId: p.playerId, playerName: p.playerName,
        text: 'guessed the word!', points: p.points,
      });
    }
    default:
      return state;
  }
}
