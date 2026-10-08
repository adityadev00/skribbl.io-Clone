import type { RoomSettings } from '../types';

export const PORT = Number(process.env.PORT) || 3001;
export const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

export const MIN_PLAYERS_TO_START = 2;
/** How long a disconnected player's seat is held before they are removed from the room. */
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 30_000;
export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;
export const ROOM_CODE_LENGTH = 5;
// No 0/O/1/I to avoid typos when sharing codes
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const BRUSH_SIZE = { min: 1, max: 60 } as const;
/** Abuse guards: max drawing ops per turn / points per stroke. */
export const MAX_OPS_PER_TURN = 1500;
export const MAX_POINTS_PER_STROKE = 6000;
/** Max points accepted in one batched `draw_move` message. */
export const MAX_POINTS_PER_BATCH = 64;

export const SETTINGS_LIMITS = {
  maxPlayers: { min: 2, max: 20 },
  rounds: { min: 2, max: 10 },
  drawTime: { min: 15, max: 240 },
  wordCount: { min: 1, max: 5 },
  hints: { min: 0, max: 5 },
} as const;

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  hints: 2,
  isPrivate: true,
};

export const TIMING = {
  wordChoiceMs: 15_000, // auto-pick a word if the drawer is idle
  roundEndMs: 5_000,    // pause between turns to show the word + scores
} as const;

export const SCORING = {
  guessBase: 100,       // flat points for any correct guess
  guessTimeBonus: 400,  // extra points scaled by time remaining
  drawerMax: 200,       // drawer's total if every guesser gets it, split per guesser
} as const;
