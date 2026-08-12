import type { Config } from '@measured/puck';

/**
 * The block library.
 *
 * Two rules the architecture makes non-negotiable, and they shape every block
 * below:
 *
 *   §3/§9 — bilingual fields are paired on the same block, never on separate
 *   pages, so an author sees both languages while writing one.
 *
 *   §2 — colour comes from theme tokens. There is no free colour input,
 *   because any hex an author types reaches a public page.
 */

export interface Bilingual {
  en: string;
  ar: string;
}

export type PreviewLanguage = 'en' | 'ar' | 'both';

/**
 * Which language the canvas renders (FR-04).
 *
 * Module-scoped rather than passed through Puck's config because a Puck render
 * function receives only its own props. The editor remounts Puck when this
 * changes, which is what makes the switch take effect.
 */
let previewLanguage: PreviewLanguage = 'both';

export function setPreviewLanguage(language: PreviewLanguage): void {
  previewLanguage = language;
}

const showEnglish = () => previewLanguage !== 'ar';
const showArabic = () => previewLanguage !== 'en';

export interface HeroProps {
  heading: Bilingual;
  accent: string;
}

export interface RichTextProps {
  body: Bilingual;
}

/** Approved tokens. A hardcoded list until the token table drives it (FR-11). */
const ACCENT_TOKENS = [
  { label: 'Brand primary', value: 'brand.primary' },
  { label: 'Brand secondary', value: 'brand.secondary' },
  { label: 'Neutral ink', value: 'neutral.ink' },
];

const bilingualFields = (label: string, type: 'text' | 'textarea') =>
  ({
    type: 'object' as const,
    objectFields: {
      en: { type, label: `${label} (English)` },
      ar: { type, label: `${label} (العربية)` },
    },
  });

/**
 * Typed with its component map. The spike carried 24 type errors from
 * annotating `Config` without parameters; naming the props here is what avoids
 * inheriting that.
 */
export type CmsComponents = {
  Hero: HeroProps;
  RichText: RichTextProps;
};

export const config: Config<CmsComponents> = {
  components: {
    Hero: {
      label: 'Hero',
      fields: {
        heading: bilingualFields('Heading', 'text'),
        accent: {
          type: 'select',
          label: 'Accent',
          options: ACCENT_TOKENS,
        },
      },
      defaultProps: {
        heading: { en: 'Heading', ar: 'عنوان' },
        accent: 'brand.primary',
      },
      render: ({ heading, accent }) => (
        <section style={{ padding: '32px 28px', borderBottom: '1px solid #e3e6ea' }}>
          {showEnglish() && (
            <h2 style={{ margin: 0, fontSize: 28, color: tokenColour(accent) }}>{heading?.en}</h2>
          )}
          {showArabic() && (
            <h2
              dir="rtl"
              style={{
                margin: showEnglish() ? '6px 0 0' : 0,
                fontSize: showEnglish() ? 24 : 28,
                color: showEnglish() ? '#5c6470' : tokenColour(accent),
                fontWeight: showEnglish() ? 500 : 700,
              }}
            >
              {heading?.ar}
            </h2>
          )}
        </section>
      ),
    },

    RichText: {
      label: 'Rich text',
      fields: {
        body: bilingualFields('Body', 'textarea'),
      },
      defaultProps: {
        body: { en: '<p>Text</p>', ar: '<p>نص</p>' },
      },
      render: ({ body }) => (
        <section style={{ padding: '22px 28px', borderBottom: '1px solid #e3e6ea' }}>
          {showEnglish() && <div dangerouslySetInnerHTML={{ __html: body?.en ?? '' }} />}
          {showArabic() && (
            <div
              dir="rtl"
              style={
                showEnglish()
                  ? { marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e3e6ea' }
                  : undefined
              }
              dangerouslySetInnerHTML={{ __html: body?.ar ?? '' }}
            />
          )}
        </section>
      ),
    },
  },
};

/**
 * Resolves a token to a colour for the editor preview only. The published page
 * resolves tokens at render time (FR-12), so changing a token value must not
 * require re-versioning a page.
 */
function tokenColour(token: string): string {
  switch (token) {
    case 'brand.secondary':
      return '#1a7f4b';
    case 'neutral.ink':
      return '#1a1d21';
    default:
      return '#7a2c8f';
  }
}
