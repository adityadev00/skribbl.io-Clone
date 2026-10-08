import { randomBytes } from 'node:crypto';

/**
 * Maps a SECRET token (kept in the client's localStorage) to a PUBLIC playerId (shown to everyone).
 * Keeping them separate means other players can't hijack your seat by copying your id from a payload.
 */
export class SessionStore {
  private readonly tokenToPlayer = new Map<string, string>();
  private readonly playerToToken = new Map<string, string>();

  resolve(token: unknown): string | undefined {
    return typeof token === 'string' ? this.tokenToPlayer.get(token) : undefined;
  }

  create(): { playerId: string; token: string } {
    let playerId: string;
    do playerId = randomBytes(6).toString('hex'); while (this.playerToToken.has(playerId));
    const token = randomBytes(24).toString('hex');
    this.tokenToPlayer.set(token, playerId);
    this.playerToToken.set(playerId, token);
    return { playerId, token };
  }

  remove(playerId: string): void {
    const token = this.playerToToken.get(playerId);
    if (token) this.tokenToPlayer.delete(token);
    this.playerToToken.delete(playerId);
  }
}
