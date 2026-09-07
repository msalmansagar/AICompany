/**
 * Turns a route's FetchXML into something a person can read.
 *
 * The stored filter is a query, and a query is not a sentence. Today the designer shows
 * either the raw XML or a comma-joined one-liner that drops the and/or joins and any
 * nesting — so two rules that mean quite different things can print identically. This
 * keeps the structure: joins are stated, nested groups are indented, and operators read
 * as symbols rather than FetchXML keywords.
 *
 * The parse is split from the formatting on purpose. Everything with logic in it — the
 * traversal and the rendering — works on plain objects and is tested; only the last
 * step needs a DOM, which the browser supplies and Node does not.
 */

/** How a FetchXML operator reads to a person. */
const OPERATOR_TEXT: Record<string, string> = {
  eq: '=', ne: '≠', neq: '≠', lt: '<', le: '≤', gt: '>', ge: '≥',
  like: 'contains', 'not-like': 'does not contain',
  'begins-with': 'begins with', 'not-begin-with': 'does not begin with',
  'ends-with': 'ends with', 'not-end-with': 'does not end with',
  null: 'is empty', 'not-null': 'is not empty',
  in: 'is any of', 'not-in': 'is none of',
  between: 'is between', 'not-between': 'is not between',
  'eq-userid': 'is the current user', 'ne-userid': 'is not the current user',
  on: 'on', 'on-or-after': 'on or after', 'on-or-before': 'on or before',
  today: 'is today', yesterday: 'is yesterday', tomorrow: 'is tomorrow',
  'this-month': 'is this month', 'this-year': 'is this year',
};

/** One comparison inside a filter. */
export interface ReadableCondition {
  readonly attribute: string;
  readonly operator: string;
  readonly values: readonly string[];
}

/** Conditions joined by and/or, possibly containing further groups. */
export interface ReadableGroup {
  readonly join: 'and' | 'or';
  readonly items: readonly ReadableItem[];
}

export type ReadableItem = ReadableCondition | ReadableGroup;

/** Narrows an item to a nested group. */
export function isGroup(item: ReadableItem): item is ReadableGroup {
  return 'items' in item;
}

/** The minimum of a DOM element this module reads, so it can be tested without a DOM. */
export interface FilterElement {
  readonly tagName: string;
  readonly textContent: string;
  getAttribute(name: string): string | null;
  readonly children: readonly FilterElement[];
}

/**
 * Walks a `<filter>` element into the readable structure.
 * @param element the filter element, or any element containing one
 * @returns the structure, or null when there is no filter to describe
 */
export function readFilterElement(element: FilterElement | null): ReadableGroup | null {
  const filter = element && findFilter(element);
  if (!filter) return null;
  const items = filter.children.map(readItem).filter((item): item is ReadableItem => item !== null);
  if (items.length === 0) return null;
  return { join: filter.getAttribute('type') === 'or' ? 'or' : 'and', items };
}

/** Depth-first search for the outermost filter, so a whole fetch can be passed in. */
function findFilter(element: FilterElement): FilterElement | null {
  if (element.tagName.toLowerCase() === 'filter') return element;
  for (const child of element.children) {
    const found = findFilter(child);
    if (found) return found;
  }
  return null;
}

function readItem(element: FilterElement): ReadableItem | null {
  const tag = element.tagName.toLowerCase();
  if (tag === 'filter') return readFilterElement(element);
  if (tag !== 'condition') return null;
  return {
    attribute: element.getAttribute('attribute') ?? '',
    operator: element.getAttribute('operator') ?? '',
    values: readValues(element),
  };
}

/** A condition carries its value on the attribute, or as <value> children for in/between. */
function readValues(condition: FilterElement): string[] {
  const inline = condition.getAttribute('value');
  if (inline !== null && inline !== '') return [inline];
  return condition.children
    .filter((child) => child.tagName.toLowerCase() === 'value')
    .map((child) => child.textContent.trim())
    .filter((text) => text !== '');
}

/**
 * Renders one condition as a phrase.
 * @param condition the condition to describe
 * @param nameOf optional lookup turning a logical name into its display name
 * @returns a phrase such as "Approved Amount > 500000"
 */
export function describeCondition(
  condition: ReadableCondition,
  nameOf?: (attribute: string) => string
): string {
  const field = nameOf?.(condition.attribute) || condition.attribute;
  const operator = OPERATOR_TEXT[condition.operator] ?? condition.operator;
  if (condition.values.length === 0) return `${field} ${operator}`;
  if (condition.values.length === 1) return `${field} ${operator} ${condition.values[0]}`;
  const joiner = condition.operator.includes('between') ? ' and ' : ', ';
  return `${field} ${operator} ${condition.values.join(joiner)}`;
}

/**
 * Renders a filter as indented lines, one per condition, with the join stated.
 * @param group the parsed filter
 * @param nameOf optional lookup turning a logical name into its display name
 * @returns lines ready to print in a monospaced block
 */
export function formatReadableFilter(
  group: ReadableGroup,
  nameOf?: (attribute: string) => string
): string[] {
  return renderGroup(group, 0, nameOf);
}

function renderGroup(group: ReadableGroup, depth: number, nameOf?: (a: string) => string): string[] {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  group.items.forEach((item, index) => {
    const prefix = index === 0 ? '' : `${group.join.toUpperCase()} `;
    if (isGroup(item)) {
      lines.push(`${pad}${prefix}(`);
      lines.push(...renderGroup(item, depth + 1, nameOf));
      lines.push(`${pad})`);
      return;
    }
    lines.push(`${pad}${prefix}${describeCondition(item, nameOf)}`);
  });
  return lines;
}

/**
 * Parses a stored FetchXML filter into the readable structure.
 *
 * Browser only - Node has no DOMParser. Everything downstream of this call works on
 * plain objects and is covered by tests; this function is the thin DOM seam.
 *
 * @param xml the stored filter, which may be a bare filter or a whole fetch
 * @returns the structure, or null when there is nothing readable to show
 */
export function parseFetchXmlFilter(xml: string | null | undefined): ReadableGroup | null {
  if (!xml?.trim()) return null;
  try {
    const doc = new DOMParser().parseFromString(xml.trim(), 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    return readFilterElement(toFilterElement(doc.documentElement));
  } catch {
    return null;
  }
}

/** Presents a DOM element through the small surface this module reads. */
function toFilterElement(element: Element): FilterElement {
  return {
    tagName: element.tagName,
    textContent: element.textContent ?? '',
    getAttribute: (name) => element.getAttribute(name),
    get children() {
      return Array.from(element.children).map(toFilterElement);
    },
  };
}
