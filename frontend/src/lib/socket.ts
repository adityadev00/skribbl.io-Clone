import { io, type Socket } from 'socket.io-client';
import { EVENTS } from './events';
import { getToken, saveToken } from './session';
import type { AckResponse, SessionPayload } from '../types/game';

const configured = import.meta.env.VITE_SERVER_URL?.trim().replace(/\/+$/, '');
export const SERVER_URL = configured || 'http://localhost:3001';
/** Production build that still points at localhost / the placeholder → show a clear message instead of "connecting…" forever. */
export const SERVER_URL_MISSING = import.meta.env.PROD && (!configured || configured.includes('your-backend'));

/**
 * App-wide singleton. `auth` is a function, so the CURRENT token is read on every (re)connect —
 * that is what lets a refreshed tab or a reconnecting socket get its old seat back.
 * autoConnect is off: GameProvider registers its listeners first, then calls connect().
 */
export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  auth: (cb) => cb({ token: getToken() }),
});

// The server only sends `token` when it just issued a new one (first visit, or old token expired).
socket.on(EVENTS.SESSION, (p: SessionPayload) => {
  if (p.token) saveToken(p.token);
});

export class SocketError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SocketError';
  }
}

/** Promise wrapper around emit-with-ack. Rejects with SocketError (server errors keep their `code`). */
export function emitAck<T = unknown>(event: string, payload?: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!socket.connected) {
      reject(new SocketError('OFFLINE', 'Not connected to the server yet — try again in a moment'));
      return;
    }
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: AckResponse<T>) => {
      if (err) return reject(new SocketError('TIMEOUT', 'The server took too long to answer'));
      if (res.ok) return resolve(res.data);
      reject(new SocketError(res.error.code, res.error.message));
    });
  });
}

/** Fire-and-forget (drawing events). */
export function emitFast(event: string, payload?: unknown): void {
  if (socket.connected) socket.emit(event, payload);
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : 'Something went wrong';
