import type { PublicPlayer } from '../types';

export class Player {
  score = 0;
  hasGuessed = false;
  isConnected = true;
  isHost: boolean;

  constructor(
    public readonly id: string, // socket.id
    public name: string,
    isHost = false,
  ) {
    this.isHost = isHost;
  }

  /** Called at the start of every turn. */
  resetTurnState(): void {
    this.hasGuessed = false;
  }

  /** Called when a new game starts in the same room. */
  resetForNewGame(): void {
    this.score = 0;
    this.hasGuessed = false;
  }

  addScore(points: number): void {
    this.score += points;
  }

  toPublic(drawerId: string | null = null): PublicPlayer {
    return {
      id: this.id,
      name: this.name,
      score: this.score,
      isHost: this.isHost,
      isDrawer: this.id === drawerId,
      hasGuessed: this.hasGuessed,
      isConnected: this.isConnected,
    };
  }
}
