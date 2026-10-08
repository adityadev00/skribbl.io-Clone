import { useGame } from './useGame';
import { MIN_PLAYERS } from '../lib/constants';

/** Derived, lobby-friendly view of the current room. `room` is null when not in one. */
export function useRoom() {
  const { state } = useGame();
  const { room, playerId, game } = state;

  const players = room?.players ?? [];
  const me = players.find((p) => p.id === playerId);
  const isHost = !!room && room.hostId === playerId;
  const host = players.find((p) => p.id === room?.hostId);
  const onlineCount = players.filter((p) => p.isConnected).length;
  const canStart = isHost && onlineCount >= MIN_PLAYERS && (room?.phase === 'lobby' || room?.phase === 'game_over');

  return {
    room, game, playerId, players, me, isHost, host, onlineCount, canStart,
    inviteUrl: room ? `${window.location.origin}/room/${room.code}` : '',
  };
}
