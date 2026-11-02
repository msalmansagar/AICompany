/**
 * Canonical PCRM JSON form and SHA-256 content hash (ADR-20).
 * Byte-identical with the C# ContentHash / CanonicalNumber implementations.
 * Uses a custom tokenizer so raw number text is preserved — JSON.parse would
 * silently lose "1.50" vs "1.5", large integers, and duplicate keys.
 */

import { createHash } from 'node:crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

// IC-3: test/content-hash.test.ts holds these equal to contract/rule-engine-contract.json.
export const EXCLUDED_TOP_LEVEL: ReadonlySet<string> = new Set(['schemaVersion', 'ruleId', 'name', 'description']);
export const EXCLUDED_TOP_LEVEL_PREFIX = 'x-';
export const MAX_EXPONENT_MAGNITUDE = 1000;

// ── Token representation ──────────────────────────────────────────────────────

type JNull = { readonly kind: 'null' };
type JBool = { readonly kind: 'bool'; readonly value: boolean };
type JNumber = { readonly kind: 'number'; readonly raw: string };
type JString = { readonly kind: 'string'; readonly value: string };
type JArray = { readonly kind: 'array'; readonly items: JToken[] };
type JObject = {
  readonly kind: 'object';
  readonly members: ReadonlyArray<readonly [string, JToken]>;
};
type JToken = JNull | JBool | JNumber | JString | JArray | JObject;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the canonical form of a PCRM JSON document (ADR-20).
 * Byte-identical with the C# ContentHash.Canonicalize implementation.
 */
export function canonicalizePcrm(pcrmJson: string): string {
  const token = parseJson(pcrmJson);
  if (token.kind !== 'object') throw new Error('PCRM must be a JSON object.');
  return writeMembers(token.members.filter(([key]) => !isExcludedTopLevel(key)));
}

/** Compute the lower-case hex SHA-256 of the canonical PCRM form (ADR-20). */
export function computeContentHash(pcrmJson: string): string {
  return createHash('sha256').update(canonicalizePcrm(pcrmJson), 'utf8').digest('hex');
}

// ── Canonical writer ──────────────────────────────────────────────────────────

function writeToken(token: JToken): string {
  switch (token.kind) {
    case 'null':   return 'null';
    case 'bool':   return token.value ? 'true' : 'false';
    case 'number': return canonicalizeNumber(token.raw);
    case 'string': return writeString(token.value);
    case 'array':  return writeArray(token.items);
    case 'object': return writeMembers(token.members);
  }
}

