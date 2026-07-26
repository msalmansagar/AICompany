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

/**
 * Compiles the template into a FetchXML filter subtree, or '' when the expression is
 * empty after pruning. Throws only on a malformed template — callers decide how to log.
 */
export function buildFetchXmlFilter(template: string, values: Record<string, string>): string {
  if (!template || !template.trim()) return '';
  return emit(parseFilterTemplate(template), values);
}

function emit(node: FilterNode, values: Record<string, string>): string {
  return node.type === 'cond' ? emitCondition(node, values) : emitLogical(node, values);
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
