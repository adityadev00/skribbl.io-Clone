import { Game } from './Game';
import { Player } from './Player';
import type { WordService } from '../services/WordService';
import { EVENTS } from '../config/events';
import { MAX_NAME_LENGTH, MIN_PLAYERS_TO_START } from '../config/constants';
import { resolveSettings } from '../config/settings';
import type { Broadcaster, GamePhase, PublicPlayer, RoomSettings } from '../types';
import { GameError } from '../utils/errors';

export interface RoomSnapshot {
  code: string;
  hostId: string;
  settings: RoomSettings;
  phase: GamePhase;
  players: PublicPlayer[];
}

/**
 * A lobby + its (optional) running Game. Owns membership, host rights and settings,
 * and is the only class Game uses to talk to clients.
 */
export class Room {
  private readonly players = new Map<string, Player>();
  private hostId: string;
  private game: Game | null = null;

  constructor(
    public readonly code: string,
    host: Player,
    private _settings: RoomSettings,
    private readonly broadcaster: Broadcaster,
    private readonly words: WordService,
  ) {
    host.isHost = true;
    this.hostId = host.id;
    this.players.set(host.id, host);
  }

  // ───────────── Accessors ─────────────
  get settings(): RoomSettings { return this._settings; }
  get playerCount(): number { return this.players.size; }
  get connectedCount(): number { return this.getConnectedPlayers().length; }
  get isEmpty(): boolean { return this.players.size === 0; }
  get phase(): GamePhase { return this.game?.phase ?? 'lobby'; }
  get currentGame(): Game | null { return this.game; }
  getPlayer(id: string): Player | undefined { return this.players.get(id); }
  getPlayers(): Player[] { return [...this.players.values()]; }
  getConnectedPlayers(): Player[] { return this.getPlayers().filter((p) => p.isConnected); }

  getPublicPlayers(drawerId: string | null = this.game?.currentDrawerId ?? null): PublicPlayer[] {
    return this.getPlayers().map((p) => p.toPublic(drawerId));
  }

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      hostId: this.hostId,
      settings: this._settings,
      phase: this.phase,
      players: this.getPublicPlayers(),
    };
  }

  // ───────────── Messaging ─────────────
  broadcast(event: string, payload?: unknown): void {
    this.broadcaster.toRoom(this.code, event, payload);
  }
  broadcastExcept(exceptId: string, event: string, payload?: unknown): void {
    this.broadcaster.toRoomExcept(this.code, exceptId, event, payload);
  }
  sendTo(playerId: string, event: string, payload?: unknown): void {
    this.broadcaster.toPlayer(playerId, event, payload);
  }

  // ───────────── Membership ─────────────
  addPlayer(id: string, rawName: string): Player {
    if (this.players.size >= this._settings.maxPlayers) {
      throw new GameError('ROOM_FULL', 'This room is full');
    }
    const player = new Player(id, Room.cleanName(rawName));
    this.players.set(id, player);
    this.broadcast(EVENTS.PLAYER_JOINED, { player: player.toPublic(), players: this.getPublicPlayers() });
    return player;
  }

  removePlayer(id: string): void {
    if (!this.players.delete(id)) return;
    if (this.players.size === 0) return;

    if (id === this.hostId) {
      const all = this.getPlayers();
      const next = all.find((p) => p.isConnected) ?? all[0]; // prefer someone who is online
      next.isHost = true;
      this.hostId = next.id;
    }
    this.broadcast(EVENTS.PLAYER_LEFT, { playerId: id, hostId: this.hostId, players: this.getPublicPlayers() });
    this.game?.handlePlayerGone(id);
  }

  /** Mark a player online/offline without removing them (reconnection grace period). */
  setConnected(id: string, connected: boolean): void {
    const player = this.players.get(id);
    if (!player || player.isConnected === connected) return;
    player.isConnected = connected;
    this.broadcast(EVENTS.PLAYERS_UPDATE, { players: this.getPublicPlayers() });
    if (!connected) this.game?.handlePlayerGone(id);
  }

  static cleanName(raw: string): string {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
    if (!name) throw new GameError('INVALID_NAME', 'Please enter a name');
    return name;
  }

  // ───────────── Host actions ─────────────
  private assertHost(requesterId: string): void {
    if (requesterId !== this.hostId) throw new GameError('NOT_HOST', 'Only the host can do that');
  }

  private get gameInProgress(): boolean {
    return this.game !== null && this.game.phase !== 'game_over';
  }

  updateSettings(requesterId: string, patch: Partial<RoomSettings>): void {
    this.assertHost(requesterId);
    if (this.gameInProgress) throw new GameError('GAME_IN_PROGRESS', 'Settings are locked during a game');
    const next = resolveSettings(patch, this._settings);
    if (next.maxPlayers < this.players.size) {
      throw new GameError('INVALID_SETTINGS', 'Max players cannot be lower than the current player count');
    }
    this._settings = next;
    this.broadcast(EVENTS.ROOM_UPDATED, this.toSnapshot());
  }

  startGame(requesterId: string): void {
    this.assertHost(requesterId);
    if (this.gameInProgress) throw new GameError('GAME_IN_PROGRESS', 'Game already started');
    if (this.connectedCount < MIN_PLAYERS_TO_START) {
      throw new GameError('NOT_ENOUGH_PLAYERS', `Need at least ${MIN_PLAYERS_TO_START} players to start`);
    }
    this.game?.destroy();
    this.game = new Game(this, this.words);
    this.game.start();
  }

  destroy(): void {
    this.game?.destroy();
    this.game = null;
  }
}