/** Write an object from its members: nulls dropped, keys NFC and sorted by UTF-16 code unit. */
function writeMembers(members: ReadonlyArray<readonly [string, JToken]>): string {
  const entries = new Map<string, JToken>();
  for (const [rawKey, value] of members) {
    if (value.kind === 'null') continue;
    const key = rawKey.normalize('NFC');
    if (entries.has(key)) throw new Error(`Duplicate key '${key}' in PCRM.`);
    entries.set(key, value);
  }
  const sorted = [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const parts = sorted.map(([k, v]) => `${writeString(k)}:${writeToken(v)}`);
  return `{${parts.join(',')}}`;
}

function writeArray(items: readonly JToken[]): string {
  return `[${items.map((item) => writeToken(item)).join(',')}]`;
}

/** NFC-normalise, then escape only '"', '\' and U+0000–U+001F as lower-case \u00xx. */
function writeString(value: string): string {
  const nfc = value.normalize('NFC');
  const chars: string[] = ['"'];
  for (const ch of nfc) {
    const code = ch.codePointAt(0)!;
    if (ch === '"')      chars.push('\\"');
    else if (ch === '\\') chars.push('\\\\');
    else if (code < 0x20) chars.push('\\u00' + code.toString(16).padStart(2, '0'));
    else chars.push(ch);
  }
  chars.push('"');
  return chars.join('');
}

function isExcludedTopLevel(key: string): boolean {
  return EXCLUDED_TOP_LEVEL.has(key) || key.startsWith(EXCLUDED_TOP_LEVEL_PREFIX);
}

// ── Number canonicalization ───────────────────────────────────────────────────

/**
 * Rewrite a raw JSON number token as exact decimal text (no exponent, no trailing
 * fraction zeros, no leading zeros, -0 → 0). Throws when exponent > 1000.
 */
function canonicalizeNumber(raw: string): string {
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const { digits, pointPosition } = decomposeNumber(body, raw);
  const trimmed = digits.replace(/^0+/, '');
  const adjustedPos = pointPosition - (digits.length - trimmed.length);
  if (trimmed.length === 0) return '0';
  const text = placeDecimalPoint(trimmed, adjustedPos);
  return negative ? '-' + text : text;
}

function decomposeNumber(
  body: string,
  original: string,
): { digits: string; pointPosition: number } {
  const eIdx = body.search(/[eE]/);
  const exponent = eIdx >= 0 ? parseExponent(body.slice(eIdx + 1)) : 0;
  const mantissa = eIdx >= 0 ? body.slice(0, eIdx) : body;
  const dotIdx = mantissa.indexOf('.');
  const intPart = dotIdx >= 0 ? mantissa.slice(0, dotIdx) : mantissa;
  const fracPart = dotIdx >= 0 ? mantissa.slice(dotIdx + 1) : '';
  validateNumberParts(intPart, fracPart, dotIdx, original);
  return { digits: intPart + fracPart, pointPosition: intPart.length + exponent };
}

function validateNumberParts(
  intPart: string,
  fracPart: string,
  dotIdx: number,
  raw: string,
): void {
  if (intPart.length === 0 || !/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart))
    throw new Error(`'${raw}' is not a valid JSON number.`);
  if (dotIdx >= 0 && fracPart.length === 0)
    throw new Error(`'${raw}' is not a valid JSON number (trailing dot).`);
}

function parseExponent(text: string): number {
  let sign = 1;
  let rest = text;
  if (rest.startsWith('+') || rest.startsWith('-')) {
    sign = rest[0] === '-' ? -1 : 1;
    rest = rest.slice(1);
  }
  if (rest.length === 0 || !/^\d+$/.test(rest)) throw new Error('Invalid exponent.');
  if (rest.replace(/^0+/, '').length > 6) throw new Error('Exponent outside allowed range.');
  const value = parseInt(rest, 10);
  if (value > MAX_EXPONENT_MAGNITUDE) throw new Error('Exponent outside allowed range.');
  return sign * value;
}

function placeDecimalPoint(digits: string, pointPosition: number): string {
  let text: string;
  if (pointPosition <= 0) {
    text = '0.' + '0'.repeat(-pointPosition) + digits;
  } else if (pointPosition >= digits.length) {
    text = digits + '0'.repeat(pointPosition - digits.length);
  } else {
    text = digits.slice(0, pointPosition) + '.' + digits.slice(pointPosition);
  }
  if (!text.includes('.')) return text;
  const trimmed = text.replace(/0+$/, '');
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}

// ── JSON tokenizer ────────────────────────────────────────────────────────────

function parseJson(text: string): JToken {
  const tokenizer = new JsonTokenizer(text);
  const token = tokenizer.parseValue();
  tokenizer.expectEnd();
  return token;
}

class JsonTokenizer {
  private pos = 0;

  constructor(private readonly text: string) {}

  parseValue(): JToken {
    this.skipWs();
    const ch = this.peek();
    if (ch === '{') return this.parseObject();
    if (ch === '[') return this.parseArray();
    if (ch === '"') return { kind: 'string', value: this.parseString() };
    if (ch === 't') return this.parseLiteral('true', { kind: 'bool', value: true } as JBool);
    if (ch === 'f') return this.parseLiteral('false', { kind: 'bool', value: false } as JBool);
    if (ch === 'n') return this.parseLiteral('null', { kind: 'null' } as JNull);
    if (ch === '-' || (ch >= '0' && ch <= '9')) return this.parseNumber();
    throw new Error(`Unexpected character '${ch || '<end>'}' at position ${this.pos}.`);
  }

