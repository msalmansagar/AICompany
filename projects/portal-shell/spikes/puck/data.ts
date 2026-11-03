import type { Data } from '@puckeditor/core';

/**
 * Representative saved page — this is the exact JSON shape that would live
 * in a Dataverse Memo column (gzip + Base64 in production).
 */
export const sampleData: Data = {
  root: { props: {} },
  content: [
    {
      type: 'Hero',
      props: {
        id: 'Hero-1',
        heading: 'بنك قطر للتنمية',
        subheading: 'اختبار الاتجاه من اليمين إلى اليسار داخل محرر Puck',
      },
    },
    {
      type: 'TextBlock',
      props: {
        id: 'TextBlock-1',
        text: 'الفقرة الأولى — يجب أن تظهر محاذاة النص إلى اليمين في الوضع العربي.',
      },
    },
    {
      type: 'Columns',
      props: {
        id: 'Columns-1',
        start: [
          {
            type: 'TextBlock',
            props: { id: 'TextBlock-in-start', text: 'أنا داخل عمود البداية (START).' },
          },
        ],
        end: [
          {
            type: 'TextBlock',
            props: { id: 'TextBlock-in-end', text: 'أنا داخل عمود النهاية (END).' },
          },
        ],
      },
    },
  ],
  zones: {},
};

export default sampleData;
