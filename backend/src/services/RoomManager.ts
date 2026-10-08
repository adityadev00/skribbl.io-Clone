import { randomInt } from 'node:crypto';
import { Room, type RoomSnapshot } from '../models/Room';
import { Player } from '../models/Player';
import { WordService } from './WordService';
import {
  DEFAULT_SETTINGS, RECONNECT_GRACE_MS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
} from '../config/constants';
import { resolveSettings } from '../config/settings';
import type { Broadcaster, RoomSettings } from '../types';
import { GameError } from '../utils/errors';

/** Registry of all live rooms, which room each player is in, and reconnection grace timers. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly playerRoom = new Map<string, string>(); // playerId → room code
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly broadcaster: Broadcaster,
    private readonly words: WordService = new WordService(),
  ) {}

  createRoom(hostId: string, hostName: string, settings?: Partial<RoomSettings>): Room {
    // Validate everything BEFORE leaving the current room, so a bad request doesn't kick you out.
    const resolved = resolveSettings(settings, DEFAULT_SETTINGS);
    const host = new Player(hostId, Room.cleanName(hostName));
    this.leave(hostId);
    const room = new Room(this.generateCode(), host, resolved, this.broadcaster, this.words);
    this.rooms.set(room.code, room);
    this.playerRoom.set(hostId, room.code);
    return room;
  }

  joinRoom(rawCode: string, playerId: string, name: string): Room {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new GameError('ROOM_NOT_FOUND', 'Room not found — check the code');
    const prevCode = this.playerRoom.get(playerId);
    if (prevCode === code) return room; // already inside

    room.addPlayer(playerId, name); // may throw (full / bad name) — old room untouched in that case
    this.clearGrace(playerId);
    if (prevCode) this.detach(prevCode, playerId);
    this.playerRoom.set(playerId, code);
    return room;
  }

  /** Explicit leave, or grace-period expiry. Removes the player and cleans up empty rooms. */
  leave(playerId: string): Room | undefined {
    const code = this.playerRoom.get(playerId);
    this.clearGrace(playerId);
    if (!code) return undefined;
    this.playerRoom.delete(playerId);
    return this.detach(code, playerId);
  }

  private detach(code: string, playerId: string): Room | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    room.removePlayer(playerId);
    if (room.isEmpty) {
      room.destroy();
      this.rooms.delete(code);
    }
    return room;
  }

  // ───────────── Disconnect / reconnect ─────────────

  /**
   * Socket dropped: keep the seat for RECONNECT_GRACE_MS, then evict.
   * Returns false if the player wasn't in a room (caller can discard their session immediately).
   */
  handleDisconnect(playerId: string, onEvicted?: () => void): boolean {
    const room = this.getRoomByPlayer(playerId);
    if (!room) return false;
    this.clearGrace(playerId);
    room.setConnected(playerId, false);
    this.graceTimers.set(
      playerId,
      setTimeout(() => {
        this.graceTimers.delete(playerId);
        this.leave(playerId);
        onEvicted?.();
      }, RECONNECT_GRACE_MS),
    );
    return true;
  }

  /** Socket (re)connected with a known session. Returns the room they should be put back in. */
  handleReconnect(playerId: string): Room | undefined {
    const room = this.getRoomByPlayer(playerId);
    if (!room) return undefined;
    this.clearGrace(playerId);
    room.setConnected(playerId, true);
    return room;
  }

  private clearGrace(playerId: string): void {
    const t = this.graceTimers.get(playerId);
    if (t) clearTimeout(t);
    this.graceTimers.delete(playerId);
  }

  // ───────────── Queries ─────────────
  getRoom(code: string): Room | undefined { return this.rooms.get(code.toUpperCase()); }
  getRoomByPlayer(playerId: string): Room | undefined {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  /** Public rooms a stranger could join right now: not private, still in the lobby, not full, someone online. */
  private eligiblePublicRooms(excludePlayerId?: string): Room[] {
    const own = excludePlayerId ? this.playerRoom.get(excludePlayerId) : undefined;
    return [...this.rooms.values()].filter(
      (r) =>
        r.code !== own &&
        !r.settings.isPrivate &&
        r.phase === 'lobby' &&
        r.playerCount < r.settings.maxPlayers &&
        r.connectedCount > 0,
    );
  }

  /** Uniformly random eligible public room, or undefined. The caller's own room is never returned. */
  findRandomPublicRoom(excludePlayerId?: string): Room | undefined {
    const candidates = this.eligiblePublicRooms(excludePlayerId);
    return candidates.length ? candidates[randomInt(candidates.length)] : undefined;
  }

  listPublicRooms(): RoomSnapshot[] {
    return this.eligiblePublicRooms().map((r) => r.toSnapshot());
  }

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () =>
        ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