  expectEnd(): void {
    this.skipWs();
    if (this.pos !== this.text.length)
      throw new Error('Unexpected content after JSON value.');
  }

  private parseObject(): JObject {
    this.pos++;
    const members: Array<readonly [string, JToken]> = [];
    this.skipWs();
    if (this.peek() === '}') { this.pos++; return { kind: 'object', members }; }
    while (true) {
      this.skipWs();
      if (this.peek() !== '"') throw new Error(`Expected key string at ${this.pos}.`);
      const key = this.parseString();
      this.skipWs();
      if (this.peek() !== ':') throw new Error(`Expected ':' at ${this.pos}.`);
      this.pos++;
      const value = this.parseValue();
      members.push([key, value] as const);
      this.skipWs();
      const next = this.peek();
      if (next === '}') { this.pos++; return { kind: 'object', members }; }
      if (next !== ',') throw new Error(`Expected ',' or '}' at ${this.pos}.`);
      this.pos++;
    }
  }

  private parseArray(): JArray {
    this.pos++;
    const items: JToken[] = [];
    this.skipWs();
    if (this.peek() === ']') { this.pos++; return { kind: 'array', items }; }
    while (true) {
      items.push(this.parseValue());
      this.skipWs();
      const next = this.peek();
      if (next === ']') { this.pos++; return { kind: 'array', items }; }
      if (next !== ',') throw new Error(`Expected ',' or ']' at ${this.pos}.`);
      this.pos++;
    }
  }

  parseString(): string {
    this.pos++;
    let result = '';
    while (this.pos < this.text.length) {
      const ch = this.peek();
      if (ch === '"') { this.pos++; return result; }
      if (ch === '\\') { this.pos++; result += this.parseEscape(); }
      else { result += ch; this.pos++; }
    }
    throw new Error('Unterminated string literal.');
  }

  private parseEscape(): string {
    const ch = this.text.charAt(this.pos++);
    if (ch === '"' || ch === '\\' || ch === '/') return ch;
    if (ch === 'b') return '\b';
    if (ch === 'f') return '\f';
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    if (ch === 'u') return this.parseUnicodeEscape();
    throw new Error(`Invalid escape sequence '\\${ch}'.`);
  }

  private parseUnicodeEscape(): string {
    const hex = this.text.slice(this.pos, this.pos + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('Invalid \\u escape sequence.');
    this.pos += 4;
    return String.fromCharCode(parseInt(hex, 16));
  }

  private parseNumber(): JNumber {
    const start = this.pos;
    if (this.peek() === '-') this.pos++;
    // JSON forbids leading zeros ("007"); refuse them as the C# parser does.
    if (this.peek() === '0' && /d/.test(this.text.charAt(this.pos + 1)))
      throw new Error(`Leading zero in number at position ${this.pos}.`);
    this.consumeDigits();
    if (this.pos < this.text.length && this.peek() === '.') {
      this.pos++;
      this.consumeDigits();
    }
    if (this.pos < this.text.length && /[eE]/.test(this.peek())) {
      this.pos++;
      if (this.pos < this.text.length && /[+-]/.test(this.peek())) this.pos++;
      this.consumeDigits();
    }
    return { kind: 'number', raw: this.text.slice(start, this.pos) };
  }

  private consumeDigits(): void {
    if (this.pos >= this.text.length || !/\d/.test(this.peek()))
      throw new Error(`Expected digit at position ${this.pos}.`);
    while (this.pos < this.text.length && /\d/.test(this.peek())) this.pos++;
  }

  private parseLiteral<T extends JToken>(literal: string, token: T): T {
    if (this.text.slice(this.pos, this.pos + literal.length) !== literal)
      throw new Error(`Expected '${literal}' at position ${this.pos}.`);
    this.pos += literal.length;
    return token;
  }

  private peek(): string {
    return this.text.charAt(this.pos);
  }

  private skipWs(): void {
    while (this.pos < this.text.length && /[ \t\r\n]/.test(this.peek())) this.pos++;
  }
}
