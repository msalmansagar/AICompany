import { describe, it, expect } from 'vitest';
import { RbacError } from './RbacService.js';

// RED — failing tests (TDD mandate)

describe('RbacError', () => {
  it('should_carry_code_and_status_when_constructed', () => {
    const error = new RbacError('test_code', 'Test message', 400);
    expect(error.code).toBe('test_code');
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('RbacError');
  });

  it('should_be_instance_of_error', () => {
    const error = new RbacError('code', 'msg', 400);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof RbacError).toBe(true);
  });
});
