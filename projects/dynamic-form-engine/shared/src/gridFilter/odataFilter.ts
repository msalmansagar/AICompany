// Emits an OData $filter expression from a parsed depends-on template.
// Used by the in-CRM engine, which queries Dataverse through Xrm.WebApi rather than FetchXML.
//
// Three differences from the FetchXML dialect matter:
//   · `like '%x%'` has no OData equivalent — it becomes contains/startswith/endswith.
//   · Lookup values must stay in their `_x_value` navigation form AND be unquoted; the
//     Web API rejects a quoted GUID with "incompatible types".
//   · Strings are quoted with '' escaping instead of XML attribute escaping.
import {
  parseFilterTemplate,
  substitutePlaceholders,
  MAX_VALUE_LENGTH,
  NUMERIC_PATTERN,
  type ConditionNode,
  type FilterNode,
  type LogicalNode,
  type ValueSpec,
} from './filterTemplate.js';

const GUID_PATTERN = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

/**
 * Compiles the template into an OData $filter expression, or '' when the expression is
 * empty after pruning. Throws only on a malformed template — callers decide how to log.
 */
export function buildODataFilter(
  template: string,
  values: Record<string, string>,
  navigationProperties: Record<string, string> = {},
): string {
  if (!template || !template.trim()) return '';
  return emit(parseFilterTemplate(template), { values, navigationProperties });
}

interface EmitContext {
  values: Record<string, string>;
  /**
   * Lookup attribute → single-valued navigation property, for templates that reach through
   * a lookup. `company/name` becomes `qdb_CompanyId/name` — the attribute name itself is
   * not traversable, and for a polymorphic lookup it depends on the target table.
   */
  navigationProperties: Record<string, string>;
}

function emit(node: FilterNode, context: EmitContext): string {
  return node.type === 'cond' ? emitCondition(node, context) : emitLogical(node, context);
}

function emitLogical(node: LogicalNode, context: EmitContext): string {
  const parts = node.children.map((child) => emit(child, context)).filter((part) => part !== '');
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `(${parts.join(` ${node.operator} `)})`;
}

function emitCondition(node: ConditionNode, context: EmitContext): string {
  const { operator } = node;

  const path = resolvePath(node, context);
  if (path === null) return ''; // lookup path with no navigation property — drop it

  if (node.value.kind === 'null') {
    return `${path} ${operator === 'ne' ? 'ne' : 'eq'} null`;
  }

  if (operator === 'like' || operator === 'not-like') {
    return emitTextMatch(node, path, context.values);
  }

  const resolved = resolveValue(node.value, context.values);
  return resolved === null ? '' : `${path} ${operator} ${resolved}`;
}

/** The addressable path for a condition: the attribute, or `<navProp>/<relatedColumn>`. */
function resolvePath(node: ConditionNode, context: EmitContext): string | null {
  if (!node.relatedAttribute) return node.attribute;

  const navigationProperty = context.navigationProperties[node.attribute];
  if (!navigationProperty) return null;
  return `${navigationProperty}/${node.relatedAttribute}`;
}

// `like` carries its wildcards inside the string literal, so the pattern decides which
// OData string function to use. A pattern with no wildcard is an exact match.
function emitTextMatch(node: ConditionNode, path: string, values: Record<string, string>): string {
  const pattern = resolvePattern(node.value, values);
  if (pattern === null) return '';

  const startsWithWildcard = pattern.startsWith('%');
  const endsWithWildcard = pattern.endsWith('%');
  const term = quote(pattern.replace(/^%/, '').replace(/%$/, ''));

  let expression: string;
  if (startsWithWildcard && endsWithWildcard) expression = `contains(${path},${term})`;
  else if (endsWithWildcard) expression = `startswith(${path},${term})`;
  else if (startsWithWildcard) expression = `endswith(${path},${term})`;
  else expression = `${path} eq ${term}`;

  return node.operator === 'not-like' ? `not ${expression}` : expression;
}

function resolvePattern(value: ValueSpec, values: Record<string, string>): string | null {
  if (value.kind === 'string') return substitutePlaceholders(value.raw, values);
  if (value.kind === 'placeholder') {
    const raw = values[value.name];
    return raw ? raw.slice(0, MAX_VALUE_LENGTH) : null;
  }
  if (value.kind === 'number') return value.text;
  return null;
}

// Resolves a condition's value to an OData literal, or null when a referenced placeholder
// is missing/empty (string) or resolves to a non-numeric value (numeric).
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
      const substituted = substitutePlaceholders(value.raw, values);
      if (substituted === null) return null;
      return GUID_PATTERN.test(substituted) ? stripBraces(substituted) : quote(substituted);
    }
  }
}

function stripBraces(guid: string): string {
  return guid.replace(/^\{/, '').replace(/\}$/, '');
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
