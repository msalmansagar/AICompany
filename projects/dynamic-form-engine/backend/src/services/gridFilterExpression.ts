// Compiles a maker-authored depends-on filter template into a FetchXML <filter> subtree.
//
// The template is an OData-subset boolean expression:
//   conditions joined by `and` / `or`, grouped with parentheses, e.g.
//     _qdb_serviceref_value eq '{_qdb_serviceref_value}'
//       and ( _qdb_region_value eq '{_qdb_region_value}' or statuscode eq {statuscode} )
//
// Each condition's value comes from a {placeholder} token resolved against a values map
// (form-field values). A condition that references a placeholder with an empty/missing
// value is dropped, and empty logical groups collapse — so the grid filters on whatever
// fields the user has actually filled in (graceful partial filtering).
//
// The template is trusted maker configuration (attribute names come from it); the values
// are user input and are always XML-escaped before emission.

import { logger } from '../utils/logger.js';

// ── AST + token types ──────────────────────────────────────────

type ValueSpec =
  | { kind: 'string'; raw: string }
  | { kind: 'number'; text: string }
  | { kind: 'placeholder'; name: string }
  | { kind: 'null' };

interface ConditionNode {
  type: 'cond';
  attribute: string;
  operator: string;
  value: ValueSpec;
}

interface LogicalNode {
  type: 'logical';
  operator: 'and' | 'or';
  children: FilterNode[];
}

type FilterNode = ConditionNode | LogicalNode;

type TokenType =
  | 'lparen' | 'rparen' | 'bool' | 'op' | 'ident' | 'string' | 'number' | 'placeholder' | 'null';

interface Token {
  type: TokenType;
  value?: string;
}

const COMPARISON_OPERATORS = new Set(['eq', 'ne', 'lt', 'gt', 'le', 'ge', 'like']);
const MAX_VALUE_LENGTH = 200;
const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;

// ── Public API ─────────────────────────────────────────────────

/**
 * Compiles the template into a FetchXML filter subtree, or returns '' when the
 * expression is empty after pruning (or cannot be parsed). Never throws.
 */
export function buildDependsOnFilter(
  template: string,
  values: Record<string, string>,
): string {
  if (!template || !template.trim()) return '';
  try {
    const tokens = tokenize(template);
    const ast = parse(tokens);
    return emit(ast, values);
  } catch (error) {
    logger.warn(
      { template, reason: error instanceof Error ? error.message : String(error) },
      'depends-on filter template could not be parsed — skipped',
    );
    return '';
  }
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
    const operator = expect('op').value!;
    return { type: 'cond', attribute, operator, value: parseValue(consume()) };
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

// ── Emitter ────────────────────────────────────────────────────

function emit(node: FilterNode, values: Record<string, string>): string {
  return node.type === 'cond'
    ? emitCondition(node, values)
    : emitLogical(node, values);
}

function emitLogical(node: LogicalNode, values: Record<string, string>): string {
  const parts = node.children.map((child) => emit(child, values)).filter((part) => part !== '');
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `<filter type="${node.operator}">${parts.join('')}</filter>`;
}

function emitCondition(node: ConditionNode, values: Record<string, string>): string {
  const attribute = resolveAttribute(node.attribute);

  if (node.value.kind === 'null') {
    const operator = node.operator === 'ne' ? 'not-null' : 'null';
    return `<condition attribute="${attribute}" operator="${operator}"/>`;
  }

  const resolved = resolveValue(node.value, values);
  if (resolved === null) return ''; // referenced placeholder empty/invalid → drop condition

  return `<condition attribute="${attribute}" operator="${node.operator}" value="${resolved}"/>`;
}

// Resolves a condition's value to an XML-escaped string, or null when a referenced
// placeholder is missing/empty (string) or resolves to a non-numeric value (numeric).
function resolveValue(value: ValueSpec, values: Record<string, string>): string | null {
  switch (value.kind) {
    case 'null':
      return null; // handled upstream by emitCondition; here for exhaustiveness
    case 'number':
      return value.text;
    case 'placeholder': {
      const raw = values[value.name];
      if (!raw || !NUMERIC_PATTERN.test(raw)) return null;
      return raw.slice(0, MAX_VALUE_LENGTH);
    }
    case 'string': {
      // Substitute every {placeholder}; a missing/empty one voids the condition.
      let missing = false;
      const substituted = value.raw.replace(/\{([^}]+)\}/g, (_match: string, name: string) => {
        const resolvedValue = values[name.trim()];
        if (!resolvedValue) { missing = true; return ''; }
        return resolvedValue;
      });
      if (missing) return null;
      return escapeXmlAttribute(substituted.slice(0, MAX_VALUE_LENGTH));
    }
  }
}

// Lookup nav-property form (_qdb_x_value) maps to the FetchXML attribute name (qdb_x).
function resolveAttribute(attribute: string): string {
  const navMatch = attribute.match(/^_(\w+)_value$/);
  return navMatch ? navMatch[1] : attribute;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
