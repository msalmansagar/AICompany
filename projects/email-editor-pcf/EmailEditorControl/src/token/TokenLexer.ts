/**
 * TokenLexer.ts
 * Converts a raw template string into a flat token stream.
 * No eval, no Function constructor — pure character scanning.
 */

export type LexTokenKind =
  | 'TEXT'
  | 'OPEN_MUSTACHE'    // {{
  | 'CLOSE_MUSTACHE'   // }}
  | 'BLOCK_EACH'       // {{#each
  | 'BLOCK_IF'         // {{#if
  | 'BLOCK_ELSE'       // {{else}}
  | 'BLOCK_END_EACH'   // {{/each}}
  | 'BLOCK_END_IF'     // {{/if}}
  | 'PIPE'             // |
  | 'IDENTIFIER'       // word characters
  | 'DOT'              // .
  | 'STRING_LITERAL'   // "..." or '...'
  | 'NUMBER_LITERAL'   // 42, 3.14
  | 'BOOL_LITERAL'     // true | false
  | 'NULL_LITERAL'     // null
  | 'COMPARE_OP'       // == != > >= < <=
  | 'COLON'            // :
  | 'EOF';

export interface LexToken {
  readonly kind: LexTokenKind;
  readonly value: string;
  readonly position: number;
}

export class TokenLexer {
  public lex(source: string): readonly LexToken[] {
    const tokens: LexToken[] = [];
    let pos = 0;

    while (pos < source.length) {
      // Block tags must be matched before generic {{
      if (this.matchesAt(source, pos, '{{#each')) {
        tokens.push({ kind: 'BLOCK_EACH', value: '{{#each', position: pos });
        pos += 7;
      } else if (this.matchesAt(source, pos, '{{#if')) {
        tokens.push({ kind: 'BLOCK_IF', value: '{{#if', position: pos });
        pos += 5;
      } else if (this.matchesAt(source, pos, '{{else}}')) {
        tokens.push({ kind: 'BLOCK_ELSE', value: '{{else}}', position: pos });
        pos += 8;
      } else if (this.matchesAt(source, pos, '{{/each}}')) {
        tokens.push({ kind: 'BLOCK_END_EACH', value: '{{/each}}', position: pos });
        pos += 9;
      } else if (this.matchesAt(source, pos, '{{/if}}')) {
        tokens.push({ kind: 'BLOCK_END_IF', value: '{{/if}}', position: pos });
        pos += 7;
      } else if (this.matchesAt(source, pos, '{{')) {
        tokens.push({ kind: 'OPEN_MUSTACHE', value: '{{', position: pos });
        pos += 2;
      } else if (this.matchesAt(source, pos, '}}')) {
        tokens.push({ kind: 'CLOSE_MUSTACHE', value: '}}', position: pos });
        pos += 2;
      } else if (source[pos] === '|') {
        tokens.push({ kind: 'PIPE', value: '|', position: pos });
        pos += 1;
      } else if (source[pos] === '.') {
        tokens.push({ kind: 'DOT', value: '.', position: pos });
        pos += 1;
      } else if (source[pos] === ':') {
        tokens.push({ kind: 'COLON', value: ':', position: pos });
        pos += 1;
      } else if (this.isCompareOpStart(source, pos)) {
        const { value, length } = this.readCompareOp(source, pos);
        tokens.push({ kind: 'COMPARE_OP', value, position: pos });
        pos += length;
      } else if (source[pos] === '"' || source[pos] === "'") {
        const { value, length } = this.readStringLiteral(source, pos);
        tokens.push({ kind: 'STRING_LITERAL', value, position: pos });
        pos += length;
      } else if (this.isDigit(source[pos]) || (source[pos] === '-' && this.isDigit(source[pos + 1] ?? ''))) {
        const { value, length } = this.readNumber(source, pos);
        tokens.push({ kind: 'NUMBER_LITERAL', value, position: pos });
        pos += length;
      } else if (this.isIdentStart(source[pos])) {
        const { value, length } = this.readIdentifier(source, pos);
        const kind = this.classifyIdentifier(value);
        tokens.push({ kind, value, position: pos });
        pos += length;
      } else {
        // Accumulate plain text until we hit {{ or end
        const start = pos;
        while (pos < source.length && !this.matchesAt(source, pos, '{{')) {
          pos += 1;
        }
        if (pos > start) {
          tokens.push({ kind: 'TEXT', value: source.slice(start, pos), position: start });
        }
      }
    }

    tokens.push({ kind: 'EOF', value: '', position: pos });
    return tokens;
  }

  private matchesAt(source: string, pos: number, needle: string): boolean {
    return source.startsWith(needle, pos);
  }

  private isIdentStart(ch: string): boolean {
    return /[a-zA-Z_]/.test(ch);
  }

  private isDigit(ch: string): boolean {
    return /[0-9]/.test(ch);
  }

  private isCompareOpStart(source: string, pos: number): boolean {
    const ch = source[pos];
    return ch === '=' || ch === '!' || ch === '<' || ch === '>';
  }

  private readCompareOp(source: string, pos: number): { value: string; length: number } {
    const twoChar = source.slice(pos, pos + 2);
    if (twoChar === '==' || twoChar === '!=' || twoChar === '>=' || twoChar === '<=') {
      return { value: twoChar, length: 2 };
    }
    return { value: source[pos], length: 1 };
  }

  private readStringLiteral(source: string, pos: number): { value: string; length: number } {
    const quote = source[pos];
    let i = pos + 1;
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') i += 1; // skip escaped char
      i += 1;
    }
    const raw = source.slice(pos + 1, i);
    return { value: raw, length: i - pos + 1 };
  }

  private readNumber(source: string, pos: number): { value: string; length: number } {
    let i = pos;
    if (source[i] === '-') i += 1;
    while (i < source.length && (this.isDigit(source[i]) || source[i] === '.')) {
      i += 1;
    }
    return { value: source.slice(pos, i), length: i - pos };
  }

  private readIdentifier(source: string, pos: number): { value: string; length: number } {
    let i = pos;
    while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
      i += 1;
    }
    return { value: source.slice(pos, i), length: i - pos };
  }

  private classifyIdentifier(value: string): LexTokenKind {
    if (value === 'true' || value === 'false') return 'BOOL_LITERAL';
    if (value === 'null') return 'NULL_LITERAL';
    return 'IDENTIFIER';
  }
}
