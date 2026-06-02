import type { RuleGroupType, RuleType } from 'react-querybuilder';

/**
 * Converts a react-querybuilder RuleGroupType to a FetchXML <filter> element string.
 * Example output:
 *   <filter type="and">
 *     <condition attribute="statuscode" operator="eq" value="1"/>
 *   </filter>
 */
export function formatAsFetchXml(query: RuleGroupType): string {
  return renderGroup(query);
}

function renderGroup(group: RuleGroupType): string {
  const combinator = group.combinator === 'or' ? 'or' : 'and';
  const children = group.rules
    .map((rule) => {
      if ('rules' in rule) return renderGroup(rule as RuleGroupType);
      return renderRule(rule as RuleType);
    })
    .filter(Boolean)
    .join('\n  ');

  return `<filter type="${combinator}">\n  ${children}\n</filter>`;
}

function renderRule(rule: RuleType): string {
  const attribute = rule.field;
  const operator = mapOperator(rule.operator);
  const value = rule.value as string | number | boolean | undefined;

  if (operator === 'null' || operator === 'not-null') {
    return `<condition attribute="${escapeXml(attribute)}" operator="${operator}"/>`;
  }

  if (value === undefined || value === '') {
    return '';
  }

  return `<condition attribute="${escapeXml(attribute)}" operator="${operator}" value="${escapeXml(String(value))}"/>`;
}

function mapOperator(op: string): string {
  const operatorMap: Record<string, string> = {
    '=': 'eq',
    '!=': 'ne',
    '>': 'gt',
    '<': 'lt',
    '>=': 'ge',
    '<=': 'le',
    'contains': 'like',
    'doesNotContain': 'not-like',
    'beginsWith': 'begins-with',
    'endsWith': 'ends-with',
    'null': 'null',
    'notNull': 'not-null',
    'in': 'in',
    'notIn': 'not-in',
  };
  return operatorMap[op] ?? op;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validates FetchXML string by parsing with DOMParser.
 * Returns null if valid, or an error message if invalid.
 */
export function validateFetchXml(xml: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<root>${xml}</root>`, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return parseError.textContent ?? 'Invalid FetchXML';
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Failed to parse FetchXML';
  }
}
