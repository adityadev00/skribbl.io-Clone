/** Sliding-window limiter: at most `max` hits per `windowMs`. One instance per socket. */
export class RateLimiter {
  private hits: number[] = [];
  constructor(private readonly max: number, private readonly windowMs: number) {}

  allow(): boolean {
    const now = Date.now();
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}
