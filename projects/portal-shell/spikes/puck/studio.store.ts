import type { Data } from '@puckeditor/core';

/**
 * Page store for the studio.
 *
 * Backed by localStorage so the full CMS loop is demonstrable end to end:
 * create → edit → publish → view → re-edit. Earlier spike pages logged
 * `onPublish` and threw the result away, which meant edits vanished on reload
 * and the editor only ever showed half the system.
 *
 * The interface is deliberately the shape a Dataverse-backed store would have.
 * Swapping localStorage for `qdb_PublishPage` / `qdb_GetPublishedPageJson`
 * changes this file and nothing else.
 */

const STORAGE_KEY = 'qdb.studio.pages.v1';

export interface PageRecord {
  slug: string;
  titleEn: string;
  titleAr: string;
  /** ISO string. Assigned by the caller so this module stays pure-ish. */
  modified: string;
  /** Draft tree — what the editor loads. */
  draft: Data;
  /** Last published tree — what visitors see. Null until first publish. */
  published: Data | null;
}

export const EMPTY_PAGE: Data = { root: { props: { content: [] } }, content: [], zones: {} };

function readAll(): PageRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PageRecord[]) : [];
  } catch {
    // A corrupt payload must not brick the studio — start clean rather than throw.
    return [];
  }
}

function writeAll(pages: PageRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
}

export function listPages(): PageRecord[] {
  return readAll().sort((a, b) => b.modified.localeCompare(a.modified));
}

export function getPage(slug: string): PageRecord | undefined {
  return readAll().find((p) => p.slug === slug);
}

/** Creates a page. Returns null when the slug is already taken. */
export function createPage(input: {
  slug: string;
  titleEn: string;
  titleAr: string;
  now: string;
}): PageRecord | null {
  const pages = readAll();
  if (pages.some((p) => p.slug === input.slug)) return null;

  const record: PageRecord = {
    slug: input.slug,
    titleEn: input.titleEn,
    titleAr: input.titleAr,
    modified: input.now,
    draft: EMPTY_PAGE,
    published: null,
  };
  writeAll([...pages, record]);
  return record;
}

export function saveDraft(slug: string, draft: Data, now: string): void {
  writeAll(readAll().map((p) => (p.slug === slug ? { ...p, draft, modified: now } : p)));
}

/**
 * Publish copies the draft to `published`. Keeping the two separate is what
 * makes "an admin is editing" and "a citizen is reading" independent — the
 * same split `qdb_PublishPage` enforces against the render cache.
 */
export function publishPage(slug: string, draft: Data, now: string): void {
  writeAll(
    readAll().map((p) =>
      p.slug === slug ? { ...p, draft, published: draft, modified: now } : p,
    ),
  );
}

export function deletePage(slug: string): void {
  writeAll(readAll().filter((p) => p.slug !== slug));
}

/** Lowercase, hyphenated, URL-safe. Latin and Arabic both survive. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
