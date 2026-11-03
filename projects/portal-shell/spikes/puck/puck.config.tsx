import type { Config } from '@puckeditor/core';

/**
 * Spike components deliberately use LOGICAL CSS properties only
 * (marginInline*, paddingInline*, textAlign start/end) — the same rule
 * portal-shell enforces. If direction breaks, the fault is Puck's
 * canvas, not our styling.
 */

const CARD: React.CSSProperties = {
  paddingBlock: '16px',
  paddingInline: '20px',
  marginBlockEnd: '12px',
  border: '1px solid #d1d1d1',
  borderRadius: '6px',
  background: '#ffffff',
};

export type Props = {
  Hero: { heading: string; subheading: string };
  TextBlock: { text: string };
  Columns: { start: unknown; end: unknown };
};

export const config: Config<Props> = {
  components: {
    Hero: {
      label: 'بطاقة ترحيب (Hero)',
      fields: {
        heading: { type: 'text', label: 'العنوان' },
        subheading: { type: 'textarea', label: 'العنوان الفرعي' },
      },
      defaultProps: {
        heading: 'بنك قطر للتنمية',
        subheading: 'نموذج تجريبي للتحقق من دعم الاتجاه من اليمين إلى اليسار',
      },
      render: ({ heading, subheading }) => (
        <section style={{ ...CARD, borderInlineStart: '4px solid #0f6cbd' }}>
          <h1 style={{ margin: 0, fontSize: '24px', textAlign: 'start' }}>{heading}</h1>
          <p style={{ marginBlockStart: '8px', marginBlockEnd: 0, textAlign: 'start', color: '#555' }}>
            {subheading}
          </p>
        </section>
      ),
    },

    TextBlock: {
      label: 'نص (Text)',
      fields: {
        text: { type: 'textarea', label: 'النص' },
      },
      defaultProps: {
        text: 'هذه فقرة نصية باللغة العربية للتأكد من محاذاة النص إلى اليمين.',
      },
      render: ({ text }) => (
        <div style={{ ...CARD, textAlign: 'start' }}>
          <p style={{ margin: 0 }}>{text}</p>
        </div>
      ),
    },

    /**
     * The critical RTL case: two side-by-side slots. Under dir=rtl the
     * "start" slot must appear on the RIGHT, and dropping into it must
     * not land in "end".
     */
    Columns: {
      label: 'عمودان (Columns)',
      fields: {
        start: { type: 'slot' },
        end: { type: 'slot' },
      },
      render: ({ start: Start, end: End }) => (
        <div style={{ display: 'flex', gap: '12px', marginBlockEnd: '12px' }}>
          <div style={{ flex: 1, outline: '2px dashed #b4d6fa', minHeight: '120px' }}>
            <div style={{ fontSize: '11px', padding: '4px', color: '#0f6cbd' }}>START / البداية</div>
            <Start />
          </div>
          <div style={{ flex: 1, outline: '2px dashed #f5c2c7', minHeight: '120px' }}>
            <div style={{ fontSize: '11px', padding: '4px', color: '#b42318' }}>END / النهاية</div>
            <End />
          </div>
        </div>
      ),
    },
  },
};

export default config;
