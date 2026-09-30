import { RateLimitError } from './errors.js';

const WINDOW_MS = 60_000;

/**
 * A sliding one-minute window of calls per user, held in memory. Each backend instance counts
 * on its own, which bounds abuse per instance rather than exactly; that is enough to stop a
 * single session enumerating records through one route.
 */
export class PerUserRateLimiter {
  private readonly callsByUser = new Map<string, number[]>();

  constructor(private readonly limitPerMinute: number, private readonly message: string) {}

  /** Records a call for the user, or throws RateLimitError when the window is full. */
  consume(userKey: string, now: number = Date.now()): void {
    const recent = (this.callsByUser.get(userKey) ?? []).filter((at) => at > now - WINDOW_MS);
    if (recent.length >= this.limitPerMinute) throw new RateLimitError(this.message);
    this.callsByUser.set(userKey, [...recent, now]);
  }
}
