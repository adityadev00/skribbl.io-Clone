import { EVENTS } from '../config/events';
import { on, requireRoom, type HandlerContext } from './context';

/**
 * Drawing events carry no ack (high frequency). All authorization (is this the drawer? is the phase
 * 'drawing'?) and sanitization (clamp to 0..1, validate colour/size) live in Game, so a spoofed
 * event from a non-drawer is silently ignored.
 */
export function registerDrawingHandlers(ctx: HandlerContext): void {
  const { playerId } = ctx;
  const game = () => requireRoom(ctx).currentGame;

  on<{ x: number; y: number; color: string; size: number }>(ctx, EVENTS.DRAW_START, (p) => {
    game()?.startStroke(playerId, p);
  });
  // Two accepted shapes: { x, y } (single point, legacy) and { points: [{x,y}, …] } (batched, one per frame).
  on<{ x: number; y: number; points?: unknown }>(ctx, EVENTS.DRAW_MOVE, (p) => {
    if (Array.isArray(p.points)) game()?.addPoints(playerId, p.points);
    else game()?.addPoint(playerId, p.x, p.y);
  });
  on<{ x: number; y: number; color: string }>(ctx, EVENTS.DRAW_FILL, (p) => {
    game()?.fill(playerId, p);
  });
  on(ctx, EVENTS.DRAW_END, () => game()?.endStroke(playerId));
  on(ctx, EVENTS.DRAW_UNDO, () => game()?.undo(playerId));
  on(ctx, EVENTS.CANVAS_CLEAR, () => game()?.clearCanvas(playerId));
}
