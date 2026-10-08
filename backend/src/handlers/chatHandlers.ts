import { EVENTS } from '../config/events';
import { MAX_CHAT_LENGTH } from '../config/constants';
import type { Room } from '../models/Room';
import type { Player } from '../models/Player';
import type { ChatMessagePayload } from '../types';
import { GameError } from '../utils/errors';
import { RateLimiter } from '../utils/RateLimiter';
import { on, requirePlayer, requireRoom, type HandlerContext } from './context';

/**
 * One pipeline for `guess` and `chat`. While a word is being drawn, EVERY message from a guesser is
 * treated as a guess, so the word can't be smuggled out via "chat". Rules:
 *  - correct guess  → text is NEVER broadcast; Game emits guess_result ("X guessed the word!") + scores
 *  - close guess    → shown to everyone as a normal guess, plus a private "is close!" to the sender
 *  - wrong guess    → shown to everyone
 *  - drawer / players who already guessed → delivered ONLY to drawer + guessed players
 *  - any other phase (lobby, choosing, round end, game over) → normal room chat
 */
function processMessage(ctx: HandlerContext, text: string): void {
  const room = requireRoom(ctx);
  const player = requirePlayer(ctx, room);
  const game = room.currentGame;

  if (game?.phase === 'drawing') {
    const result = game.handleGuess(player, text);
    switch (result.outcome) {
      case 'correct':
        return;
      case 'close':
        room.broadcast(EVENTS.CHAT_MESSAGE, msg(player, text, 'guess', 'all'));
        room.sendTo(player.id, EVENTS.CHAT_MESSAGE, msg(player, `"${text}" is close!`, 'close', 'private'));
        return;
      case 'incorrect':
        room.broadcast(EVENTS.CHAT_MESSAGE, msg(player, text, 'guess', 'all'));
        return;
      case 'not_allowed':
        sendToGuessedChannel(room, msg(player, text, 'chat', 'guessed'));
        return;
    }
  }
  room.broadcast(EVENTS.CHAT_MESSAGE, msg(player, text, 'chat', 'all'));
}

const msg = (
  p: Player, text: string, type: ChatMessagePayload['type'], channel: ChatMessagePayload['channel'],
): ChatMessagePayload => ({ playerId: p.id, playerName: p.name, text, type, channel });

function sendToGuessedChannel(room: Room, payload: ChatMessagePayload): void {
  const drawerId = room.currentGame?.currentDrawerId;
  room
    .getPlayers()
    .filter((p) => p.hasGuessed || p.id === drawerId)
    .forEach((p) => room.sendTo(p.id, EVENTS.CHAT_MESSAGE, payload));
}

export function registerChatHandlers(ctx: HandlerContext): void {
  const limiter = new RateLimiter(6, 3000); // 6 messages / 3s per socket

  const handle = (p: { text?: unknown }) => {
    if (typeof p.text !== 'string') throw new GameError('INVALID_MESSAGE', 'Message must be text');
    const text = p.text.trim().replace(/\s+/g, ' ').slice(0, MAX_CHAT_LENGTH);
    if (!text) return;
    if (!limiter.allow()) throw new GameError('RATE_LIMITED', 'Slow down a little');
    processMessage(ctx, text);
  };

  on<{ text?: unknown }>(ctx, EVENTS.GUESS, handle);
  on<{ text?: unknown }>(ctx, EVENTS.CHAT, handle);
}
