/**
 * Context passed to the token resolution endpoint at SSR time.
 *
 * layout-level calls omit service/category/componentSlug (covers Levels 1 and 2 only).
 * Widget-level calls include them to capture Level 3 and Level 4 overrides (ADR-003-004).
 */
export interface TokenResolutionContext {
  renderTarget: 'portal' | 'admin' | 'mobile';
  locale: 'ar' | 'en' | null;
  service?: string;
  category?: string;
  componentSlug?: string;
}
