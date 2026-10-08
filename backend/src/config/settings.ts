import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from './constants';
import type { RoomSettings } from '../types';
import { GameError } from '../utils/errors';

type NumericKey = keyof typeof SETTINGS_LIMITS;

function readInt(key: NumericKey, value: unknown): number {
  const { min, max } = SETTINGS_LIMITS[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new GameError('INVALID_SETTINGS', `${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

/** Merge user-supplied settings onto a base, rejecting anything out of range. */
export function resolveSettings(
  input: Partial<RoomSettings> = {},
  base: RoomSettings = DEFAULT_SETTINGS,
): RoomSettings {
  const out: RoomSettings = { ...base };
  (Object.keys(SETTINGS_LIMITS) as NumericKey[]).forEach((key) => {
    if (input[key] !== undefined) out[key] = readInt(key, input[key]);
  });
  if (input.isPrivate !== undefined) {
    if (typeof input.isPrivate !== 'boolean') {
      throw new GameError('INVALID_SETTINGS', 'isPrivate must be a boolean');
    }
    out.isPrivate = input.isPrivate;
  }
  return out;
}
