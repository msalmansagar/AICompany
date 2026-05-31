// ─────────────────────────────────────────────────────────────
// Safe recursive-descent expression engine — no eval(), no new Function().
// Used by ValidationEngine (customExpression rules) and RuleEngine (calculateValue).
// ─────────────────────────────────────────────────────────────

export type ExpressionValue = string | number | boolean | null;

export type ExpressionContext = Record<string, ExpressionValue>;

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

// ── Lexer ──────────────────────────────────────────────────────

enum TT {
  Number, String, True, False, Null,
  Ident, FieldRef,
  Plus, Minus, Star, Slash, Percent,
  EqEq, BangEq, Lt, Gt, LtEq, GtEq,
  AmpAmp, PipePipe, Bang,
  Question, Colon,
  LParen, RParen, Comma,
  EOF,
}

interface Token { type: TT; value: string; pos: number }

class Lexer {
  private pos = 0;
  constructor(private readonly src: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.src.length) {
      this.skipWs();
      if (this.pos >= this.src.length) break;
      tokens.push(this.nextToken());
    }
    tokens.push({ type: TT.EOF, value: '', pos: this.pos });
    return tokens;
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }

  private nextToken(): Token {
    const start = this.pos;
    const ch = this.src[this.pos];
    if (/\d/.test(ch) || ch === '.') return this.readNumber(start);
    if (ch === '"' || ch === "'") return this.readString(ch, start);
    if (ch === '{') return this.readFieldRef(start);
    if (/[a-zA-Z_]/.test(ch)) return this.readIdent(start);
    return this.readSymbol(start);
  }

  private readNumber(start: number): Token {
    while (this.pos < this.src.length && /[\d.]/.test(this.src[this.pos])) this.pos++;
    return { type: TT.Number, value: this.src.slice(start, this.pos), pos: start };
  }

  private readString(quote: string, start: number): Token {
    this.pos++;
    let value = '';
    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      if (this.src[this.pos] === '\\') {
        this.pos++;
        const esc = this.src[this.pos] ?? '';
        value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
      } else {
        value += this.src[this.pos];
      }
      this.pos++;
    }
    this.pos++;
    return { type: TT.String, value, pos: start };
  }

  private readFieldRef(start: number): Token {
    this.pos++;
    const refStart = this.pos;
    while (this.pos < this.src.length && this.src[this.pos] !== '}') this.pos++;
    const name = this.src.slice(refStart, this.pos);
    this.pos++;
    return { type: TT.FieldRef, value: name, pos: start };
  }

  private readIdent(start: number): Token {
    while (this.pos < this.src.length && /\w/.test(this.src[this.pos])) this.pos++;
    const word = this.src.slice(start, this.pos);
    if (word === 'true')  return { type: TT.True,  value: word, pos: start };
    if (word === 'false') return { type: TT.False, value: word, pos: start };
    if (word === 'null')  return { type: TT.Null,  value: word, pos: start };
    return { type: TT.Ident, value: word, pos: start };
  }

  private readSymbol(start: number): Token {
    const ch = this.src[this.pos++];
    const nx = this.src[this.pos] ?? '';
    switch (ch) {
      case '+': return { type: TT.Plus,    value: '+', pos: start };
      case '-': return { type: TT.Minus,   value: '-', pos: start };
      case '*': return { type: TT.Star,    value: '*', pos: start };
      case '/': return { type: TT.Slash,   value: '/', pos: start };
      case '%': return { type: TT.Percent, value: '%', pos: start };
      case '!':
        if (nx === '=') { this.pos++; return { type: TT.BangEq, value: '!=', pos: start }; }
        return { type: TT.Bang, value: '!', pos: start };
      case '=':
        if (nx === '=') { this.pos++; return { type: TT.EqEq, value: '==', pos: start }; }
        throw new ExpressionError(`Unexpected '=' at ${start} — did you mean '=='?`);
      case '<':
        if (nx === '=') { this.pos++; return { type: TT.LtEq, value: '<=', pos: start }; }
        return { type: TT.Lt, value: '<', pos: start };
      case '>':
        if (nx === '=') { this.pos++; return { type: TT.GtEq, value: '>=', pos: start }; }
        return { type: TT.Gt, value: '>', pos: start };
      case '&':
        if (nx === '&') { this.pos++; return { type: TT.AmpAmp, value: '&&', pos: start }; }
        throw new ExpressionError(`Unexpected '&' at ${start} — did you mean '&&'?`);
      case '|':
        if (nx === '|') { this.pos++; return { type: TT.PipePipe, value: '||', pos: start }; }
        throw new ExpressionError(`Unexpected '|' at ${start} — did you mean '||'?`);
      case '?': return { type: TT.Question, value: '?', pos: start };
      case ':': return { type: TT.Colon,    value: ':', pos: start };
      case '(': return { type: TT.LParen,   value: '(', pos: start };
      case ')': return { type: TT.RParen,   value: ')', pos: start };
      case ',': return { type: TT.Comma,    value: ',', pos: start };
      default:
        throw new ExpressionError(`Unexpected character '${ch}' at position ${start}`);
    }
  }
}

