/**
 * TokenParser.ts
 * Converts a flat LexToken stream (from TokenLexer) into a TemplateAst.
 * Hand-written recursive descent — no eval, no dynamic code.
 */

import { LexToken, LexTokenKind } from './TokenLexer';
import {
  AstNode,
  ComparisonOperator,
  EachNode,
  IfExpr,
  IfNode,
  ModifierKind,
  MustacheNode,
  ParseError,
  ParseResult,
  TemplateAst,
  TextNode
} from './TokenTypes';

const COMPARISON_OPERATORS: readonly string[] = ['==', '!=', '>=', '<=', '>', '<'];

export class TokenParser {
  private tokens: readonly LexToken[] = [];
  private pos = 0;
  private errors: ParseError[] = [];

  public parse(tokens: readonly LexToken[]): ParseResult {
    this.tokens = tokens;
    this.pos = 0;
    this.errors = [];

    const ast = this.parseTemplate('root');

    if (this.errors.length > 0) {
      return { ok: false, errors: this.errors };
    }
    return { ok: true, ast };
  }

  // ── Template (sequence of nodes until a stop token) ─────────────────────

  private parseTemplate(stopAt: 'root' | 'else' | 'each-end' | 'if-end'): TemplateAst {
    const nodes: AstNode[] = [];

    while (!this.isAtEnd()) {
      const current = this.peek();

      if (current.kind === 'EOF') break;
      if (stopAt === 'else' && current.kind === 'BLOCK_ELSE') break;
      if (stopAt === 'each-end' && current.kind === 'BLOCK_END_EACH') break;
      if (stopAt === 'if-end' &&
          (current.kind === 'BLOCK_END_IF' || current.kind === 'BLOCK_ELSE')) break;

      if (current.kind === 'TEXT') {
        nodes.push(this.parseText());
      } else if (current.kind === 'BLOCK_EACH') {
        nodes.push(this.parseEach());
      } else if (current.kind === 'BLOCK_IF') {
        nodes.push(this.parseIf());
      } else if (current.kind === 'OPEN_MUSTACHE') {
        nodes.push(this.parseMustache());
      } else if (
        current.kind === 'BLOCK_END_EACH' ||
        current.kind === 'BLOCK_END_IF' ||
        current.kind === 'BLOCK_ELSE'
      ) {
        // Unexpected end/else tag — report and skip
        this.addError(`Unexpected ${current.kind} at position ${current.position}`, current.position);
        this.advance();
      } else {
        // Skip whitespace-only tokens that leaked past text accumulation
        this.advance();
      }
    }

    return nodes;
  }

  // ── Text node ────────────────────────────────────────────────────────────

  private parseText(): TextNode {
    const token = this.consume('TEXT');
    return { type: 'text', value: token.value };
  }

  // ── Mustache: {{ path modifier* }} ───────────────────────────────────────

  private parseMustache(): MustacheNode {
    this.consume('OPEN_MUSTACHE');

    const path = this.parsePath();
    const modifiers: ModifierKind[] = [];

    while (this.peek().kind === 'PIPE') {
      this.consume('PIPE');
      const mod = this.parseModifier();
      if (mod) modifiers.push(mod);
    }

    this.consumeOrError('CLOSE_MUSTACHE', 'Expected }} to close mustache');

    return { type: 'mustache', path, modifiers };
  }

  // ── Each block: {{#each path}} body {{/each}} ────────────────────────────

  private parseEach(): EachNode {
    const start = this.peek().position;
    this.consume('BLOCK_EACH');
    this.skipWhitespace();
    const path = this.parsePath();
    this.consumeOrError('CLOSE_MUSTACHE', 'Expected }} after {{#each path');

    const body = this.parseTemplate('each-end');

    if (this.peek().kind === 'BLOCK_END_EACH') {
      this.consume('BLOCK_END_EACH');
    } else {
      this.addError('Unclosed {{#each}} block', start);
    }

    return { type: 'each', path, body };
  }

  // ── If block: {{#if expr}} then {{else}} else {{/if}} ────────────────────

  private parseIf(): IfNode {
    const start = this.peek().position;
    this.consume('BLOCK_IF');
    this.skipWhitespace();
    const expr = this.parseIfExpr();
    this.consumeOrError('CLOSE_MUSTACHE', 'Expected }} after {{#if expr');

    const thenBranch = this.parseTemplate('if-end');

    let elseBranch: readonly AstNode[] = [];
    if (this.peek().kind === 'BLOCK_ELSE') {
      this.consume('BLOCK_ELSE');
      elseBranch = this.parseTemplate('if-end');
    }

    if (this.peek().kind === 'BLOCK_END_IF') {
      this.consume('BLOCK_END_IF');
    } else {
      this.addError('Unclosed {{#if}} block', start);
    }

    return { type: 'if', expr, thenBranch, elseBranch };
  }

