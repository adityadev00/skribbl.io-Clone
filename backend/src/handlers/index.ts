import type { HandlerContext } from './context';
import { registerLobbyHandlers } from './lobbyHandlers';
import { registerGameHandlers } from './gameHandlers';
import { registerDrawingHandlers } from './drawingHandlers';
import { registerChatHandlers } from './chatHandlers';

export function registerHandlers(ctx: HandlerContext): void {
  registerLobbyHandlers(ctx);
  registerGameHandlers(ctx);
  registerDrawingHandlers(ctx);
  registerChatHandlers(ctx);
}
