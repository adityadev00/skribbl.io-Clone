import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { PORT } from './config/constants';
import { corsOrigin, isOriginAllowed } from './config/cors';
import { EVENTS } from './config/events';
import { RoomManager } from './services/RoomManager';
import { SessionStore } from './services/SessionStore';
import { SocketBroadcaster } from './services/SocketBroadcaster';
import { registerHandlers } from './handlers';

const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  // CORS headers don't stop a WebSocket upgrade from a disallowed site, so check Origin explicitly too.
  allowRequest: (req, cb) => cb(null, isOriginAllowed(req.headers.origin)),
});

const roomManager = new RoomManager(new SocketBroadcaster(io));
const sessions = new SessionStore();

io.on('connection', (socket) => {
  // Identity: client sends its secret token in the handshake (`io(url, { auth: { token } })`).
  // Known token → same player as before (reconnect). Unknown/missing → brand-new player + new token.
  const known = sessions.resolve(socket.handshake.auth?.token);
  const fresh = known ? undefined : sessions.create();
  const playerId = known ?? fresh!.playerId;

  // Every socket of a player joins a Socket.IO room named after the public playerId,
  // which is what Broadcaster.toPlayer() / toRoomExcept() target.
  socket.join(playerId);

  // Reconnect within the grace period → put the socket back in its room.
  const room = roomManager.handleReconnect(playerId);
  if (room) socket.join(room.code);

  // `inRoom` tells the client up-front whether a room_rejoined snapshot follows (no UI flash).
  socket.emit(EVENTS.SESSION, { playerId, token: fresh?.token, inRoom: !!room }); // token only when newly issued
  console.log(`[socket] connected ${socket.id} as ${playerId}${known ? ' (returning)' : ''}`);
  if (room) {
    socket.emit(EVENTS.ROOM_REJOINED, {
      playerId,
      room: room.toSnapshot(),
      state: room.currentGame?.getStateFor(playerId) ?? null,
    });
  }

  registerHandlers({ io, socket, playerId, rooms: roomManager, sessions });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected ${socket.id} (${reason})`);
    // Another tab/socket of the same player is still connected → nothing to do.
    if ((io.sockets.adapter.rooms.get(playerId)?.size ?? 0) > 0) return;
    const inRoom = roomManager.handleDisconnect(playerId, () => sessions.remove(playerId));
    if (!inRoom) sessions.remove(playerId);
  });
});

httpServer.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
