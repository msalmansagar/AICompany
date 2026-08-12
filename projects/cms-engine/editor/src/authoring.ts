/**
 * Authoring helpers that are pure functions of the page data — no Dataverse,
 * no React — so they can be reasoned about and tested on their own.
 */

/** Bilingual props are objects keyed by locale. */
const LOCALE_KEYS = ['en', 'ar'];

/**
 * Derives a URL slug from a title (FR-01).
 *
 * Latin text is lowercased and hyphenated. **Arabic is kept as-is** rather than
 * transliterated: the pack's open question on Arabic addresses recommends
 * keeping Arabic, and transliterating here would quietly decide it. Percent
 * encoding is the browser's job, not ours.
 */
export function deriveSlug(title: string): string {
  return (title ?? '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export interface MissingTranslation {
  block: string;
  field: string;
}

/**
 * Finds bilingual fields with an English value and no Arabic (FR-08).
 *
 * Reported before publish rather than blocking it: half-translated pages are a
 * problem the BRD names, but an author may legitimately publish English first.
 * Telling them is the requirement; deciding for them is not.
 */
export function findMissingArabic(data: unknown): MissingTranslation[] {
  const page = data as { content?: Array<{ type?: string; props?: Record<string, unknown> }> };
  const missing: MissingTranslation[] = [];

  for (const block of page?.content ?? []) {
    for (const [field, value] of Object.entries(block.props ?? {})) {
      if (!isBilingual(value)) continue;
      const pair = value as Record<string, string>;
      if (hasText(pair.en) && !hasText(pair.ar)) {
        missing.push({ block: block.type ?? 'block', field });
      }
    }
  }

  return missing;
}

function isBilingual(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value as object);
  return keys.length > 0 && keys.every((key) => LOCALE_KEYS.includes(key));
}

/** Markup with no words is not a translation. */
function hasText(value: string | undefined): boolean {
  if (!value) return false;
  return value.replace(/<[^>]*>/g, '').trim().length > 0;
}
