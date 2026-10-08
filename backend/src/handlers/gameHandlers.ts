import { EVENTS } from '../config/events';
import { GameError } from '../utils/errors';
import { on, requireRoom, type HandlerContext } from './context';

export function registerGameHandlers(ctx: HandlerContext): void {
  const { playerId } = ctx;

  // Drawer picks one of the offered words → server starts the timer & broadcasts game_state.
  on<{ word?: string }>(ctx, EVENTS.WORD_CHOSEN, (p) => {
    const game = requireRoom(ctx).currentGame;
    if (!game) throw new GameError('NO_GAME', 'No game in progress');
    if (typeof p.word !== 'string') throw new GameError('INVALID_WORD', 'Pick one of the offered words');
    game.chooseWord(playerId, p.word);
  });

  // Client-initiated resync (e.g. after a flaky connection or tab refocus).
  on(ctx, EVENTS.REQUEST_STATE, () => {
    const room = requireRoom(ctx);
    return { room: room.toSnapshot(), state: room.currentGame?.getStateFor(playerId) ?? null };
  });
}
