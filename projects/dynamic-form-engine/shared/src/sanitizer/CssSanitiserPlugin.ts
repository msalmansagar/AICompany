// Structural node interfaces — duck-typed so this plugin works with any PostCSS
// version at runtime, without creating a hard type dependency on a specific install.

interface AnyNode {
  remove(): void;
  parent?: unknown;
}

interface AnyAtRule extends AnyNode {
  name: string;
  walkDecls(prop: string, cb: (d: AnyDeclaration) => void): void;
}

interface AnyRule extends AnyNode {
  selector: string;
}

interface AnyDeclaration extends AnyNode {
  prop: string;
  value: string;
}

interface AnyRoot {
  walkAtRules(cb: (a: AnyAtRule) => void | false): void;
  walkRules(cb: (r: AnyRule) => void | false): void;
  walkDecls(cb: (d: AnyDeclaration) => void | false): void;
}

export interface QdbCssPlugin {
  readonly postcssPlugin: string;
  Once(root: unknown): void;
}

const BLOCKED_AT_RULE_NAMES = new Set(['import', 'charset', 'namespace']);
const BEHAVIOR_PROPERTY_PATTERN = /^(-\w+-)?behavior$/i;
const BLOCKED_VALUE_PATTERNS: readonly RegExp[] = [/expression\s*\(/i, /javascript:/i];
const GLOBAL_ELEMENT_PATTERN = /^\s*(?:html|body|\*|:root)(?:\s|:|$)/i;
const QDB_SCOPE_PATTERN = /\.qdb-/;
const URL_VALUE_PATTERN = /url\(['"]?([^'")\s]+)['"]?\)/gi;

export function createCssSanitiserPlugin(allowedDomains: readonly string[]): QdbCssPlugin {
  const domainSet: ReadonlySet<string> = new Set(allowedDomains);
  return {
    postcssPlugin: 'qdb-css-sanitiser',
    Once(root: unknown): void {
      const typedRoot = root as AnyRoot;
      sanitiseAtRules(typedRoot, domainSet);
      sanitiseRules(typedRoot);
      sanitiseDeclarations(typedRoot, domainSet);
    },
  };
}

function sanitiseAtRules(root: AnyRoot, allowedDomains: ReadonlySet<string>): void {
  root.walkAtRules((atRule: AnyAtRule) => {
    const name = atRule.name.toLowerCase();
    if (BLOCKED_AT_RULE_NAMES.has(name)) {
      atRule.remove();
      return;
    }
    if (name === 'font-face') {
      processFontFaceBlock(atRule, allowedDomains);
    }
  });
}

function processFontFaceBlock(atRule: AnyAtRule, allowedDomains: ReadonlySet<string>): void {
  let hasSrc = false;
  let allSrcsAllowed = true;
  atRule.walkDecls('src', (decl: AnyDeclaration) => {
    hasSrc = true;
    if (!isFontFaceSrcAllowed(decl.value, allowedDomains)) {
      allSrcsAllowed = false;
    }
  });
  if (!hasSrc || !allSrcsAllowed) {
    atRule.remove();
  }
}

function isFontFaceSrcAllowed(srcValue: string, allowedDomains: ReadonlySet<string>): boolean {
  const pattern = new RegExp(URL_VALUE_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;
  let foundUrl = false;
  while ((match = pattern.exec(srcValue)) !== null) {
    foundUrl = true;
    if (!isUrlDomainAllowed(match[1], allowedDomains)) {
      return false;
    }
  }
  // local() references with no url() are safe
  return !foundUrl || allowedDomains.size > 0;
}

function sanitiseRules(root: AnyRoot): void {
  root.walkRules((rule: AnyRule) => {
    // Keyframe steps (0%, from, to) inside @keyframes must not be stripped
    const parent = rule.parent as { name?: string } | undefined;
    if (parent?.name) {
      const parentName = parent.name.toLowerCase();
      if (parentName === 'keyframes' || parentName.endsWith('-keyframes')) {
        return;
      }
    }
    if (hasUnsafeSelector(rule.selector)) {
      rule.remove();
    }
  });
}

function hasUnsafeSelector(selector: string): boolean {
  const parts = selector.split(',').map((s) => s.trim());
  return parts.some((part) => {
    if (GLOBAL_ELEMENT_PATTERN.test(part)) return true;
    return !QDB_SCOPE_PATTERN.test(part);
  });
}

function sanitiseDeclarations(root: AnyRoot, allowedDomains: ReadonlySet<string>): void {
  root.walkDecls((decl: AnyDeclaration) => {
    if (BEHAVIOR_PROPERTY_PATTERN.test(decl.prop)) {
      decl.remove();
      return;
    }
    if (hasBlockedValuePattern(decl.value)) {
      decl.remove();
      return;
    }
    if (containsBlockedUrl(decl.value, allowedDomains)) {
      decl.remove();
    }
  });
}

function hasBlockedValuePattern(value: string): boolean {
  return BLOCKED_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function containsBlockedUrl(value: string, allowedDomains: ReadonlySet<string>): boolean {
  if (!value.includes('url(')) return false;
  const pattern = new RegExp(URL_VALUE_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (!isUrlDomainAllowed(match[1], allowedDomains)) {
      return true;
    }
  }
  return false;
}

function isUrlDomainAllowed(url: string, allowedDomains: ReadonlySet<string>): boolean {
  if (allowedDomains.size === 0) return false;
  try {
    const parsed = new URL(url);
    return allowedDomains.has(parsed.hostname);
  } catch {
    return false;
  }
}
