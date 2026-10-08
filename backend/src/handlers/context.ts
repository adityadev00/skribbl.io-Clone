import type { Server, Socket } from 'socket.io';
import type { RoomManager } from '../services/RoomManager';
import type { SessionStore } from '../services/SessionStore';
import type { Room } from '../models/Room';
import type { Player } from '../models/Player';
import type { AckResponse } from '../types';
import { GameError } from '../utils/errors';

/** Everything a handler needs. `playerId` is the PUBLIC id of the player behind this socket. */
export interface HandlerContext {
  io: Server;
  socket: Socket;
  playerId: string;
  rooms: RoomManager;
  sessions: SessionStore;
}

/**
 * Registers a socket event with uniform validation/error handling:
 * - tolerates missing/non-object payloads
 * - GameError → { ok:false, error } via ack (if the client supplied one)
 * - unexpected errors are logged and never crash the process
 * Return value of `fn` is sent as `{ ok:true, data }`.
 */
export function on<P = Record<string, unknown>>(
  ctx: HandlerContext,
  event: string,
  fn: (payload: P) => unknown,
): void {
  ctx.socket.on(event, (payload: unknown, ack?: unknown) => {
    const cb = typeof ack === 'function' ? (ack as (r: AckResponse) => void) : undefined;
    try {
      const data = fn((payload && typeof payload === 'object' ? payload : {}) as P);
      cb?.({ ok: true, data });
    } catch (err) {
      if (err instanceof GameError) {
        cb?.({ ok: false, error: { code: err.code, message: err.message } });
      } else {
        console.error(`[handler:${event}]`, err);
        cb?.({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong' } });
      }
    }
  });
}

export function requireRoom(ctx: HandlerContext): Room {
  const room = ctx.rooms.getRoomByPlayer(ctx.playerId);
  if (!room) throw new GameError('NOT_IN_ROOM', 'You are not in a room');
  return room;
}

export function requirePlayer(ctx: HandlerContext, room: Room): Player {
  const player = room.getPlayer(ctx.playerId);
  if (!player) throw new GameError('NOT_IN_ROOM', 'You are not in this room');
  return player;
}
