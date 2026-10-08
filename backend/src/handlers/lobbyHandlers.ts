import { EVENTS } from '../config/events';
import { Room } from '../models/Room';
import type { RoomSettings } from '../types';
import { GameError } from '../utils/errors';
import { on, requireRoom, type HandlerContext } from './context';

export function registerLobbyHandlers(ctx: HandlerContext): void {
  const { socket, rooms, playerId } = ctx;

  // Move the underlying socket between Socket.IO rooms when the player changes game rooms.
  const syncSocketRoom = (prevCode: string | undefined, nextCode: string) => {
    if (prevCode && prevCode !== nextCode) socket.leave(prevCode);
    socket.join(nextCode);
  };

  // Late joiners get a full snapshot (canvas strokes, hint, timer) in the ack.
  const joinPayload = (room: Room) => ({
    playerId,
    room: room.toSnapshot(),
    state: room.currentGame?.getStateFor(playerId) ?? null,
  });

  const joinAndSync = (code: string, playerName: string) => {
    const prev = rooms.getRoomByPlayer(playerId)?.code;
    const room = rooms.joinRoom(code, playerId, playerName);
    syncSocketRoom(prev, room.code);
    return joinPayload(room);
  };

  on<{ hostName?: string; settings?: Partial<RoomSettings> }>(ctx, EVENTS.CREATE_ROOM, (p) => {
    const prev = rooms.getRoomByPlayer(playerId)?.code;
    const room = rooms.createRoom(playerId, p.hostName as string, p.settings);
    syncSocketRoom(prev, room.code);
    return { playerId, room: room.toSnapshot() };
  });

  // Payload per spec is { roomId, playerName }; `code` is accepted as an alias.
  on<{ roomId?: string; code?: string; playerName?: string }>(ctx, EVENTS.JOIN_ROOM, (p) => {
    const code = p.roomId ?? p.code;
    if (typeof code !== 'string') throw new GameError('INVALID_CODE', 'Enter a room code');
    return joinAndSync(code, p.playerName as string);
  });

  // Join a random open public lobby. No match → `room:error` event (and an error ack for promise-based callers).
  on<{ playerName?: string }>(ctx, EVENTS.JOIN_RANDOM_ROOM, (p) => {
    Room.cleanName(p.playerName as string); // validate the name first, so a bad name isn't reported as "no rooms"
    const target = rooms.findRandomPublicRoom(playerId);
    if (!target) {
      const error = { code: 'NO_ROOMS_AVAILABLE', message: 'No rooms are currently available' };
      socket.emit(EVENTS.ROOM_ERROR, error);
      throw new GameError(error.code, error.message);
    }
    return joinAndSync(target.code, p.playerName as string);
  });

  on<Partial<RoomSettings>>(ctx, EVENTS.UPDATE_SETTINGS, (patch) => {
    const room = requireRoom(ctx);
    room.updateSettings(playerId, patch);
    return { room: room.toSnapshot() };
  });

  on(ctx, EVENTS.START_GAME, () => {
    requireRoom(ctx).startGame(playerId);
  });

  on(ctx, EVENTS.LEAVE_ROOM, () => {
    const room = rooms.leave(playerId);
    if (room) socket.leave(room.code);
  });

  on(ctx, EVENTS.LIST_ROOMS, () => ({ rooms: rooms.listPublicRooms() }));
}
