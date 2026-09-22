/**
 * The identity of one intended communication.
 *
 * Bulk safety rests entirely on this file. WP3 proved against `org5869857f` that both `fax` and
 * `email` accept a client-chosen primary key with `If-None-Match: *`, that a repeat is refused, and
 * that the refused repeat does **not** overwrite. Given that, every failure mode the authorisation
 * lists stops being a procedure to get right and becomes a property of the id:
 *
 * | Scenario | Why it is safe |
 * |---|---|
 * | Initiation double-clicked | same run, same recipient, same channel → same id → refused |
 * | Request retried after an uncertain response | same id → refused, reported as already sent |
 * | Batch interrupted and resumed | done recipients return `created: false` and are skipped |
 * | The same customer appears twice in the population | same id → one record |
 * | A batch partly failed | only the missing recipients have no record; a resume creates exactly those |
 * | A different run over the same population | different run id → different ids → a new campaign |
 * | SMS **and** Email to one recipient | channel is in the id → two different records |
 *
 * None of that depends on a disabled button, a lock, or the browser staying open.
 *
 * **UUIDv5, not a random id and not a hash truncation.** The id must be reproducible from the same
 * three inputs on any machine, in any session, months apart — that is what makes a resume find the
 * work it already did. RFC 4122 §4.3, SHA-1 over a namespace.
 *
 * SHA-1 is written out here rather than taken from `node:crypto` or a package, for two reasons.
 * `@dcp/domain` **runs in the browser** and must import nothing from `node:` (KI-63); and this
 * algorithm must never change behaviour, because altering a byte order would silently re-identify
 * every communication ever planned and make a resume re-send work it had already done.
 */

import type { CommunicationChannel } from './communication.js';

/**
 * The DCP communication namespace.
 *
 * A fixed, arbitrary UUID, so that ids minted here cannot collide with UUIDv5 ids minted elsewhere
 * from the same strings. **It must never change** — see the note above about re-identification.
 */
export const COMMUNICATION_NAMESPACE = '6f9a1c2e-5b7d-4e3a-9c81-2d4f6a8b0c13';

/**
 * The id the native Fax or Email record will be created at.
 *
 * Channel is part of the identity because an SMS and an Email to the same customer in the same run
 * are two different communications, and must be two different records.
 */
export function communicationId(input: {
  runId: string;
  recipientId: string;
  channel: CommunicationChannel;
}): string {
  // Lower-cased so a recipient id differing only in case cannot produce two records for one
  // customer — Dataverse returns GUIDs in mixed case depending on the surface that produced them.
  const name = `${input.runId.toLowerCase()}|${input.recipientId.toLowerCase()}|${input.channel}`;
  return uuidV5(name, COMMUNICATION_NAMESPACE);
}

/**
 * The id for a single send an officer composed at a screen.
 *
 * Derived from the message itself, **never minted per click**. A composer that called
 * `crypto.randomUUID()` inside its Send handler produced a fresh id on every press, so a
 * double-click created two records — which Phase 7 runtime validation demonstrated on the live
 * organisation, two Email activities twenty-three seconds apart.
 *
 * Deriving it makes the protection structural rather than a disabled button, which is what
 * ADR-DCP-19 actually asks for: pressing Send twice sends the same id twice, the platform refuses
 * the second create, and the officer's second press is a no-op instead of a second message.
 *
 * The message is part of the name on purpose. Changing a word, a figure or the template produces a
 * different id, so an officer who edits and resends is sending something new — while an officer who
 * presses Send again on an unchanged message is not.
 */
export function singleSendId(input: {
  caseId: string;
  recipientId: string;
  channel: CommunicationChannel;
  subject: string;
  body: string;
}): string {
  const name = [
    'single',
    input.caseId.toLowerCase(),
    input.recipientId.toLowerCase(),
    input.channel,
    input.subject,
    input.body,
  ].join('|');
  return uuidV5(name, COMMUNICATION_NAMESPACE);
}

/** RFC 4122 §4.3 name-based UUID, SHA-1 variant. Browser-safe: no `node:`, no `Buffer`. */
export function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = parseUuid(namespace);
  const nameBytes = new TextEncoder().encode(name);

  const message = new Uint8Array(namespaceBytes.length + nameBytes.length);
  message.set(namespaceBytes, 0);
  message.set(nameBytes, namespaceBytes.length);

  const bytes = sha1(message).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32),
  ].join('-');
}

function parseUuid(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error(`"${uuid}" is not a UUID, so it cannot be a UUIDv5 namespace.`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * SHA-1 (FIPS 180-4), synchronous and dependency-free.
 *
 * `crypto.subtle.digest` is the browser's own implementation but it is **asynchronous**, and making
 * an id async would push a promise into every call site that needs one — including the bulk executor's
 * inner loop. Twenty-five lines of well-known arithmetic is the better trade, and it is pinned by
 * tests against the RFC's published vectors.
 */
function sha1(message: Uint8Array): Uint8Array {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

  // Pad: one 0x80 byte, zeroes, then the 64-bit big-endian bit length.
  const bitLength = message.length * 8;
  const withPadding = new Uint8Array((((message.length + 8) >> 6) + 1) << 6);
  withPadding.set(message, 0);
  withPadding[message.length] = 0x80;
  const view = new DataView(withPadding.buffer);
  view.setUint32(withPadding.length - 4, bitLength >>> 0, false);
  view.setUint32(withPadding.length - 8, Math.floor(bitLength / 0x100000000), false);

  const w = new Uint32Array(80);
  for (let offset = 0; offset < withPadding.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rotateLeft(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);

    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i++) {
      const { f, k } = round(i, b, c, d);
      const temp = (rotateLeft(a, 5) + f + e + k + w[i]!) >>> 0;
      e = d; d = c; c = rotateLeft(b, 30); b = a; a = temp;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0; h[4] = (h[4]! + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const out = new DataView(digest.buffer);
  h.forEach((value, index) => out.setUint32(index * 4, value, false));
  return digest;
}

function round(i: number, b: number, c: number, d: number): { f: number; k: number } {
  if (i < 20) return { f: (b & c) | (~b & d), k: 0x5a827999 };
  if (i < 40) return { f: b ^ c ^ d, k: 0x6ed9eba1 };
  if (i < 60) return { f: (b & c) | (b & d) | (c & d), k: 0x8f1bbcdc };
  return { f: b ^ c ^ d, k: 0xca62c1d6 };
}

const rotateLeft = (value: number, by: number): number => ((value << by) | (value >>> (32 - by))) >>> 0;
