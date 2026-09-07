// Emits a FetchXML <filter> subtree from a parsed depends-on template.
// Used by the portal path, where the backend queries Dataverse with FetchXML.
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

/** The related table behind a lookup attribute, needed to build the join. */
export interface LookupJoinTarget {
  /** Logical name of the related table, e.g. 'account'. */
  entityLogicalName: string;
  /** Its primary key, e.g. 'accountid'. Defaults to `${entityLogicalName}id`. */
  idAttribute?: string;
}

export interface FetchXmlFilterParts {
  /** The <filter> subtree, to AND onto the query's own filter. */
  filterXml: string;
  /** <link-entity> joins, which must be appended to <entity>, never nested in a filter. */
  linkEntityXml: string;
  /** Lookup paths dropped because no join target was supplied — callers should warn. */
  unresolvedPaths: string[];
}

/**
 * Compiles the template into a FetchXML filter subtree, or '' when the expression is
 * empty after pruning. Throws only on a malformed template — callers decide how to log.
 *
 * Templates that reach through a lookup (`company/name like '%{x}%'`) need
 * `buildFetchXmlFilterParts`, which also returns the joins those paths require.
 */
export function buildFetchXmlFilter(template: string, values: Record<string, string>): string {
  return buildFetchXmlFilterParts(template, values).filterXml;
}

/**
 * Compiles the template into the filter subtree AND the joins it depends on.
 *
 * A lookup path is emitted as an OUTER join plus a condition carrying `entityname`, not as
 * a filter nested inside the join. An inner join would restrict every row regardless of
 * where the condition sits in the boolean tree, silently turning `a or company/name like …`
 * into an `and`. Keeping the condition in the parent tree preserves the maker's logic.
 */
export function buildFetchXmlFilterParts(
  template: string,
  values: Record<string, string>,
  joinTargets: Record<string, LookupJoinTarget> = {},
): FetchXmlFilterParts {
  if (!template || !template.trim()) {
    return { filterXml: '', linkEntityXml: '', unresolvedPaths: [] };
  }

  const context: EmitContext = { values, joinTargets, joins: new Map(), unresolvedPaths: [] };
  const filterXml = emit(parseFilterTemplate(template), context);

  return {
    filterXml,
    linkEntityXml: [...context.joins.values()].join(''),
    unresolvedPaths: context.unresolvedPaths,
  };
}

interface EmitContext {
  values: Record<string, string>;
  joinTargets: Record<string, LookupJoinTarget>;
  /** Alias → link-entity XML, so two conditions on one lookup share a single join. */
  joins: Map<string, string>;
  unresolvedPaths: string[];
}

function emit(node: FilterNode, context: EmitContext): string {
  return node.type === 'cond' ? emitCondition(node, context) : emitLogical(node, context);
}

function emitLogical(node: LogicalNode, context: EmitContext): string {
  const parts = node.children.map((child) => emit(child, context)).filter((part) => part !== '');
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `<filter type="${node.operator}">${parts.join('')}</filter>`;
}

function emitCondition(node: ConditionNode, context: EmitContext): string {
  const attribute = resolveAttribute(node.attribute);
  const alias = node.relatedAttribute ? registerJoin(attribute, context) : null;
  if (node.relatedAttribute && !alias) return ''; // unresolved — recorded on the context

  const target = alias ? ` entityname="${alias}"` : '';
  const column = node.relatedAttribute ?? attribute;

  if (node.value.kind === 'null') {
    const operator = node.operator === 'ne' ? 'not-null' : 'null';
    return `<condition${target} attribute="${column}" operator="${operator}"/>`;
  }

  const resolved = resolveValue(node.value, context.values);
  if (resolved === null) return ''; // referenced placeholder empty/invalid → drop condition

  return `<condition${target} attribute="${column}" operator="${node.operator}" value="${resolved}"/>`;
}

/** Adds the join for a lookup attribute once and returns its alias, or null if unresolved. */
function registerJoin(attribute: string, context: EmitContext): string | null {
  const target = context.joinTargets[attribute];
  if (!target?.entityLogicalName) {
    if (!context.unresolvedPaths.includes(attribute)) context.unresolvedPaths.push(attribute);
    return null;
  }

  // FetchXML rejects long aliases, so the attribute name is truncated.
  const alias = `rel_${attribute.replace(/\W/g, '_').slice(0, 15)}`;
  if (!context.joins.has(alias)) {
    const idAttribute = target.idAttribute ?? `${target.entityLogicalName}id`;
    context.joins.set(
      alias,
      `<link-entity name="${target.entityLogicalName}" from="${idAttribute}" `
      + `to="${attribute}" alias="${alias}" link-type="outer"/>`,
    );
  }
  return alias;
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
      const substituted = substitutePlaceholders(value.raw, values);
      return substituted === null ? null : escapeXmlAttribute(substituted);
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
