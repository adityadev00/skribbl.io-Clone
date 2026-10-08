// Mirrors backend/src/types.ts — keep in sync.
export type GamePhase = 'lobby' | 'choosing' | 'drawing' | 'round_end' | 'game_over';
export type TurnEndReason = 'time_up' | 'all_guessed' | 'drawer_left';

export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
  hints: number;
  isPrivate: boolean;
}

export interface Point { x: number; y: number }          // normalized 0..1
/** 'fill' = paint bucket at points[0]. Ops are replayed in order on every client. */
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

export interface RoomSnapshot {
  code: string;
  hostId: string;
  settings: RoomSettings;
  phase: GamePhase;
  players: PublicPlayer[];
}

export interface LeaderboardEntry { playerId: string; name: string; score: number; rank: number }

export interface GameStatePayload {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  hint: string[];
  word: string | null;
  timeLeftMs: number;
  players: PublicPlayer[];
  strokes: Stroke[];
}

export interface RoundStartPayload {
  round: number;
  totalRounds: number;
  drawerId: string;
  drawTime: number;
  players: PublicPlayer[];
  wordOptions: string[]; // empty for everyone except the drawer
}

export interface RoundEndPayload {
  word: string | null;
  reason: TurnEndReason;
  scores: LeaderboardEntry[];
  players: PublicPlayer[];
  nextDrawerId: string | null;
}

export interface GameOverPayload { winner: LeaderboardEntry | null; leaderboard: LeaderboardEntry[] }

export type DrawData =
  | { type: 'start'; x: number; y: number; color: string; size: number }
  | { type: 'move'; x: number; y: number }          // single point (legacy shape)
  | { type: 'move'; points: Point[] }                 // batched: one message per animation frame
  | { type: 'end' }
  | { type: 'fill'; x: number; y: number; color: string };

export type ChatType = 'chat' | 'guess' | 'close';
export interface ChatMessagePayload {
  playerId: string;
  playerName: string;
  text: string;
  type: ChatType;
  channel: 'all' | 'guessed' | 'private';
}
export interface RoomErrorPayload { code: string; message: string }
export interface GuessResultPayload { correct: boolean; playerId: string; playerName: string; points: number }

// Socket payloads
export interface SessionPayload { playerId: string; token?: string; inRoom: boolean }
export interface RoomJoinedPayload { playerId: string; room: RoomSnapshot; state: GameStatePayload | null }
export type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
