import { describe, it, expect } from 'vitest';
import { PerUserRateLimiter } from './PerUserRateLimiter.js';

describe('PerUserRateLimiter', () => {
  it('consume_UnderTheLimit_Allows', () => {
    const limiter = new PerUserRateLimiter(2, 'slow down');

    expect(() => { limiter.consume('u1', 0); limiter.consume('u1', 1); }).not.toThrow();
  });

  it('consume_OverTheLimit_ThrowsA429', () => {
    const limiter = new PerUserRateLimiter(2, 'slow down');
    limiter.consume('u1', 0);
    limiter.consume('u1', 1);

    expect(() => limiter.consume('u1', 2)).toThrow(expect.objectContaining({ statusCode: 429 }));
  });

  it('consume_OtherUser_HasItsOwnWindow', () => {
    const limiter = new PerUserRateLimiter(1, 'slow down');
    limiter.consume('u1', 0);

    expect(() => limiter.consume('u2', 0)).not.toThrow();
  });

  it('consume_AfterTheWindowPasses_AllowsAgain', () => {
    const limiter = new PerUserRateLimiter(1, 'slow down');
    limiter.consume('u1', 0);

    expect(() => limiter.consume('u1', 60_001)).not.toThrow();
  });
});