  // ── Expressions ──────────────────────────────────────────────────────────

  private parseIfExpr(): IfExpr {
    const path = this.parsePath();

    if (this.peek().kind !== 'COMPARE_OP') {
      // Truthy check — no operator
      return { path, operator: null, operand: null };
    }

    const opToken = this.consume('COMPARE_OP');
    const operator = opToken.value as ComparisonOperator;
    const operand = this.parseLiteral();

    return { path, operator, operand };
  }

  private parseLiteral(): string | number | boolean | null {
    const token = this.peek();
    if (token.kind === 'STRING_LITERAL') {
      this.advance();
      return token.value;
    }
    if (token.kind === 'NUMBER_LITERAL') {
      this.advance();
      return parseFloat(token.value);
    }
    if (token.kind === 'BOOL_LITERAL') {
      this.advance();
      return token.value === 'true';
    }
    if (token.kind === 'NULL_LITERAL') {
      this.advance();
      return null;
    }
    this.addError(`Expected literal, got ${token.kind}`, token.position);
    return null;
  }

  // ── Path: identifier (. identifier)* ────────────────────────────────────

  private parsePath(): string {
    const parts: string[] = [];
    const first = this.peek();

    if (first.kind !== 'IDENTIFIER') {
      this.addError(`Expected identifier, got ${first.kind} at ${first.position}`, first.position);
      return '__invalid__';
    }

    parts.push(this.consume('IDENTIFIER').value);

    while (this.peek().kind === 'DOT') {
      this.consume('DOT');
      if (this.peek().kind === 'IDENTIFIER') {
        parts.push(this.consume('IDENTIFIER').value);
      } else {
        this.addError('Expected identifier after dot', this.peek().position);
        break;
      }
    }

    return parts.join('.');
  }

  // ── Modifiers: display | raw | upper | lower | title
  //              | default:"value" | format:spec:"value" ──────────────────

  private parseModifier(): ModifierKind | null {
    const token = this.peek();
    if (token.kind !== 'IDENTIFIER') {
      this.addError(`Expected modifier name, got ${token.kind}`, token.position);
      return null;
    }

    const name = this.consume('IDENTIFIER').value;

    switch (name) {
      case 'display': return { kind: 'display' };
      case 'raw':     return { kind: 'raw' };
      case 'upper':   return { kind: 'upper' };
      case 'lower':   return { kind: 'lower' };
      case 'title':   return { kind: 'title' };

      case 'default': {
        this.consumeOrError('COLON', 'Expected : after default');
        const value = this.peek().kind === 'STRING_LITERAL'
          ? this.consume('STRING_LITERAL').value
          : '';
        return { kind: 'default', value };
      }

      case 'format': {
        this.consumeOrError('COLON', 'Expected : after format');
        if (this.peek().kind !== 'IDENTIFIER') {
          this.addError('Expected format spec (date, money, number)', this.peek().position);
          return null;
        }
        const specType = this.consume('IDENTIFIER').value;
        this.consumeOrError('COLON', `Expected : after format:${specType}`);
        const specValue = this.peek().kind === 'STRING_LITERAL'
          ? this.consume('STRING_LITERAL').value
          : '';
        return { kind: 'format', spec: `${specType}:${specValue}` };
      }

      default:
        this.addError(`Unknown modifier: ${name}`, token.position);
        return null;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private peek(): LexToken {
    return this.tokens[this.pos] ?? { kind: 'EOF', value: '', position: -1 };
  }

  private advance(): LexToken {
    const token = this.peek();
    if (!this.isAtEnd()) this.pos += 1;
    return token;
  }

  private consume(kind: LexTokenKind): LexToken {
    const token = this.peek();
    if (token.kind !== kind) {
      this.addError(`Expected ${kind}, got ${token.kind}`, token.position);
    }
    return this.advance();
  }

  private consumeOrError(kind: LexTokenKind, message: string): void {
    const token = this.peek();
    if (token.kind !== kind) {
      this.addError(message, token.position);
      return;
    }
    this.advance();
  }

  private skipWhitespace(): void {
    // The lexer emits whitespace as TEXT tokens inside {{ }} — skip them
    while (this.peek().kind === 'TEXT' && this.peek().value.trim() === '') {
      this.advance();
    }
  }

  private isAtEnd(): boolean {
    return this.peek().kind === 'EOF';
  }

  private addError(message: string, position: number): void {
    this.errors.push({ message, position });
  }
}

export { COMPARISON_OPERATORS };
