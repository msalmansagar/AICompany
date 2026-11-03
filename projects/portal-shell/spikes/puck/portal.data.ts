import type { Data } from '@puckeditor/core';

/**
 * One bilingual portal shell as a single serializable tree.
 *
 * Both languages live in the SAME node — English and Arabic strings sit
 * side by side on each component. Switching language re-renders this same
 * tree with a different `metadata.locale`; the structure never changes.
 *
 * This is the payload that would be gzipped + Base64'd into a Dataverse Memo
 * column and returned by `qdb_GetPublishedPageJson`.
 *
 * ⚠ Every prop is written out in full. Puck's `defaultProps` apply only when a
 * component is dragged in, never when stored data is rendered — a missing prop
 * renders as `undefined`, silently.
 */
export const portalData: Data = {
  root: {
    props: {
      header: [
        {
          type: 'HeaderBar',
          props: {
            id: 'hdr-1',
            titleEn: 'Qatar Development Bank',
            titleAr: 'بنك قطر للتنمية',
            subtitleEn: 'Digital Services Portal',
            subtitleAr: 'بوابة الخدمات الإلكترونية',
            userNameEn: 'Mohammed Salman',
            userNameAr: 'محمد سلمان',
          },
        },
      ],
      nav: [
        {
          type: 'NavMenu',
          props: {
            id: 'nav-1',
            headingEn: 'Main menu',
            headingAr: 'القائمة الرئيسية',
            items: [
              { labelEn: 'Dashboard', labelAr: 'لوحة المعلومات', icon: '▦', badge: '' },
              { labelEn: 'Services', labelAr: 'الخدمات', icon: '◈', badge: '' },
              { labelEn: 'My Requests', labelAr: 'طلباتي', icon: '❐', badge: '3' },
              { labelEn: 'Documents', labelAr: 'المستندات', icon: '🗎', badge: '' },
              { labelEn: 'Notifications', labelAr: 'الإشعارات', icon: '◉', badge: '12' },
              { labelEn: 'Profile', labelAr: 'الملف الشخصي', icon: '☺', badge: '' },
            ],
          },
        },
      ],
      footer: [
        {
          type: 'FooterBar',
          props: {
            id: 'ftr-1',
            copyrightEn: '© 2026 Qatar Development Bank — All rights reserved',
            copyrightAr: '© 2026 بنك قطر للتنمية — جميع الحقوق محفوظة',
            links: [
              { labelEn: 'Privacy Policy', labelAr: 'سياسة الخصوصية' },
              { labelEn: 'Terms & Conditions', labelAr: 'الشروط والأحكام' },
              { labelEn: 'Contact Us', labelAr: 'اتصل بنا' },
            ],
          },
        },
      ],
      content: [
        {
          type: 'PageTitle',
          props: {
            id: 'title-1',
            textEn: 'Dashboard',
            textAr: 'لوحة المعلومات',
            captionEn: 'Overview of your requests and services',
            captionAr: 'نظرة عامة على طلباتك وخدماتك',
          },
        },
        {
          type: 'CardRow',
          props: {
            id: 'row-1',
            cards: [
              {
                type: 'StatCard',
                props: {
                  id: 's1',
                  labelEn: 'Active requests',
                  labelAr: 'الطلبات النشطة',
                  value: '12',
                  trendEn: '+3 this month',
                  trendAr: '+3 هذا الشهر',
                },
              },
              {
                type: 'StatCard',
                props: {
                  id: 's2',
                  labelEn: 'Under review',
                  labelAr: 'قيد المراجعة',
                  value: '4',
                  trendEn: 'Awaiting documents',
                  trendAr: 'بانتظار المستندات',
                },
              },
              {
                type: 'StatCard',
                props: {
                  id: 's3',
                  labelEn: 'Completed',
                  labelAr: 'مكتملة',
                  value: '27',
                  trendEn: '+8 this year',
                  trendAr: '+8 هذا العام',
                },
              },
            ],
          },
        },
        {
          type: 'RichCard',
          props: {
            id: 'rc-1',
            headingEn: 'Latest news',
            headingAr: 'آخر الأخبار',
            bodyEn:
              'Qatar Development Bank is pleased to announce a new financing package for small and medium enterprises, with concessionary terms and a grace period of up to twelve months.',
            bodyAr:
              'يسر بنك قطر للتنمية الإعلان عن إطلاق باقة تمويلية جديدة للمشاريع الصغيرة والمتوسطة بشروط ميسرة وفترة سماح تصل إلى اثني عشر شهراً.',
          },
        },
        {
          type: 'RichCard',
          props: {
            id: 'rc-2',
            headingEn: 'Most used services',
            headingAr: 'الخدمات الأكثر استخداماً',
            bodyEn:
              'New financing request · Update your details · Upload a document · Track an existing request — all available from the Services menu.',
            bodyAr:
              'طلب تمويل جديد · تحديث البيانات · رفع مستند · متابعة طلب قائم — جميعها متاحة من قائمة الخدمات.',
          },
        },
      ],
    },
  },
  content: [],
  zones: {},
};

export default portalData;
