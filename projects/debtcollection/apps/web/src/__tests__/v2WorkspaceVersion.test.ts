import { describe, expect, it } from 'vitest';
import {
  VERSION_STORAGE_KEY, readUrlVersion, resolveWorkspaceVersion, rememberVersion, recallVersion,
} from '../v2/version/workspaceVersion.js';

/**
 * Which workspace opens, decided in one place.
 *
 * V1 is the protected default: nothing but an explicit, valid request for V2 may open V2, and
 * anything unrecognised, missing or unreadable must land on V1.
 */

/** A storage that behaves like the browser's, so persistence is tested rather than mocked away. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

/** A storage the browser has blocked — every access throws, as in a locked-down profile. */
const BLOCKED: Storage = {
  get length(): number { throw new Error('blocked'); },
  clear: () => { throw new Error('blocked'); },
  getItem: () => { throw new Error('blocked'); },
  key: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

describe('readUrlVersion', () => {
  it.each([
    ['?ui=v2', 'v2'],
    ['?ui=V2', 'v2'],
    ['?ui=v1', 'v1'],
    // Dynamics passes a web resource's parameters through the single supported `data` value.
    ['?data=ui%3Dv2', 'v2'],
    ['?data=ui%3Dv1%26other%3Dx', 'v1'],
    ['?cb=123&ui=v2', 'v2'],
  ])('reads %s as %s', (search, expected) => {
    expect(readUrlVersion(search)).toBe(expected);
  });

  it.each(['', '?ui=', '?ui=v3', '?ui=beta', '?data=nonsense', '?data=%E0%A4%A'])(
    'reads %j as no request', search => {
      expect(readUrlVersion(search)).toBeUndefined();
    });
});

describe('resolveWorkspaceVersion', () => {
  it('opens V1 when nothing asks for anything', () => {
    expect(resolveWorkspaceVersion({ search: '', storage: memoryStorage() })).toBe('v1');
  });

  it('opens what the URL asks for', () => {
    expect(resolveWorkspaceVersion({ search: '?ui=v2', storage: memoryStorage() })).toBe('v2');
  });

  it('prefers the URL over a saved preference', () => {
    const storage = memoryStorage({ [VERSION_STORAGE_KEY]: 'v2' });

    expect(resolveWorkspaceVersion({ search: '?ui=v1', storage })).toBe('v1');
  });

  it('opens the saved preference when the URL says nothing', () => {
    const storage = memoryStorage({ [VERSION_STORAGE_KEY]: 'v2' });

    expect(resolveWorkspaceVersion({ search: '', storage })).toBe('v2');
  });

  it('ignores an unrecognised saved value and opens V1', () => {
    const storage = memoryStorage({ [VERSION_STORAGE_KEY]: 'v9' });

    expect(resolveWorkspaceVersion({ search: '', storage })).toBe('v1');
  });

  it('opens V1 when storage is blocked and the URL says nothing', () => {
    expect(resolveWorkspaceVersion({ search: '', storage: BLOCKED })).toBe('v1');
  });

  it('opens V1 when there is no storage at all', () => {
    expect(resolveWorkspaceVersion({ search: '' })).toBe('v1');
  });
});

describe('remembering a choice', () => {
  it('is recalled after it is remembered', () => {
    const storage = memoryStorage();

    rememberVersion('v2', storage);

    expect(recallVersion(storage)).toBe('v2');
  });

  it('does not throw when storage is blocked', () => {
    expect(() => rememberVersion('v2', BLOCKED)).not.toThrow();
  });

  it('stores nothing but the version under its own key', () => {
    const storage = memoryStorage();

    rememberVersion('v1', storage);

    expect([storage.length, storage.getItem(VERSION_STORAGE_KEY)]).toEqual([1, 'v1']);
  });
});
