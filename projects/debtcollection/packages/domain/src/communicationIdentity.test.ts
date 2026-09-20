import { describe, expect, it } from 'vitest';
import { COMMUNICATION_NAMESPACE, communicationId, uuidV5 } from './communicationIdentity.js';

/**
 * The identity that makes bulk communication safe.
 *
 * Two layers are tested for different reasons. The **algorithm** is pinned against RFC 4122's own
 * published vectors, because a hand-written SHA-1 that is subtly wrong would still be deterministic
 * — it would produce stable, consistent, incorrect ids, and every test about "same inputs, same id"
 * would pass while the implementation quietly diverged from the standard.
 *
 * The **properties** are then asserted as the authorisation states them, one test per failure mode,
 * so a future change that breaks one of them names the scenario it broke.
 */

/** The DNS namespace and expected output from RFC 4122 §A — the standard's own worked example. */
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('the UUIDv5 algorithm', () => {
  it('reproduces the vector published in RFC 4122 for "www.example.org"', () => {
    expect(uuidV5('www.example.org', DNS_NAMESPACE)).toBe('74738ff5-5367-5958-9aee-98fffdcd1876');
  });

  it('reproduces a second independent vector, so one lucky match cannot carry the test', () => {
    expect(uuidV5('python.org', DNS_NAMESPACE)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('stamps version 5 and the RFC 4122 variant into the right nibbles', () => {
    const id = uuidV5('anything', DNS_NAMESPACE);
    expect(id[14], 'version nibble').toBe('5');
    expect(['8', '9', 'a', 'b'], 'variant nibble').toContain(id[19]);
  });

  it('refuses a namespace that is not a UUID rather than hashing nonsense', () => {
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow(/is not a UUID/);
  });

  /**
   * Long names cross SHA-1's 64-byte block boundary, where a padding or length-encoding bug shows up
   * and nowhere else. Pinned to a value computed independently with Node's own `crypto`, because
   * asserting only the shape would pass against a broken implementation that was merely consistent.
   */
  it('matches the reference implementation for a name spanning several hash blocks', () => {
    expect(uuidV5('a'.repeat(500), DNS_NAMESPACE)).toBe('23d604e2-7664-5f66-afd0-33691bed5b76');
  });
});

describe('communication identity — the bulk safety properties', () => {
  const run = '11111111-1111-1111-1111-111111111111';
  const otherRun = '22222222-2222-2222-2222-222222222222';
  const recipient = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('gives the same id for the same run, recipient and channel', () => {
    expect(communicationId({ runId: run, recipientId: recipient, channel: 'SMS' }))
      .toBe(communicationId({ runId: run, recipientId: recipient, channel: 'SMS' }));
  });

  /** Double-click, retry after an uncertain response, and a repeated customer are all this test. */
  it('collapses a duplicated recipient in the population to one id', () => {
    const population = [recipient, recipient, recipient];
    const ids = new Set(population.map(id => communicationId({ runId: run, recipientId: id, channel: 'SMS' })));
    expect(ids.size).toBe(1);
  });

  it('gives a different id in a different run, so a re-send is a new campaign', () => {
    expect(communicationId({ runId: run, recipientId: recipient, channel: 'SMS' }))
      .not.toBe(communicationId({ runId: otherRun, recipientId: recipient, channel: 'SMS' }));
  });

  /** An SMS and an Email to one customer are two communications and must be two records. */
  it('gives a different id per channel for the same recipient in the same run', () => {
    const sms = communicationId({ runId: run, recipientId: recipient, channel: 'SMS' });
    const email = communicationId({ runId: run, recipientId: recipient, channel: 'Email' });
    const whatsApp = communicationId({ runId: run, recipientId: recipient, channel: 'WhatsApp' });
    expect(new Set([sms, email, whatsApp]).size).toBe(3);
  });

  it('gives a different id per recipient', () => {
    const first = communicationId({ runId: run, recipientId: recipient, channel: 'SMS' });
    const second = communicationId({ runId: run, recipientId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', channel: 'SMS' });
    expect(first).not.toBe(second);
  });

  /**
   * Dataverse returns GUIDs in mixed case depending on which surface produced them. Two casings of
   * one customer must not become two messages to that customer.
   */
  it('treats a recipient id as the same customer whatever its casing', () => {
    expect(communicationId({ runId: run, recipientId: recipient.toUpperCase(), channel: 'SMS' }))
      .toBe(communicationId({ runId: run, recipientId: recipient.toLowerCase(), channel: 'SMS' }));
  });

  /**
   * The namespace is load-bearing and must never move. If this test ever needs updating, every
   * communication ever planned has been re-identified and a resume would re-send it.
   */
  it('pins the namespace, because changing it re-identifies every communication ever planned', () => {
    expect(COMMUNICATION_NAMESPACE).toBe('6f9a1c2e-5b7d-4e3a-9c81-2d4f6a8b0c13');
  });

  it('produces an id the platform will accept as a primary key', () => {
    const id = communicationId({ runId: run, recipientId: recipient, channel: 'WhatsApp' });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
