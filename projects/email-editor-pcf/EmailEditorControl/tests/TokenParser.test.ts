/**
 * TokenParser.test.ts
 * Unit tests for the full lex → parse pipeline.
 * Tests follow AAA: Arrange, Act, Assert.
 */

import { describe, expect, it } from 'vitest';
import { TokenLexer } from '../src/token/TokenLexer';
import { TokenParser } from '../src/token/TokenParser';
import { AstNode, EachNode, IfNode, MustacheNode, TextNode } from '../src/token/TokenTypes';

function parse(source: string) {
  const lexer = new TokenLexer();
  const parser = new TokenParser();
  return parser.parse(lexer.lex(source));
}

// ── Text nodes ───────────────────────────────────────────────────────────────

describe('TokenParser — plain text', () => {
  it('parse_plainText_returnsTextNode', () => {
    const result = parse('Hello World');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast).toHaveLength(1);
    expect((result.ast[0] as TextNode).type).toBe('text');
    expect((result.ast[0] as TextNode).value).toBe('Hello World');
  });

  it('parse_emptyString_returnsEmptyAst', () => {
    const result = parse('');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast).toHaveLength(0);
  });
});

// ── Mustache nodes ────────────────────────────────────────────────────────────

describe('TokenParser — mustache', () => {
  it('parse_simpleMustache_returnsMustacheNode', () => {
    const result = parse('Hello {{customer.fullname}}!');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nodes = result.ast;
    expect(nodes).toHaveLength(3);
    const mustache = nodes[1] as MustacheNode;
    expect(mustache.type).toBe('mustache');
    expect(mustache.path).toBe('customer.fullname');
    expect(mustache.modifiers).toHaveLength(0);
  });

  it('parse_mustacheWithDisplayModifier_setsModifier', () => {
    const result = parse('{{account.primarycontactid | display}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as MustacheNode;
    expect(node.modifiers).toHaveLength(1);
    expect(node.modifiers[0].kind).toBe('display');
  });

  it('parse_mustacheWithDefaultModifier_setsDefaultValue', () => {
    const result = parse('{{customer.fullname | default:"valued customer"}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as MustacheNode;
    const mod = node.modifiers[0];
    expect(mod.kind).toBe('default');
    if (mod.kind === 'default') expect(mod.value).toBe('valued customer');
  });

  it('parse_mustacheWithFormatModifier_setsFormatSpec', () => {
    const result = parse('{{loan.createdon | format:date:"dd MMM yyyy"}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as MustacheNode;
    const mod = node.modifiers[0];
    expect(mod.kind).toBe('format');
    if (mod.kind === 'format') expect(mod.spec).toBe('date:dd MMM yyyy');
  });

  it('parse_mustacheWithMultipleModifiers_allPresent', () => {
    const result = parse('{{name | upper | default:"N/A"}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as MustacheNode;
    expect(node.modifiers).toHaveLength(2);
    expect(node.modifiers[0].kind).toBe('upper');
    expect(node.modifiers[1].kind).toBe('default');
  });
});

// ── Each block ────────────────────────────────────────────────────────────────

describe('TokenParser — each block', () => {
  it('parse_eachBlock_returnsEachNode', () => {
    const result = parse('{{#each loan.invoicelines}}{{productname}}{{/each}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as EachNode;
    expect(node.type).toBe('each');
    expect(node.path).toBe('loan.invoicelines');
    expect(node.body).toHaveLength(1);
  });

  it('parse_eachWithTextAndMustache_parsesBody', () => {
    const result = parse('{{#each lines}}- {{name}}\n{{/each}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const each = result.ast[0] as EachNode;
    expect(each.body.length).toBeGreaterThanOrEqual(1);
  });

  it('parse_unclosedEach_returnsError', () => {
    const result = parse('{{#each lines}}{{name}}');
    expect(result.ok).toBe(false);
  });
});

// ── If block ──────────────────────────────────────────────────────────────────

describe('TokenParser — if block', () => {
  it('parse_ifWithComparison_returnsIfNode', () => {
    const result = parse('{{#if customer.vip == true}}VIP{{/if}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as IfNode;
    expect(node.type).toBe('if');
    expect(node.expr.path).toBe('customer.vip');
    expect(node.expr.operator).toBe('==');
    expect(node.expr.operand).toBe(true);
    expect(node.thenBranch).toHaveLength(1);
    expect(node.elseBranch).toHaveLength(0);
  });

  it('parse_ifElse_returnsBothBranches', () => {
    const result = parse('{{#if vip == true}}VIP{{else}}Regular{{/if}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as IfNode;
    expect(node.thenBranch).toHaveLength(1);
    expect(node.elseBranch).toHaveLength(1);
  });

  it('parse_ifTruthyCheck_noOperator', () => {
    const result = parse('{{#if customer.active}}Active{{/if}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.ast[0] as IfNode;
    expect(node.expr.operator).toBeNull();
    expect(node.expr.operand).toBeNull();
  });

  it('parse_unclosedIf_returnsError', () => {
    const result = parse('{{#if x == 1}}open');
    expect(result.ok).toBe(false);
  });
});

// ── Mixed content ─────────────────────────────────────────────────────────────

describe('TokenParser — mixed content', () => {
  it('parse_complexTemplate_producesCorrectNodeCount', () => {
    const template = `Dear {{customer.fullname | default:"customer"}},
Your loan {{loan.number}} is approved.
{{#if vip == true}}Thank you for being VIP.{{/if}}
Lines:
{{#each lines}}
- {{name}} x {{qty}}
{{/each}}`;
    const result = parse(template);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should have text, mustache, text, mustache, text, if, text, each
    expect(result.ast.length).toBeGreaterThan(4);
  });
});
