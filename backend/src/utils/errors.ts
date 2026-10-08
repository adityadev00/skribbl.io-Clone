/** Expected, user-facing failures. Socket handlers turn these into ack errors. */
export class GameError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'GameError';
  }
}