// ── AST nodes ──────────────────────────────────────────────────

type Expr =
  | { kind: 'num';     value: number }
  | { kind: 'str';     value: string }
  | { kind: 'bool';    value: boolean }
  | { kind: 'null' }
  | { kind: 'field';   name: string }
  | { kind: 'call';    name: string; args: Expr[] }
  | { kind: 'not';     operand: Expr }
  | { kind: 'binop';   op: string; left: Expr; right: Expr }
  | { kind: 'ternary'; cond: Expr; then: Expr; else: Expr };

// ── Parser ──────────────────────────────────────────────────────

const CMP_TYPES = [TT.EqEq, TT.BangEq, TT.Lt, TT.Gt, TT.LtEq, TT.GtEq];

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expr = this.parseTernary();
    if (this.peek().type !== TT.EOF) {
      throw new ExpressionError(`Unexpected token '${this.peek().value}'`);
    }
    return expr;
  }

  private parseTernary(): Expr {
    const cond = this.parseLogical();
    if (this.peek().type !== TT.Question) return cond;
    this.advance();
    const then = this.parseTernary();
    this.expect(TT.Colon, ':');
    const els = this.parseTernary();
    return { kind: 'ternary', cond, then, else: els };
  }

  private parseLogical(): Expr {
    let left = this.parseComparison();
    while (this.peek().type === TT.AmpAmp || this.peek().type === TT.PipePipe) {
      const op = this.advance().value;
      left = { kind: 'binop', op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseAdditive();
    while (CMP_TYPES.includes(this.peek().type)) {
      const op = this.advance().value;
      left = { kind: 'binop', op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMult();
    while (this.peek().type === TT.Plus || this.peek().type === TT.Minus) {
      const op = this.advance().value;
      left = { kind: 'binop', op, left, right: this.parseMult() };
    }
    return left;
  }

  private parseMult(): Expr {
    let left = this.parseUnary();
    while (
      this.peek().type === TT.Star ||
      this.peek().type === TT.Slash ||
      this.peek().type === TT.Percent
    ) {
      const op = this.advance().value;
      left = { kind: 'binop', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.peek().type === TT.Bang) {
      this.advance();
      return { kind: 'not', operand: this.parseUnary() };
    }
    if (this.peek().type === TT.Minus) {
      this.advance();
      return { kind: 'binop', op: '-', left: { kind: 'num', value: 0 }, right: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.advance();
    switch (token.type) {
      case TT.Number:   return { kind: 'num',   value: parseFloat(token.value) };
      case TT.String:   return { kind: 'str',   value: token.value };
      case TT.True:     return { kind: 'bool',  value: true };
      case TT.False:    return { kind: 'bool',  value: false };
      case TT.Null:     return { kind: 'null' };
      case TT.FieldRef: return { kind: 'field', name: token.value };
      case TT.Ident: {
        this.expect(TT.LParen, '(');
        const args = this.parseArgList();
        this.expect(TT.RParen, ')');
        return { kind: 'call', name: token.value, args };
      }
      case TT.LParen: {
        const inner = this.parseTernary();
        this.expect(TT.RParen, ')');
        return inner;
      }
      default:
        throw new ExpressionError(
          `Unexpected token '${token.value}' at position ${token.pos}`,
        );
    }
  }

  private parseArgList(): Expr[] {
    if (this.peek().type === TT.RParen) return [];
    const args = [this.parseTernary()];
    while (this.peek().type === TT.Comma) {
      this.advance();
      args.push(this.parseTernary());
    }
    return args;
  }

  private peek(): Token   { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }

  private expect(type: TT, expected: string): void {
    const token = this.advance();
    if (token.type !== type) {
      throw new ExpressionError(`Expected '${expected}' but got '${token.value}'`);
    }
  }
}

// ── Evaluator ──────────────────────────────────────────────────

function evalNode(node: Expr, ctx: ExpressionContext): ExpressionValue {
  switch (node.kind) {
    case 'num':     return node.value;
    case 'str':     return node.value;
    case 'bool':    return node.value;
    case 'null':    return null;
    case 'field':   return ctx[node.name] ?? null;
    case 'not':     return !evalNode(node.operand, ctx);
    case 'ternary': return evalNode(node.cond, ctx) ? evalNode(node.then, ctx) : evalNode(node.else, ctx);
    case 'binop':   return evalBinop(node.op, evalNode(node.left, ctx), evalNode(node.right, ctx));
    case 'call':    return evalCall(node.name, node.args.map((a) => evalNode(a, ctx)));
  }
}

function evalBinop(op: string, left: ExpressionValue, right: ExpressionValue): ExpressionValue {
  switch (op) {
    case '+':
      return typeof left === 'string' || typeof right === 'string'
        ? String(left ?? '') + String(right ?? '')
        : (left as number) + (right as number);
    case '-':  return (left as number) - (right as number);
    case '*':  return (left as number) * (right as number);
    case '/': {
      const divisor = right as number;
      if (divisor === 0) throw new ExpressionError('Division by zero');
      return (left as number) / divisor;
    }
    case '%':  return (left as number) % (right as number);
    case '==': return left === right;
    case '!=': return left !== right;
    case '<':  return (left as number) <  (right as number);
    case '>':  return (left as number) >  (right as number);
    case '<=': return (left as number) <= (right as number);
    case '>=': return (left as number) >= (right as number);
    // Short-circuit semantics: && returns first falsy or last value; || returns first truthy or last
    case '&&': return !left ? left : right;
    case '||': return left  ? left : right;
    default:   throw new ExpressionError(`Unknown operator '${op}'`);
  }
}

function evalCall(name: string, args: ExpressionValue[]): ExpressionValue {
  const s = (i: number): string => String(args[i] ?? '');
  const n = (i: number): number => Number(args[i] ?? 0);

  switch (name) {
    case 'len':        return s(0).length;
    case 'upper':      return s(0).toUpperCase();
    case 'lower':      return s(0).toLowerCase();
    case 'trim':       return s(0).trim();
    case 'contains':   return s(0).includes(s(1));
    case 'startsWith': return s(0).startsWith(s(1));
    case 'endsWith':   return s(0).endsWith(s(1));
    case 'concat':     return args.map((a) => String(a ?? '')).join('');
    case 'substr':     return s(0).slice(n(1), args.length > 2 ? n(1) + n(2) : undefined);
    case 'round':      return Math.round(n(0));
    case 'floor':      return Math.floor(n(0));
    case 'ceil':       return Math.ceil(n(0));
    case 'abs':        return Math.abs(n(0));
    case 'min':        return Math.min(...args.map((a) => Number(a ?? 0)));
    case 'max':        return Math.max(...args.map((a) => Number(a ?? 0)));
    case 'toNumber':   return Number(args[0] ?? 0);
    case 'toString':   return String(args[0] ?? '');
    case 'if':         return args[0] ? args[1] : args[2];
    case 'isEmpty': {
      const v = args[0];
      return v === null || v === undefined || v === '';
    }
    case 'isNotEmpty': {
      const v = args[0];
      return v !== null && v !== undefined && v !== '';
    }
    default: throw new ExpressionError(`Unknown function '${name}'`);
  }
}

// ── Public API ─────────────────────────────────────────────────

export class ExpressionEngine {
  static evaluate(expression: string, context: ExpressionContext): ExpressionValue {
    const tokens = new Lexer(expression).tokenize();
    const ast = new Parser(tokens).parse();
    return evalNode(ast, context);
  }

  static evaluateBoolean(expression: string, context: ExpressionContext): boolean {
    return Boolean(ExpressionEngine.evaluate(expression, context));
  }

  static evaluateString(expression: string, context: ExpressionContext): string {
    return String(ExpressionEngine.evaluate(expression, context) ?? '');
  }

  static evaluateNumber(expression: string, context: ExpressionContext): number {
    return Number(ExpressionEngine.evaluate(expression, context) ?? 0);
  }
}
