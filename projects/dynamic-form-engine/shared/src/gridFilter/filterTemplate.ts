// Parses a maker-authored depends-on filter template into an AST.
//
// The template is an OData-subset boolean expression:
//   conditions joined by `and` / `or`, grouped with parentheses, e.g.
//     _qdb_serviceref_value eq '{_qdb_serviceref_value}'
//       and ( _qdb_region_value eq '{_qdb_region_value}' or statuscode eq {statuscode} )
//
// Each condition's value comes from a {placeholder} token resolved against a values map
// (form-field values). Emitters drop a condition whose placeholder is empty and collapse
// empty logical groups, so the grid filters on whatever the user actually filled in.
//
// The template is trusted maker configuration (attribute names come from it); the values
// are user input and are always escaped by the emitter for its target dialect.
//
// Parsing lives here rather than in either consumer because the portal (FetchXML, server
// side) and the in-CRM engine (OData, browser side) must interpret one template identically.

export type ValueSpec =
  | { kind: 'string'; raw: string }
  | { kind: 'number'; text: string }
  | { kind: 'placeholder'; name: string }
  | { kind: 'null' };

export interface ConditionNode {
  type: 'cond';
  attribute: string;
  /**
   * Set when the template addresses a column on the RELATED table through a lookup, e.g.
   * `company/name like '%{search}%'`. A lookup attribute itself only ever compares by
   * GUID, so matching it by display text means reaching through to the related record —
   * a join in FetchXML, a navigation path in OData.
   */
  relatedAttribute?: string;
  operator: string;
  value: ValueSpec;
}

export interface LogicalNode {
  type: 'logical';
  operator: 'and' | 'or';
  children: FilterNode[];
}

export type FilterNode = ConditionNode | LogicalNode;

type TokenType =
  | 'lparen' | 'rparen' | 'bool' | 'op' | 'ident' | 'string' | 'number' | 'placeholder' | 'null'
  | 'slash';

interface Token {
  type: TokenType;
  value?: string;
}

const COMPARISON_OPERATORS = new Set(['eq', 'ne', 'lt', 'gt', 'le', 'ge', 'like']);

/** Longest value an emitter will substitute — guards against pathological input. */
export const MAX_VALUE_LENGTH = 200;

/** A value must match this to be usable where the template expects a bare number. */
export const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;

/** Parses the template into an AST. Throws when the template is malformed. */
export function parseFilterTemplate(template: string): FilterNode {
  return parse(tokenize(template));
}

/**
 * The lookup attributes a template reaches through (`company/name` → `company`).
 *
 * Emitting one of these needs metadata the emitters cannot fetch — the related table for
 * a join, or the navigation property for an OData path — so callers resolve it up front
 * and hand the result to the emitter, which stays synchronous.
 * Returns an empty array for a template that is malformed or uses no paths.
 */
export function collectLookupPathAttributes(template: string): string[] {
  if (!template || !template.trim()) return [];

  let ast: FilterNode;
  try {
    ast = parseFilterTemplate(template);
  } catch {
    return []; // the emitter reports the parse failure; nothing to pre-resolve
  }

  const attributes = new Set<string>();
  const walk = (node: FilterNode): void => {
    if (node.type === 'logical') { node.children.forEach(walk); return; }
    if (node.relatedAttribute) attributes.add(node.attribute);
  };
  walk(ast);
  return [...attributes];
}

/**
 * Substitutes every {placeholder} in a string literal.
 * Returns null when any referenced value is missing or empty — the caller drops the condition.
 */
export function substitutePlaceholders(raw: string, values: Record<string, string>): string | null {
  let isMissing = false;
  const substituted = raw.replace(/\{([^}]+)\}/g, (_match: string, name: string) => {
    const resolved = values[name.trim()];
    if (!resolved) { isMissing = true; return ''; }
    return resolved;
  });
  return isMissing ? null : substituted.slice(0, MAX_VALUE_LENGTH);
}

