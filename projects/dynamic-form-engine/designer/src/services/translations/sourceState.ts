// How each existing translation stands against the English it was made from.
//
// Three states, not two. Blank means compared and current; UNKNOWN means there is no snapshot
// to compare against, which is not the same claim. Letting an uncomparable row render blank
// tells a translator it was checked when it never was — most of the translations in an org
// predate snapshots, so that is the common case rather than the edge one.
//
// Mirrors scripts/translations-export.mjs.

import type { ExistingTranslation } from './ExistingTranslationsReader';
import { translationKey, type TranslatableString } from './translatableSpec';

export interface SourceState {
  /** Languages whose translation was made from English that has since changed. */
  readonly changed: readonly string[];
  /** Languages whose translation carries no snapshot, so it cannot be compared. */
  readonly unverified: readonly string[];
}

/**
 * A language with no translation at all appears in neither list: there is nothing to be stale
 * about, and the empty cell already says "translate me".
 */
export function sourceStateOf(
  row: TranslatableString,
  languageCodes: readonly string[],
  existing: ReadonlyMap<string, ExistingTranslation>,
): SourceState {
  const changed: string[] = [];
  const unverified: string[] = [];

  for (const code of languageCodes) {
    const found = existing.get(translationKey(row.entity, row.recordId, row.field, code));
    if (!found?.value) continue;

    if (!found.sourceSnapshot) unverified.push(code);
    else if (found.sourceSnapshot !== row.source) changed.push(code);
  }

  return { changed, unverified };
}

/** Both states can appear on one row once the org has more than one language. */
export function describeSourceState({ changed, unverified }: SourceState): string {
  const parts: string[] = [];
  if (changed.length) parts.push(`YES (${changed.join(', ')})`);
  if (unverified.length) parts.push(`UNKNOWN (${unverified.join(', ')})`);
  return parts.join('  ');
}
