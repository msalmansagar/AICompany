import type { Config } from '@puckeditor/core';
import { Icon } from './reyada.icons';
import { iconField, mediaField, colorField, surfaceField } from './puck.fields';
import { resolveMedia } from './media.library';
import { colorVar } from './theme.tokens';

/**
 * Studio component library — the full editable palette.
 *
 * Covers layout (Section, Columns, Spacer, Divider), content (Heading, Text,
 * Image, Icon), actions (Button, ButtonGroup), interactive (Tabs, Accordion)
 * and data display (StatCard, Callout).
 *
 * Two rules hold throughout:
 *   - colour is a TOKEN SLUG, never a hex — see theme.tokens.ts
 *   - interactive components are CSS-driven, never React state
 *
 * The second rule matters inside a page builder. Puck re-renders a component
 * whenever its props change, which resets `useState`. Tabs here are radio
 * inputs and Accordion is <details> — both keep their open state across
 * re-renders and both work with the keyboard for free.
 */

type Locale = 'en' | 'ar';

const localeOf = (m: Record<string, unknown> | undefined): Locale =>
  m?.['locale'] === 'en' ? 'en' : 'ar';

const dirOf = (l: Locale): 'rtl' | 'ltr' => (l === 'ar' ? 'rtl' : 'ltr');

const t = (l: Locale, en: string, ar: string): string => {
  const primary = l === 'en' ? en : ar;
  return primary?.trim() ? primary : l === 'en' ? ar : en;
};

const pair = (label: string) => ({
  [`${label}En`]: { type: 'text' as const, label: `${label} (EN)` },
  [`${label}Ar`]: { type: 'text' as const, label: `${label} (AR)` },
});

const ALIGN_FIELD = {
  type: 'radio' as const,
  label: 'المحاذاة (Align)',
  options: [
    { label: 'Start', value: 'start' },
    { label: 'Center', value: 'center' },
    { label: 'End', value: 'end' },
  ],
};