// ── Tokenizer ──────────────────────────────────────────────────

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) { index++; continue; }
    if (char === '(') { tokens.push({ type: 'lparen' }); index++; continue; }
    if (char === ')') { tokens.push({ type: 'rparen' }); index++; continue; }
    if (char === '/') { tokens.push({ type: 'slash' }); index++; continue; }
    if (char === "'") { index = readQuotedString(input, index, tokens); continue; }
    if (char === '{') { index = readPlaceholder(input, index, tokens); continue; }
    if (/^not-like/i.test(input.slice(index))) { tokens.push({ type: 'op', value: 'not-like' }); index += 8; continue; }

    const numberMatch = input.slice(index).match(/^-?\d+(?:\.\d+)?/);
    if (numberMatch && (char === '-' || /\d/.test(char))) {
      tokens.push({ type: 'number', value: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    const wordMatch = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (wordMatch) {
      tokens.push(classifyWord(wordMatch[0]));
      index += wordMatch[0].length;
      continue;
    }

    throw new Error(`unexpected character '${char}' at position ${index}`);
  }

  return tokens;
}

function readQuotedString(input: string, start: number, tokens: Token[]): number {
  const end = input.indexOf("'", start + 1);
  if (end === -1) throw new Error('unterminated string literal');
  tokens.push({ type: 'string', value: input.slice(start + 1, end) });
  return end + 1;
}

function readPlaceholder(input: string, start: number, tokens: Token[]): number {
  const end = input.indexOf('}', start + 1);
  if (end === -1) throw new Error('unterminated placeholder');
  tokens.push({ type: 'placeholder', value: input.slice(start + 1, end).trim() });
  return end + 1;
}

function classifyWord(word: string): Token {
  const lower = word.toLowerCase();
  if (lower === 'and' || lower === 'or') return { type: 'bool', value: lower };
  if (COMPARISON_OPERATORS.has(lower)) return { type: 'op', value: lower };
  if (lower === 'null') return { type: 'null' };
  return { type: 'ident', value: word };
}

// ── Parser (recursive descent) ─────────────────────────────────

function parse(tokens: Token[]): FilterNode {
  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const consume = (): Token | undefined => tokens[position++];
  const expect = (type: TokenType): Token => {
    const token = tokens[position];
    if (!token || token.type !== type) throw new Error(`expected ${type} at token ${position}`);
    position++;
    return token;
  };

  function parseOr(): FilterNode {
    const children = [parseAnd()];
    while (peek()?.type === 'bool' && peek()?.value === 'or') { consume(); children.push(parseAnd()); }
    return children.length === 1 ? children[0] : { type: 'logical', operator: 'or', children };
  }

  function parseAnd(): FilterNode {
    const children = [parseFactor()];
    while (peek()?.type === 'bool' && peek()?.value === 'and') { consume(); children.push(parseFactor()); }
    return children.length === 1 ? children[0] : { type: 'logical', operator: 'and', children };
  }

  function parseFactor(): FilterNode {
    if (peek()?.type === 'lparen') {
      consume();
      const expression = parseOr();
      expect('rparen');
      return expression;
    }
    return parseCondition();
  }

  function parseCondition(): ConditionNode {
    const attribute = expect('ident').value!;

    // `lookupAttribute/relatedColumn` reaches through the lookup to the related record.
    let relatedAttribute: string | undefined;
    if (peek()?.type === 'slash') {
      consume();
      relatedAttribute = expect('ident').value!;
    }

    const operator = expect('op').value!;
    return { type: 'cond', attribute, relatedAttribute, operator, value: parseValue(consume()) };
  }

  const ast = parseOr();
  if (position !== tokens.length) throw new Error('unexpected trailing tokens');
  return ast;
}

function parseValue(token: Token | undefined): ValueSpec {
  if (!token) throw new Error('expected a value');
  switch (token.type) {
    case 'string': return { kind: 'string', raw: token.value! };
    case 'number': return { kind: 'number', text: token.value! };
    case 'placeholder': return { kind: 'placeholder', name: token.value! };
    case 'null': return { kind: 'null' };
    default: throw new Error(`expected a value, got ${token.type}`);
  }
}
