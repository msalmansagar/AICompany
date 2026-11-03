import { describe, expect, it } from 'vitest';
import { describeFailure, toError } from '../platform/errors.js';

/**
 * The `[object Object]` guard.
 *
 * A Collection Officer saw exactly that string, in red, where the communication history should have
 * been. The cause was `String(error)` on the plain object `Xrm.WebApi` rejects with — a fallback
 * that looks total and is not, repeated in ten places across the workspace.
 *
 * So the property under test is not "extracts the message nicely". It is that **no input produces
 * `[object Object]`**, including the inputs nobody predicted.
 */

describe('nothing produces [object Object]', () => {
  const inputs: [string, unknown][] = [
    ['a plain object with a message', { message: 'Could not find a property named x.' }],
    ['a Dataverse error envelope', { error: { message: 'Resource not found for the segment.' } }],
    ['an object with no message at all', { status: 404, headers: {} }],
    ['an empty object', {}],
    ['an array', [1, 2, 3]],
    ['null', null],
    ['undefined', undefined],
    ['a number', 500],
    ['a boolean', false],
    ['an object with a non-string message', { message: { nested: true } }],
    ['an object that throws on toString', { get toString() { throw new Error('nope'); } }],
  ];

  for (const [name, value] of inputs) {
    it(`survives ${name}`, () => {
      const described = describeFailure(value);
      expect(described).not.toContain('[object Object]');
      expect(described.trim().length, 'always says something').toBeGreaterThan(0);
    });
  }
});

describe('reading the message where there is one', () => {
  it('takes an Error message', () => {
    expect(describeFailure(new Error('the save failed'))).toBe('the save failed');
  });

  it('takes the top-level message the client API rejects with', () => {
    // This is the real shape. `Xrm.WebApi` does not reject with an Error, which is why the
    // instanceof fallback was reached on every CRM read failure in the browser.
    expect(describeFailure({ message: 'Could not find a property named x.' }))
      .toBe('Could not find a property named x.');
  });

  it('takes the nested message Dataverse returns', () => {
    expect(describeFailure({ error: { message: 'Resource not found.' } })).toBe('Resource not found.');
  });

  it('takes a string as itself', () => {
    expect(describeFailure('plain string failure')).toBe('plain string failure');
  });

  it('prefers the top-level message over the nested one', () => {
    expect(describeFailure({ message: 'outer', error: { message: 'inner' } })).toBe('outer');
  });

  it('falls back rather than returning an empty message', () => {
    expect(describeFailure(new Error('   ')).length).toBeGreaterThan(0);
    expect(describeFailure({ message: '' }).length).toBeGreaterThan(0);
  });
});

describe('turning a rejection into a real Error', () => {
  it('passes an Error through unchanged, keeping its identity', () => {
    const original = new Error('already an error');
    expect(toError(original)).toBe(original);
  });

  it('wraps anything else without losing the message', () => {
    expect(toError({ message: 'from the platform' }).message).toBe('from the platform');
  });

  it('never wraps [object Object]', () => {
    expect(toError({ status: 500 }).message).not.toContain('[object Object]');
  });
});
