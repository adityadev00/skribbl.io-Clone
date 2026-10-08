import type { Server } from 'socket.io';
import type { Broadcaster } from '../types';

/** Socket.IO implementation of Broadcaster. Every socket auto-joins a room named after its id. */
export class SocketBroadcaster implements Broadcaster {
  constructor(private readonly io: Server) {}

  toRoom(roomCode: string, event: string, payload?: unknown): void {
    this.io.to(roomCode).emit(event, payload);
  }

  toRoomExcept(roomCode: string, exceptId: string, event: string, payload?: unknown): void {
    this.io.to(roomCode).except(exceptId).emit(event, payload);
  }

  toPlayer(playerId: string, event: string, payload?: unknown): void {
    this.io.to(playerId).emit(event, payload);
  }
}
