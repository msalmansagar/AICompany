import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * "The record is not there" must not read as "the read failed".
 *
 * The distinction was already made for the transport, which answers 404. It was **not** made for
 * `Xrm.WebApi`, which rejects with a plain object carrying `errorCode` and no `status` — so the
 * 404 check never matched, and a case with no deceased review recorded told the officer "This
 * could not be read. [object Object]". Both shapes are asserted here because the workspace meets
 * both, and only one of them was ever exercised.
 */

/** `0x80040217`, exactly as the client API hands it over. */
const OBJECT_DOES_NOT_EXIST = 2147746327;

function adapterRejectingWith(rejection: unknown): XrmCrmAdapter {
  const xrm = {
    WebApi: {
      retrieveRecord: async () => { throw rejection; },
    },
  } as unknown as XrmLike;
  return new XrmCrmAdapter(xrm);
}

const read = (adapter: XrmCrmAdapter) =>
  adapter.retrieve({ entity: 'qdb_collectionactivities', id: 'missing' }, ['activityid']);

describe('a record that is not there', () => {
  it('reads as absent when the client API reports it, which carries no status', async () => {
    // The real rejection, read from the organisation: no `status`, and not an Error.
    const adapter = adapterRejectingWith({
      errorCode: OBJECT_DOES_NOT_EXIST,
      message: 'The requested record was not found.',
      code: '0x80040217',
    });

    await expect(read(adapter)).resolves.toBeNull();
  });

  it('reads as absent when the transport reports it as 404', async () => {
    const adapter = adapterRejectingWith({ status: 404, message: 'Not Found' });

    await expect(read(adapter)).resolves.toBeNull();
  });

  it('still fails loudly for a refusal, which is not an absence', async () => {
    // 403 means the record exists and may not be seen. Swallowing it would tell every officer
    // that nothing is there — the mistake WP10 exists to prevent.
    const adapter = adapterRejectingWith({ status: 403, message: 'Forbidden' });

    await expect(read(adapter)).rejects.toBeDefined();
  });
});

/**
 * No screen stringifies a rejection by hand.
 *
 * `error instanceof Error ? error.message : String(error)` produces `[object Object]` for every
 * `Xrm.WebApi` failure, because those rejections are not `Error`s. `describeFailure` exists for
 * this and is documented as the only permitted way — so the sweep enforces it rather than relying
 * on the next author having read that comment.
 */
describe('the banned stringification', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const SOURCE_ROOT = join(HERE, '..');
  const BANNED = /(\w+)\s+instanceof\s+Error\s*\?\s*\1\.message\s*:\s*String\(\s*\1\s*\)/;

  const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap(entry => {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full);
      return /\.tsx?$/.test(entry) ? [full] : [];
    });

  const files = sourceFiles(SOURCE_ROOT);

  it('sweeps the application source rather than silently finding nothing', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('would recognise the pattern it bans', () => {
    expect(BANNED.test('setError(failure instanceof Error ? failure.message : String(failure));'))
      .toBe(true);
  });

  it('appears nowhere outside the helper that replaced it', () => {
    const offenders = files.filter(file => {
      if (file.endsWith(join('platform', 'errors.ts'))) return false;
      return BANNED.test(readFileSync(file, 'utf8'));
    });

    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });
});
