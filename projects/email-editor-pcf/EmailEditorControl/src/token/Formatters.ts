/**
 * Formatters.ts
 * Pure formatting functions for token modifier resolution.
 * All use Intl APIs — no eval, no date libraries.
 */

export class Formatters {
  /**
   * Format a value using a format spec string: "date:dd MMM yyyy", "money:en-PK:PKR", etc.
   * Returns the formatted string, or the original value stringified if spec is unrecognised.
   */
  public applyFormat(value: unknown, spec: string, locale: string, currency: string): string {
    if (value === null || value === undefined) return '';

    const colonIdx = spec.indexOf(':');
    if (colonIdx === -1) return String(value);

    const specType = spec.slice(0, colonIdx);
    const specArg = spec.slice(colonIdx + 1);

    switch (specType) {
      case 'date':   return this.formatDate(value, specArg, locale);
      case 'money':  return this.formatMoney(value, specArg, locale, currency);
      case 'number': return this.formatNumber(value, specArg, locale);
      default:       return String(value);
    }
  }

  public applyCase(value: string, kind: 'upper' | 'lower' | 'title'): string {
    switch (kind) {
      case 'upper': return value.toUpperCase();
      case 'lower': return value.toLowerCase();
      case 'title': return value.replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
  }

  public escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private formatDate(value: unknown, pattern: string, locale: string): string {
    const date = this.toDate(value);
    if (!date) return String(value);

    // Map common pattern tokens to Intl options
    const options: Intl.DateTimeFormatOptions = this.patternToIntlOptions(pattern);
    try {
      return new Intl.DateTimeFormat(locale || 'en', options).format(date);
    } catch {
      return date.toLocaleDateString();
    }
  }

  private formatMoney(
    value: unknown,
    specArg: string,
    defaultLocale: string,
    defaultCurrency: string
  ): string {
    const num = parseFloat(String(value));
    if (isNaN(num)) return String(value);

    // specArg format: "en-PK:PKR" or just "PKR"
    const parts = specArg.split(':');
    const locale   = parts.length >= 2 ? parts[0] : defaultLocale;
    const currCode = parts.length >= 2 ? parts[1] : (parts[0] || defaultCurrency);

    try {
      return new Intl.NumberFormat(locale || 'en', {
        style: 'currency',
        currency: currCode || 'USD',
        minimumFractionDigits: 2
      }).format(num);
    } catch {
      return num.toFixed(2);
    }
  }

  private formatNumber(value: unknown, pattern: string, locale: string): string {
    const num = parseFloat(String(value));
    if (isNaN(num)) return String(value);

    // pattern: "0.00" → 2 fraction digits
    const fractionMatch = pattern.match(/\.(\d+)/);
    const fractionDigits = fractionMatch ? fractionMatch[1].length : 0;

    try {
      return new Intl.NumberFormat(locale || 'en', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
      }).format(num);
    } catch {
      return num.toFixed(fractionDigits);
    }
  }

  private toDate(value: unknown): Date | null {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  /**
   * Very lightweight pattern → Intl option mapper.
   * Supports: yyyy/yy, MMM/MM/M, dd/d, HH/H, mm, ss
   */
  private patternToIntlOptions(pattern: string): Intl.DateTimeFormatOptions {
    const options: Intl.DateTimeFormatOptions = {};
    if (/yyyy/.test(pattern)) options.year = 'numeric';
    else if (/yy/.test(pattern)) options.year = '2-digit';
    if (/MMM/.test(pattern)) options.month = 'short';
    else if (/MMMM/.test(pattern)) options.month = 'long';
    else if (/MM|M/.test(pattern)) options.month = '2-digit';
    if (/dd|d/.test(pattern)) options.day = '2-digit';
    if (/HH|H/.test(pattern)) options.hour = '2-digit';
    if (/mm/.test(pattern)) options.minute = '2-digit';
    if (/ss/.test(pattern)) options.second = '2-digit';
    return options;
  }
}
