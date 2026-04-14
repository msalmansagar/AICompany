/**
 * TokenTypes.ts
 * AST node types and Zod validation schemas for the Handlebars-subset
 * token language used by the email editor.
 *
 * Grammar summary:
 *   Template  := (TextNode | MustacheNode | EachNode | IfNode)*
 *   Mustache  := '{{' Path Modifier* '}}'
 *   Each      := '{{#each' Path '}}' Template '{{/each}}'
 *   If        := '{{#if' Expr '}}' Template ('{{else}}' Template)? '{{/if}}'
 *   Path      := Identifier ('.' Identifier)*
 *   Modifier  := '|' ModifierKind
 */

import { z } from 'zod';

// ── Primitive schemas ────────────────────────────────────────────────────────

const PathSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z_][a-zA-Z0-9_.]*$/, 'Path must be dot-separated identifiers');

const ModifierKindSchema = z.union([
  z.object({ kind: z.literal('display') }),
  z.object({ kind: z.literal('raw') }),
  z.object({ kind: z.literal('upper') }),
  z.object({ kind: z.literal('lower') }),
  z.object({ kind: z.literal('title') }),
  z.object({ kind: z.literal('default'), value: z.string() }),
  z.object({ kind: z.literal('format'), spec: z.string() })
]);

export type ModifierKind = z.infer<typeof ModifierKindSchema>;

// ── AST nodes ────────────────────────────────────────────────────────────────

export interface TextNode {
  readonly type: 'text';
  readonly value: string;
}

export interface MustacheNode {
  readonly type: 'mustache';
  readonly path: string;
  readonly modifiers: readonly ModifierKind[];
}

export interface EachNode {
  readonly type: 'each';
  readonly path: string;
  readonly body: readonly AstNode[];
}

export type ComparisonOperator = '==' | '!=' | '>' | '>=' | '<' | '<=';

export interface IfExpr {
  readonly path: string;
  readonly operator: ComparisonOperator | null;
  readonly operand: string | number | boolean | null;
}

export interface IfNode {
  readonly type: 'if';
  readonly expr: IfExpr;
  readonly thenBranch: readonly AstNode[];
  readonly elseBranch: readonly AstNode[];
}

export type AstNode = TextNode | MustacheNode | EachNode | IfNode;

export type TemplateAst = readonly AstNode[];

// ── Parse result ─────────────────────────────────────────────────────────────

export interface ParseError {
  readonly message: string;
  readonly position: number;
}

export type ParseResult =
  | { readonly ok: true; readonly ast: TemplateAst }
  | { readonly ok: false; readonly errors: readonly ParseError[] };

// ── Render context ────────────────────────────────────────────────────────────

export interface RenderContext {
  /** Web API JSON record (root entity or current each-scope item) */
  readonly root: Record<string, unknown>;
  /** Locale string for Intl formatting (e.g. "en-PK") */
  readonly locale: string;
  /** Currency code for money formatting (e.g. "PKR") */
  readonly currency: string;
}

// ── Zod export for boundary validation ───────────────────────────────────────

export { PathSchema, ModifierKindSchema };
