import postcss from 'postcss';
import safeParser from 'postcss-safe-parser';
import { logger } from './logger.js';
import { config } from '../config/env.js';

// Properties that form designers are permitted to customise.
// Anything outside this set is stripped to prevent layout injection.
const ALLOWED_PROPERTIES = new Set([
  'color', 'background-color', 'background-image', 'border-color', 'outline-color',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'border-width', 'border-style',
  'width', 'max-width', 'min-width', 'height', 'max-height',
  'display', 'flex-direction', 'align-items', 'justify-content', 'flex-wrap', 'grid-template-columns',
  'opacity', 'transition', 'box-shadow', 'text-shadow',
  // z-index is allowed but capped at Z_INDEX_MAX — see isBlockedZIndex
  'z-index',
]);

// At-rules that could load external resources or alter global context.
const BLOCKED_AT_RULES = new Set(['import', 'font-face', 'charset', 'namespace']);

// Selectors that target page-level or non-QDB-namespaced elements.
const DANGEROUS_SELECTOR_PATTERN = /(:root|^html|^body|^\*|#(?!qdb-))/;

// CSS value patterns used in known CSS injection attacks.
const BLOCKED_VALUE_PATTERNS = [
  /expression\s*\(/i,
  /behavior\s*:/i,
  /-ms-behavior\s*:/i,
];

const POSITION_FIXED_OR_ABSOLUTE = /^(fixed|absolute)$/;
const Z_INDEX_MAX = 10;
const URL_EXTRACT_PATTERN = /url\(['"]?([^'")\s]+)['"]?\)/gi;

interface SanitiseContext {
  formCode: string;
  allowedDomains: Set<string>;
}

export class CssSanitiserService {
  /** Sanitises custom CSS from form designers. Returns the cleaned CSS string. */
  sanitise(rawCss: string, formCode: string): string {
    const allowedDomains = this.buildAllowedDomainSet();
    const context: SanitiseContext = { formCode, allowedDomains };
    const root = postcss().process(rawCss, { parser: safeParser }).root;

    root.walk((node) => {
      if (node.type === 'atrule') {
        this.processAtRule(node as postcss.AtRule, context);
      } else if (node.type === 'rule') {
        this.processRule(node as postcss.Rule, context);
      } else if (node.type === 'decl') {
        this.processDeclaration(node as postcss.Declaration, context);
      }
    });

    return root.toString();
  }

  private buildAllowedDomainSet(): Set<string> {
    const raw = config.QDB_CSS_ALLOWED_DOMAINS;
    if (!raw) return new Set<string>();
    return new Set(raw.split(',').map((d) => d.trim()).filter(Boolean));
  }

  private processAtRule(node: postcss.AtRule, context: SanitiseContext): void {
    if (BLOCKED_AT_RULES.has(node.name.toLowerCase())) {
      logger.warn(
        { formCode: context.formCode, atRule: node.name, reason: 'blocked_at_rule' },
        'CSS sanitiser stripped at-rule',
      );
      node.remove();
    }
  }

  private processRule(node: postcss.Rule, context: SanitiseContext): void {
    if (DANGEROUS_SELECTOR_PATTERN.test(node.selector.trim())) {
      logger.warn(
        { formCode: context.formCode, selector: node.selector, reason: 'dangerous_selector' },
        'CSS sanitiser stripped rule',
      );
      node.remove();
    }
  }

  private processDeclaration(node: postcss.Declaration, context: SanitiseContext): void {
    const property = node.prop.toLowerCase();
    const value = node.value;

    if (this.isBlockedByValuePattern(node, context)) return;
    if (this.isBlockedPosition(property, value, node, context)) return;
    if (this.isBlockedZIndex(property, value, node, context)) return;
    if (this.isBlockedUrlDomain(value, node, context)) return;
    if (this.isBlockedProperty(property, node, context)) return;
  }

  private isBlockedByValuePattern(node: postcss.Declaration, context: SanitiseContext): boolean {
    for (const pattern of BLOCKED_VALUE_PATTERNS) {
      if (pattern.test(node.value)) {
        logger.warn(
          { formCode: context.formCode, property: node.prop, reason: 'dangerous_value_pattern' },
          'CSS sanitiser stripped declaration',
        );
        node.remove();
        return true;
      }
    }
    return false;
  }

  private isBlockedPosition(
    property: string,
    value: string,
    node: postcss.Declaration,
    context: SanitiseContext,
  ): boolean {
    if (property === 'position' && POSITION_FIXED_OR_ABSOLUTE.test(value.trim())) {
      logger.warn(
        { formCode: context.formCode, property, value, reason: 'blocked_position' },
        'CSS sanitiser stripped declaration',
      );
      node.remove();
      return true;
    }
    return false;
  }

  private isBlockedZIndex(
    property: string,
    value: string,
    node: postcss.Declaration,
    context: SanitiseContext,
  ): boolean {
    if (property !== 'z-index') return false;
    const numeric = parseInt(value, 10);
    if (!isNaN(numeric) && numeric > Z_INDEX_MAX) {
      logger.warn(
        { formCode: context.formCode, property, value, reason: 'z_index_too_high' },
        'CSS sanitiser stripped declaration',
      );
      node.remove();
      return true;
    }
    return false;
  }

  private isBlockedUrlDomain(
    value: string,
    node: postcss.Declaration,
    context: SanitiseContext,
  ): boolean {
    if (!value.includes('url(')) return false;
    if (context.allowedDomains.size === 0) {
      logger.warn(
        { formCode: context.formCode, property: node.prop, reason: 'url_no_allowed_domains' },
        'CSS sanitiser stripped declaration',
      );
      node.remove();
      return true;
    }

    const urlPattern = new RegExp(URL_EXTRACT_PATTERN.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = urlPattern.exec(value)) !== null) {
      if (!this.isDomainAllowed(match[1], context.allowedDomains)) {
        logger.warn(
          { formCode: context.formCode, property: node.prop, url: match[1], reason: 'url_domain_not_allowed' },
          'CSS sanitiser stripped declaration',
        );
        node.remove();
        return true;
      }
    }
    return false;
  }

  private isDomainAllowed(url: string, allowedDomains: Set<string>): boolean {
    try {
      const parsed = new URL(url);
      return allowedDomains.has(parsed.hostname);
    } catch {
      // Relative URLs and data URIs are not permitted
      return false;
    }
  }

  private isBlockedProperty(
    property: string,
    node: postcss.Declaration,
    context: SanitiseContext,
  ): boolean {
    // Custom properties with the --qdb- prefix are always allowed
    if (property.startsWith('--qdb-')) return false;
    if (ALLOWED_PROPERTIES.has(property)) return false;

    logger.warn(
      { formCode: context.formCode, property, reason: 'property_not_allowed' },
      'CSS sanitiser stripped declaration',
    );
    node.remove();
    return true;
  }
}
