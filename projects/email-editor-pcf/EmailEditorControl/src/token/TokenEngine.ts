/**
 * TokenEngine.ts
 * Public facade over TokenLexer → TokenParser → TokenRenderer.
 * This is the only class callers should import for token operations.
 */

import { Logger } from '../services/Logger';
import { Formatters } from './Formatters';
import { TokenLexer } from './TokenLexer';
import { TokenParser } from './TokenParser';
import { TokenRenderer } from './TokenRenderer';
import { ParseResult, RenderContext, TemplateAst } from './TokenTypes';

export class TokenEngine {
  private readonly lexer = new TokenLexer();
  private readonly parser = new TokenParser();
  private readonly renderer: TokenRenderer;

  public constructor(private readonly logger: Logger) {
    this.renderer = new TokenRenderer(new Formatters(), logger);
  }

  /**
   * Parse a raw template string into an AST.
   * Returns a ParseResult — never throws on invalid input.
   */
  public parse(source: string): ParseResult {
    const tokens = this.lexer.lex(source);
    return this.parser.parse(tokens);
  }

  /**
   * Render a pre-parsed AST against a record context.
   * Never throws — missing paths resolve to empty string.
   */
  public render(ast: TemplateAst, context: RenderContext): string {
    return this.renderer.render(ast, context);
  }

  /**
   * Convenience: parse + render in one call.
   * On parse failure, logs warnings and returns the original source unchanged.
   */
  public renderSource(source: string, context: RenderContext): string {
    const result = this.parse(source);
    if (!result.ok) {
      this.logger.warn('token_parse_failed', { errors: result.errors });
      return source;
    }
    return this.render(result.ast, context);
  }

  /**
   * Validate a template without rendering it.
   * Returns a list of error messages, or an empty array if valid.
   */
  public validate(source: string): readonly string[] {
    const result = this.parse(source);
    if (result.ok) return [];
    return result.errors.map((e) => `Position ${e.position}: ${e.message}`);
  }
}
