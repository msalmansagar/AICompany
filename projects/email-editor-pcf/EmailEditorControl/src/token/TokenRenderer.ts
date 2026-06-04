/**
 * TokenRenderer.ts
 * Walks a TemplateAst and produces the final rendered string.
 * Resolves token paths against a RenderContext, applies modifiers,
 * handles each/if blocks, and HTML-escapes by default.
 */

import { Logger } from '../services/Logger';
import { Formatters } from './Formatters';
import {
  AstNode,
  EachNode,
  IfExpr,
  IfNode,
  ModifierKind,
  MustacheNode,
  RenderContext,
  TemplateAst
} from './TokenTypes';

const OData_FORMATTED_VALUE_SUFFIX = '@OData.Community.Display.V1.FormattedValue';

export class TokenRenderer {
  public constructor(
    private readonly formatters: Formatters,
    private readonly logger: Logger
  ) {}

  public render(ast: TemplateAst, context: RenderContext): string {
    return this.renderNodes(ast, context);
  }

  // ── Node dispatch ────────────────────────────────────────────────────────

  private renderNodes(nodes: readonly AstNode[], context: RenderContext): string {
    return nodes.map((node) => this.renderNode(node, context)).join('');
  }

  private renderNode(node: AstNode, context: RenderContext): string {
    switch (node.type) {
      case 'text':     return node.value;
      case 'mustache': return this.renderMustache(node, context);
      case 'each':     return this.renderEach(node, context);
      case 'if':       return this.renderIf(node, context);
    }
  }

  // ── Mustache ─────────────────────────────────────────────────────────────

  private renderMustache(node: MustacheNode, context: RenderContext): string {
    const hasDisplay  = node.modifiers.some((m) => m.kind === 'display');
    const hasRaw      = node.modifiers.some((m) => m.kind === 'raw');
    const defaultMod  = node.modifiers.find((m): m is Extract<ModifierKind, { kind: 'default' }> =>
      m.kind === 'default');
    const formatMod   = node.modifiers.find((m): m is Extract<ModifierKind, { kind: 'format' }> =>
      m.kind === 'format');
    const caseMod     = node.modifiers.find((m): m is Extract<ModifierKind, { kind: 'upper' | 'lower' | 'title' }> =>
      m.kind === 'upper' || m.kind === 'lower' || m.kind === 'title');

    let raw: unknown = hasDisplay
      ? this.resolveDisplayValue(node.path, context)
      : this.resolvePath(node.path, context);

    if (raw === null || raw === undefined) {
      raw = defaultMod ? defaultMod.value : '';
    }

    let stringValue = formatMod
      ? this.formatters.applyFormat(raw, formatMod.spec, context.locale, context.currency)
      : String(raw ?? '');

    if (caseMod) {
      stringValue = this.formatters.applyCase(stringValue, caseMod.kind as 'upper' | 'lower' | 'title');
    }

    return hasRaw ? stringValue : this.formatters.escapeHtml(stringValue);
  }

  // ── Each ─────────────────────────────────────────────────────────────────

  private renderEach(node: EachNode, context: RenderContext): string {
    const collection = this.resolvePath(node.path, context);

    if (!Array.isArray(collection)) {
      this.logger.warn('each_not_array', { path: node.path });
      return '';
    }

    return collection
      .map((item) => {
        if (typeof item !== 'object' || item === null) {
          this.logger.warn('each_item_not_object', { path: node.path });
          return '';
        }
        const itemContext: RenderContext = {
          ...context,
          root: item as Record<string, unknown>
        };
        return this.renderNodes(node.body, itemContext);
      })
      .join('');
  }

  // ── If ───────────────────────────────────────────────────────────────────

  private renderIf(node: IfNode, context: RenderContext): string {
    const condition = this.evaluateExpr(node.expr, context);
    return condition
      ? this.renderNodes(node.thenBranch, context)
      : this.renderNodes(node.elseBranch, context);
  }

  private evaluateExpr(expr: IfExpr, context: RenderContext): boolean {
    const left = this.resolvePath(expr.path, context);

    if (expr.operator === null) {
      return this.isTruthy(left);
    }

    const right = expr.operand;

    switch (expr.operator) {
      case '==': return this.looseEquals(left, right);
      case '!=': return !this.looseEquals(left, right);
      case '>':  return this.toNumber(left) > this.toNumber(right);
      case '>=': return this.toNumber(left) >= this.toNumber(right);
      case '<':  return this.toNumber(left) < this.toNumber(right);
      case '<=': return this.toNumber(left) <= this.toNumber(right);
      default:   return false;
    }
  }

  // ── Path resolution ───────────────────────────────────────────────────────

  private resolvePath(path: string, context: RenderContext): unknown {
    const segments = path.split('.');
    let current: unknown = context.root;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        this.logger.warn('path_null_segment', { path, segment });
        return null;
      }
      if (typeof current !== 'object') {
        this.logger.warn('path_not_object', { path, segment });
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  /**
   * Resolves a lookup field's display value via the OData FormattedValue annotation.
   * Dataverse returns: _fieldname_value@OData.Community.Display.V1.FormattedValue
   */
  private resolveDisplayValue(path: string, context: RenderContext): unknown {
    const segments = path.split('.');
    const lastSegment = segments[segments.length - 1];
    const parentSegments = segments.slice(0, -1);

    const parentObj = parentSegments.length > 0
      ? this.resolvePath(parentSegments.join('.'), context)
      : context.root;

    if (typeof parentObj !== 'object' || parentObj === null) return null;

    const parent = parentObj as Record<string, unknown>;

    // Try OData annotation first
    const annotationKey = `_${lastSegment}_value${OData_FORMATTED_VALUE_SUFFIX}`;
    if (annotationKey in parent) return parent[annotationKey];

    // Try direct formatted value annotation on the field itself
    const directAnnotation = `${lastSegment}${OData_FORMATTED_VALUE_SUFFIX}`;
    if (directAnnotation in parent) return parent[directAnnotation];

    // Fallback to raw value
    return parent[lastSegment];
  }

  // ── Comparison helpers ────────────────────────────────────────────────────

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined || value === false || value === 0) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  private looseEquals(a: unknown, b: unknown): boolean {
    if (a === null || a === undefined) return b === null || b === undefined;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  private toNumber(value: unknown): number {
    const n = parseFloat(String(value));
    return isNaN(n) ? 0 : n;
  }
}