export const studioConfig: Config = {
  root: {
    fields: { content: { type: 'slot' } },
    render: ({ content: Content }) => (
      <div className="st-page">
        <Content />
      </div>
    ),
  },

  categories: {
    layout: { title: 'Layout — التخطيط', components: ['Section', 'Columns', 'Spacer', 'Divider'] },
    content: { title: 'Content — المحتوى', components: ['Heading', 'Text', 'Image', 'IconBlock'] },
    actions: { title: 'Actions — الإجراءات', components: ['Button', 'ButtonGroup'] },
    interactive: { title: 'Interactive — تفاعلي', components: ['Tabs', 'Accordion'] },
    data: { title: 'Data — بيانات', components: ['StatCard', 'Callout'] },
  },

  components: {
    // ============================================================== LAYOUT ==
    Section: {
      label: 'قسم (Section)',
      fields: {
        background: surfaceField('الخلفية (Background)'),
        padding: {
          type: 'radio',
          label: 'الحشو (Padding)',
          options: [
            { label: 'S', value: '16px' },
            { label: 'M', value: '32px' },
            { label: 'L', value: '56px' },
          ],
        },
        maxWidth: {
          type: 'radio',
          label: 'العرض (Width)',
          options: [
            { label: 'Narrow', value: '760px' },
            { label: 'Wide', value: '1180px' },
            { label: 'Full', value: '100%' },
          ],
        },
        items: { type: 'slot' },
      },
      defaultProps: { background: 'rey-surface', padding: '32px', maxWidth: '1180px' },
      render: ({ background, padding, maxWidth, items: Items }) => (
        <section style={{ background: colorVar(background, 'rey-surface'), paddingBlock: padding }}>
          <div style={{ maxInlineSize: maxWidth, marginInline: 'auto', paddingInline: '20px' }}>
            <Items />
          </div>
        </section>
      ),
    },

    Columns: {
      label: 'أعمدة (Columns)',
      fields: {
        count: {
          type: 'radio',
          label: 'العدد (Count)',
          options: [
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
          ],
        },
        gap: {
          type: 'radio',
          label: 'الفراغ (Gap)',
          options: [
            { label: 'S', value: '12px' },
            { label: 'M', value: '20px' },
            { label: 'L', value: '32px' },
          ],
        },
        items: { type: 'slot' },
      },
      defaultProps: { count: '3', gap: '20px' },
      render: ({ count, gap, items: Items }) => (
        <Items
          className="st-columns"
          style={{
            display: 'grid',
            // minmax(0,…) lets tracks shrink; without it long content widens
            // the grid past its container — the recurring trap in this codebase.
            gridTemplateColumns: `repeat(auto-fit, minmax(min(200px, 100%), 1fr))`,
            gap,
            ['--st-col-count' as string]: count,
          }}
        />
      ),
    },

    Spacer: {
      label: 'فراغ (Spacer)',
      fields: {
        size: {
          type: 'radio',
          label: 'الارتفاع (Height)',
          options: [
            { label: 'S', value: '16px' },
            { label: 'M', value: '40px' },
            { label: 'L', value: '80px' },
          ],
        },
      },
      defaultProps: { size: '40px' },
      render: ({ size }) => <div style={{ blockSize: size }} aria-hidden />,
    },

    Divider: {
      label: 'فاصل (Divider)',
      fields: { color: surfaceField('اللون (Colour)') },
      defaultProps: { color: 'rey-border' },
      render: ({ color }) => (
        <hr
          style={{
            border: 0,
            borderBlockStart: `1px solid ${colorVar(color, 'rey-border')}`,
            marginBlock: '24px',
          }}
        />
      ),
    },

    // ============================================================= CONTENT ==
    Heading: {
      label: 'عنوان (Heading)',
      fields: {
        ...pair('text'),
        level: {
          type: 'radio',
          label: 'المستوى (Level)',
          options: [
            { label: 'H1', value: '1' },
            { label: 'H2', value: '2' },
            { label: 'H3', value: '3' },
          ],
        },
        color: colorField('اللون (Colour)'),
        align: ALIGN_FIELD,
      },
      defaultProps: {
        textEn: 'Heading', textAr: 'عنوان',
        level: '2', color: 'rey-ink', align: 'start',
      },
      render: ({ textEn, textAr, level, color, align, puck }) => {
        const locale = localeOf(puck?.metadata);
        const Tag = (`h${level}` as unknown) as 'h2';
        const size = { '1': '34px', '2': '26px', '3': '19px' }[level as string] ?? '26px';
        return (
          <Tag
            style={{
              margin: '0 0 12px',
              fontSize: size,
              fontWeight: 700,
              color: colorVar(color, 'rey-ink'),
              textAlign: align,
            }}
          >
            {t(locale, textEn, textAr)}
          </Tag>
        );
      },
    },

    Text: {
      label: 'نص (Text)',
      fields: {
        bodyEn: { type: 'textarea', label: 'النص (EN)' },
        bodyAr: { type: 'textarea', label: 'النص (AR)' },
        color: colorField('اللون (Colour)'),
        align: ALIGN_FIELD,
        size: {
          type: 'radio',
          label: 'الحجم (Size)',
          options: [
            { label: 'S', value: '13px' },
            { label: 'M', value: '15px' },
            { label: 'L', value: '18px' },
          ],
        },
      },
      defaultProps: {
        bodyEn: 'Body text.', bodyAr: 'نص الفقرة.',
        color: 'rey-muted', align: 'start', size: '15px',
      },
      render: ({ bodyEn, bodyAr, color, align, size, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <p
            style={{
              margin: '0 0 14px',
              fontSize: size,
              lineHeight: 1.7,
              color: colorVar(color, 'rey-muted'),
              textAlign: align,
            }}
          >
            {t(locale, bodyEn, bodyAr)}
          </p>
        );
      },
    },

    Image: {
      label: 'صورة (Image)',
      fields: {
        media: mediaField('الصورة (Image)'),
        height: {
          type: 'radio',
          label: 'الارتفاع (Height)',
          options: [
            { label: 'S', value: '140px' },
            { label: 'M', value: '220px' },
            { label: 'L', value: '340px' },
          ],
        },
        radius: {
          type: 'radio',
          label: 'الاستدارة (Radius)',
          options: [
            { label: 'None', value: '0' },
            { label: 'M', value: '10px' },
            { label: 'Round', value: '999px' },
          ],
        },
        ...pair('alt'),
      },
      defaultProps: { media: 'tech-ai', height: '220px', radius: '10px', altEn: 'Image', altAr: 'صورة' },
      render: ({ media, height, radius, altEn, altAr, puck }) => {
        const locale = localeOf(puck?.metadata);
        return (
          <div
            role="img"
            aria-label={t(locale, altEn, altAr)}
            style={{
              blockSize: height,
              borderRadius: radius,
              background: resolveMedia(media),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              marginBlockEnd: '14px',
            }}
          />
        );
      },
    },

    IconBlock: {
      label: 'أيقونة (Icon)',
      fields: {
        icon: iconField('الأيقونة (Icon)'),
        color: colorField('اللون (Colour)'),
        background: surfaceField('الخلفية (Background)'),
        size: {
          type: 'radio',
          label: 'الحجم (Size)',
          options: [
            { label: 'S', value: '18' },
            { label: 'M', value: '26' },
            { label: 'L', value: '38' },
          ],
        },
        ...pair('label'),
        align: ALIGN_FIELD,
      },
      defaultProps: {
        icon: 'award', color: 'rey-green-dark', background: 'rey-green-soft',
        size: '26', labelEn: '', labelAr: '', align: 'start',
      },
      render: ({ icon, color, background, size, labelEn, labelAr, align, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        const label = t(locale, labelEn, labelAr);
        const justify = align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';
        return (
          <div style={{ display: 'flex', justifyContent: justify, marginBlockEnd: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  inlineSize: Number(size) * 1.9,
                  blockSize: Number(size) * 1.9,
                  borderRadius: '50%',
                  background: colorVar(background, 'rey-green-soft'),
                  color: colorVar(color, 'rey-green-dark'),
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name={icon} size={Number(size)} dir={dir} />
              </span>
              {label ? <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span> : null}
            </div>
          </div>
        );
      },
    },

    // ============================================================= ACTIONS ==
    Button: {
      label: 'زر (Button)',
      fields: {
        ...pair('label'),
        variant: {
          type: 'select',
          label: 'النمط (Variant)',
          options: [
            { label: 'Primary (green)', value: 'primary' },
            { label: 'Navy', value: 'navy' },
            { label: 'Outline', value: 'outline' },
            { label: 'Outline green', value: 'outline-green' },
          ],
        },
        icon: iconField('الأيقونة (Icon)'),
        href: { type: 'text', label: 'الرابط (Link)' },
        fullWidth: {
          type: 'radio',
          label: 'العرض (Width)',
          options: [
            { label: 'Auto', value: 'auto' },
            { label: 'Full', value: 'full' },
          ],
        },
      },
      defaultProps: {
        labelEn: 'Button', labelAr: 'زر',
        variant: 'primary', icon: 'chevron', href: '#', fullWidth: 'auto',
      },
      render: ({ labelEn, labelAr, variant, icon, href, fullWidth, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        const label = t(locale, labelEn, labelAr);
        const className = 'rey-btn';
        const dataAuto = fullWidth === 'auto' ? 'true' : undefined;

        // While editing, a real anchor would navigate the admin out of the
        // canvas — render an inert span instead. Shipping this guard as a
        // single component is why Button exists rather than raw links.
        if (puck?.isEditing) {
          return (
            <span className={className} data-variant={variant} data-auto={dataAuto}>
              {label}
              {icon ? <Icon name={icon} size={16} dir={dir} /> : null}
            </span>
          );
        }
        return (
          <a className={className} data-variant={variant} data-auto={dataAuto} href={href || '#'}>
            {label}
            {icon ? <Icon name={icon} size={16} dir={dir} /> : null}
          </a>
        );
      },
    },

    ButtonGroup: {
      label: 'مجموعة أزرار (Button Group)',
      fields: { align: ALIGN_FIELD, items: { type: 'slot' } },
      defaultProps: { align: 'start' },
      render: ({ align, items: Items }) => (
        <Items
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            marginBlockEnd: '14px',
            justifyContent: align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start',
          }}
        />
      ),
    },

    // ========================================================= INTERACTIVE ==
    Tabs: {
      label: 'تبويبات (Tabs)',
      fields: {
        accent: colorField('لون التبويب (Accent)'),
        tabs: {
          type: 'array',
          label: 'التبويبات',
          arrayFields: {
            ...pair('label'),
            icon: iconField('الأيقونة'),
            bodyEn: { type: 'textarea', label: 'المحتوى (EN)' },
            bodyAr: { type: 'textarea', label: 'المحتوى (AR)' },
          },
        },
      },
      defaultProps: {
        accent: 'rey-green',
        tabs: [
          { labelEn: 'Overview', labelAr: 'نظرة عامة', icon: 'grid', bodyEn: 'First tab.', bodyAr: 'التبويب الأول.' },
          { labelEn: 'Details', labelAr: 'التفاصيل', icon: 'book', bodyEn: 'Second tab.', bodyAr: 'التبويب الثاني.' },
        ],
      },
      render: ({ accent, tabs, id, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        const list = tabs ?? [];
        // Radio group name must be unique per instance, or two Tabs blocks on
        // one page would control each other.
        const groupName = `st-tabs-${id}`;
        return (
          <div className="st-tabs" style={{ ['--st-accent' as string]: colorVar(accent, 'rey-green') }}>
            {list.map((tab: Record<string, string>, i: number) => (
              <input
                key={`r${i}`}
                type="radio"
                name={groupName}
                id={`${groupName}-${i}`}
                defaultChecked={i === 0}
                className="st-tabs__radio"
              />
            ))}
            <div className="st-tabs__strip" role="tablist">
              {list.map((tab: Record<string, string>, i: number) => (
                <label key={`l${i}`} htmlFor={`${groupName}-${i}`} className="st-tabs__tab">
                  {tab.icon ? <Icon name={tab.icon} size={15} dir={dir} /> : null}
                  {t(locale, tab.labelEn, tab.labelAr)}
                </label>
              ))}
            </div>
            {list.map((tab: Record<string, string>, i: number) => (
              <div key={`p${i}`} className="st-tabs__panel" role="tabpanel">
                {t(locale, tab.bodyEn, tab.bodyAr)}
              </div>
            ))}
          </div>
        );
      },
    },

    Accordion: {
      label: 'أكورديون (Accordion)',
      fields: {
        items: {
          type: 'array',
          label: 'العناصر',
          arrayFields: {
            ...pair('title'),
            bodyEn: { type: 'textarea', label: 'المحتوى (EN)' },
            bodyAr: { type: 'textarea', label: 'المحتوى (AR)' },
          },
        },
      },
      defaultProps: {
        items: [
          { titleEn: 'Question one', titleAr: 'السؤال الأول', bodyEn: 'Answer.', bodyAr: 'الإجابة.' },
        ],
      },
      render: ({ items, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <div className="st-accordion">
            {(items ?? []).map((item: Record<string, string>, i: number) => (
              <details key={i} className="st-accordion__item">
                <summary className="st-accordion__head">
                  <span>{t(locale, item.titleEn, item.titleAr)}</span>
                  <Icon name="chevron" size={16} dir={dir} />
                </summary>
                <div className="st-accordion__body">{t(locale, item.bodyEn, item.bodyAr)}</div>
              </details>
            ))}
          </div>
        );
      },
    },

    // ================================================================ DATA ==
    StatCard: {
      label: 'بطاقة إحصائية (Stat)',
      fields: {
        ...pair('label'),
        value: { type: 'text', label: 'القيمة (Value)' },
        ...pair('trend'),
        icon: iconField('الأيقونة'),
        accent: colorField('اللون (Accent)'),
      },
      defaultProps: {
        labelEn: 'Metric', labelAr: 'المؤشر', value: '12',
        trendEn: '+3', trendAr: '+٣', icon: 'exhibition', accent: 'rey-green',
      },
      render: ({ labelEn, labelAr, value, trendEn, trendAr, icon, accent, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <div className="st-stat">
            <div className="st-stat__head">
              <span className="st-stat__label">{t(locale, labelEn, labelAr)}</span>
              <Icon name={icon} size={16} dir={dir} style={{ color: colorVar(accent, 'rey-green') }} />
            </div>
            <div className="st-stat__value">
              <bdi>{value}</bdi>
            </div>
            <div className="st-stat__trend" style={{ color: colorVar(accent, 'rey-green') }}>
              <bdi>{t(locale, trendEn, trendAr)}</bdi>
            </div>
          </div>
        );
      },
    },

    Callout: {
      label: 'تنبيه (Callout)',
      fields: {
        ...pair('title'),
        bodyEn: { type: 'textarea', label: 'النص (EN)' },
        bodyAr: { type: 'textarea', label: 'النص (AR)' },
        icon: iconField('الأيقونة'),
        accent: colorField('لون الحد (Accent)'),
        background: surfaceField('الخلفية (Background)'),
      },
      defaultProps: {
        titleEn: 'Note', titleAr: 'ملاحظة',
        bodyEn: 'Something worth knowing.', bodyAr: 'معلومة مهمة.',
        icon: 'help', accent: 'rey-navy', background: 'rey-navy-soft',
      },
      render: ({ titleEn, titleAr, bodyEn, bodyAr, icon, accent, background, puck }) => {
        const locale = localeOf(puck?.metadata);
        const dir = dirOf(locale);
        return (
          <div
            className="st-callout"
            style={{
              background: colorVar(background, 'rey-navy-soft'),
              borderInlineStartColor: colorVar(accent, 'rey-navy'),
            }}
          >
            <Icon name={icon} size={19} dir={dir} style={{ color: colorVar(accent, 'rey-navy') }} />
            <div>
              <strong style={{ display: 'block', marginBlockEnd: 4 }}>
                {t(locale, titleEn, titleAr)}
              </strong>
              <span style={{ fontSize: 14, lineHeight: 1.6 }}>{t(locale, bodyEn, bodyAr)}</span>
            </div>
          </div>
        );
      },
    },
  },
};

export default studioConfig;
