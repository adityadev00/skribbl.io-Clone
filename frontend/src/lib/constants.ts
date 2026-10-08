import type { RoomSettings } from '../types/game';

// Mirrors backend SETTINGS_LIMITS.
export const SETTINGS_LIMITS = {
  maxPlayers: { min: 2, max: 20 },
  rounds: { min: 2, max: 10 },
  drawTime: { min: 15, max: 240 },
  wordCount: { min: 1, max: 5 },
  hints: { min: 0, max: 5 },
} as const satisfies Record<string, { min: number; max: number }>;

export const MAX_NAME_LENGTH = 20;
export const ROOM_CODE_LENGTH = 5;
export const MIN_PLAYERS = 2;

// Mirrors backend TIMING (used for countdown bars only — the server is the authority).
export const WORD_CHOICE_MS = 15_000;
export const ROUND_END_MS = 5_000;

export const BRUSH_SIZES = [4, 8, 16, 32] as const;
export const PALETTE = [
  '#000000', '#5c5c5c', '#a8a8a8', '#ffffff', '#ff4d4d', '#ff9f1c', '#ffe14d', '#1fae6a',
  '#00a8c6', '#2f6bff', '#8b5cf6', '#e84393', '#7a4a21', '#f4b183', '#14532d', '#1e3a8a',
] as const;

export type SettingsKey = keyof typeof SETTINGS_LIMITS;
export type SettingsPatch = Partial<RoomSettings>;
