export type GamePhase = 'lobby' | 'choosing' | 'drawing' | 'round_end' | 'game_over';
export type TurnEndReason = 'time_up' | 'all_guessed' | 'drawer_left';
export type GuessOutcome = 'correct' | 'close' | 'incorrect' | 'not_allowed';

export interface RoomSettings {
  maxPlayers: number; // 2–20
  rounds: number;     // 2–10
  drawTime: number;   // 15–240 seconds
  wordCount: number;  // 1–5 choices per turn
  hints: number;      // 0–5 (0 = disabled)
  isPrivate: boolean;
}

/** Coordinates are normalized to 0..1 so every client can render at any canvas size. */
export interface Point { x: number; y: number }
/** One drawing operation. 'fill' = paint-bucket at points[0] (replayed by each client, undoable like a stroke). */
export interface Stroke { kind: 'stroke' | 'fill'; color: string; size: number; points: Point[] }

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isDrawer: boolean;
  hasGuessed: boolean;
  isConnected: boolean;
}

export interface LeaderboardEntry { playerId: string; name: string; score: number; rank: number }
export interface GuessResult { outcome: GuessOutcome; points?: number }

/** Full snapshot, personalised per viewer (only the drawer receives the word while drawing). */
export interface GameStatePayload {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  hint: string[];            // e.g. ['_','_','a','_',' ','_']
  word: string | null;
  timeLeftMs: number;
  players: PublicPlayer[];
  strokes: Stroke[];
}

export type ChatType = 'chat' | 'guess' | 'close';
export interface ChatMessagePayload {
  playerId: string;
  playerName: string;
  text: string;
  type: ChatType;
  /** 'all' = everyone, 'guessed' = drawer + players who already guessed, 'private' = sender only */
  channel: 'all' | 'guessed' | 'private';
}

export type AckResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } };

/** Abstraction over Socket.IO so game logic never touches sockets directly (easy to unit-test). */
export interface Broadcaster {
  toRoom(roomCode: string, event: string, payload?: unknown): void;
  toRoomExcept(roomCode: string, exceptId: string, event: string, payload?: unknown): void;
  toPlayer(playerId: string, event: string, payload?: unknown): void;
}
