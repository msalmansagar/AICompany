import type { Data } from '@puckeditor/core';

/**
 * Reyada Advisory dashboard content — English and Arabic in one tree.
 *
 * Every prop is written out in full: Puck's `defaultProps` apply only when a
 * component is dragged in, never when stored data is rendered.
 *
 * `media` values are CSS backgrounds standing in for photography. In
 * production these become `url(...)` strings served from Dataverse/CMS — a
 * data change, not a code change.
 */

const MEDIA = { // asset ids from media.library.ts
  ai: 'tech-ai',
  meeting: 'meeting-warm',
  security: 'security',
  academy: 'academy',
  legal: 'legal',
  certification: 'certification',
  advisory: 'advisory-dark',
};

const DATE_EN = 'Jun 15 2025 - Jun 16 2025';
const DATE_AR = '١٥ يونيو ٢٠٢٥ - ١٦ يونيو ٢٠٢٥';
const TIME_EN = '10:00 AM - 6:00 PM';
const TIME_AR = '١٠:٠٠ ص - ٦:٠٠ م';
const VENUE_EN = 'Innovation Center, Doha Qatar';
const VENUE_AR = 'مركز الابتكار، الدوحة قطر';

export const reyadaData: Data = {
  root: {
    props: {
      aside: [
        {
          type: 'Sidebar',
          props: {
            id: 'aside-1',
            items: [
              { labelEn: 'Dashboard', labelAr: 'لوحة المعلومات', icon: 'grid', active: 'yes', hasChevron: 'no' },
              { labelEn: 'Services', labelAr: 'الخدمات', icon: 'services', active: 'no', hasChevron: 'no' },
              { labelEn: 'Opportunities', labelAr: 'الفرص', icon: 'calendar', active: 'no', hasChevron: 'yes' },
            ],
          },
        },
      ],

      welcome: [
        {
          type: 'WelcomeBar',
          props: {
            id: 'wel-1',
            greetingEn: 'Welcome, Jassim',
            greetingAr: 'مرحباً، جاسم',
            roleEn: 'Entrepreneur',
            roleAr: 'رائد أعمال',
            supportEn: 'Get support',
            supportAr: 'الحصول على الدعم',
            initials: 'JM',
          },
        },
      ],

      heading: [
        {
          type: 'PageHeading',
          props: {
            id: 'head-1',
            titleEn: 'Dashboard',
            titleAr: 'لوحة المعلومات',
            subtitleEn: 'Track and manage all your service requests in one place',
            subtitleAr: 'تتبع وأدر جميع طلبات الخدمة الخاصة بك في مكان واحد',
          },
        },
      ],

      mainColumn: [
        {
          type: 'GrowthOpportunities',
          props: {
            id: 'growth-1',
            titleEn: 'Growth Opportunities',
            titleAr: 'فرص النمو',
            subtitleEn: 'Discover and register for events designed to elevate your skills and expand your network',
            subtitleAr: 'اكتشف وسجّل في الفعاليات المصممة لتطوير مهاراتك وتوسيع شبكة علاقاتك',
            viewAllEn: 'View All',
            viewAllAr: 'عرض الكل',
            learnMoreEn: 'Learn More',
            learnMoreAr: 'اعرف المزيد',
            events: [
              {
                media: MEDIA.ai,
                tone: 'green',
                badgeEn: 'Exhibition',
                badgeAr: 'معرض',
                titleEn: 'Future of AI in Business: Interactive Exhibition',
                titleAr: 'مستقبل الذكاء الاصطناعي في الأعمال: معرض تفاعلي',
                dateEn: DATE_EN,
                dateAr: DATE_AR,
                timeEn: TIME_EN,
                timeAr: TIME_AR,
                venueEn: VENUE_EN,
                venueAr: VENUE_AR,
                regEn: `Registration: ${DATE_EN}`,
                regAr: `التسجيل: ${DATE_AR}`,
              },
              {
                media: MEDIA.meeting,
                tone: 'navy',
                badgeEn: 'Matchmaking',
                badgeAr: 'ربط الأعمال',
                titleEn: 'Investor-Startup Matchmaking Forum',
                titleAr: 'ملتقى ربط المستثمرين بالشركات الناشئة',
                dateEn: DATE_EN,
                dateAr: DATE_AR,
                timeEn: TIME_EN,
                timeAr: TIME_AR,
                venueEn: VENUE_EN,
                venueAr: VENUE_AR,
                regEn: `Registration: ${DATE_EN}`,
                regAr: `التسجيل: ${DATE_AR}`,
              },
              {
                media: MEDIA.security,
                tone: 'purple',
                badgeEn: 'Workshop',
                badgeAr: 'ورشة عمل',
                titleEn: 'Digital Transformation Masterclass',
                titleAr: 'دورة متقدمة في التحول الرقمي',
                dateEn: DATE_EN,
                dateAr: DATE_AR,
                timeEn: TIME_EN,
                timeAr: TIME_AR,
                venueEn: VENUE_EN,
                venueAr: VENUE_AR,
                regEn: `Registration: ${DATE_EN}`,
                regAr: `التسجيل: ${DATE_AR}`,
              },
            ],
          },
        },
        {
          type: 'ReyadaAcademy',
          props: {
            id: 'academy-1',
            titleEn: 'Reyada Academy',
            titleAr: 'أكاديمية ريادة',
            subtitleEn: 'Reyada Academy is your gateway to practical, online learning for today’s entrepreneurs',
            subtitleAr: 'أكاديمية ريادة هي بوابتك إلى التعلّم العملي عبر الإنترنت لرواد الأعمال اليوم',
            media: MEDIA.academy,
            programEn: 'Financial Literacy Program',
            programAr: 'برنامج الثقافة المالية',
            descEn:
              'Enhancing financial knowledge, building confidence in accessing capital, and improving financial management practices.',
            descAr:
              'تعزيز المعرفة المالية، وبناء الثقة في الوصول إلى رأس المال، وتحسين ممارسات الإدارة المالية.',
            timeEn: TIME_EN,
            timeAr: TIME_AR,
            venueEn: VENUE_EN,
            venueAr: VENUE_AR,
            learnMoreEn: 'Learn More',
            learnMoreAr: 'اعرف المزيد',
            portalEn: 'Go to Portal',
            portalAr: 'الانتقال إلى البوابة',
          },
        },
        {
          type: 'ExploreServices',
          props: {
            id: 'services-1',
            titleEn: 'Explore Reyada Services',
            titleAr: 'استكشف خدمات ريادة',
            subtitleEn: 'Add your company to access this services.',
            subtitleAr: 'أضف شركتك للوصول إلى هذه الخدمات.',
            viewAllEn: 'View All',
            viewAllAr: 'عرض الكل',
            services: [
              {
                media: MEDIA.legal,
                titleEn: 'Legal Services',
                titleAr: 'الخدمات القانونية',
                badgeEn: '',
                badgeAr: '',
              },
              {
                media: MEDIA.certification,
                titleEn: 'Product Certification',
                titleAr: 'شهادة المنتج',
                badgeEn: 'SME',
                badgeAr: 'المنشآت الصغيرة',
              },
            ],
          },
        },
      ],

      sideColumn: [
        {
          type: 'AdvisoryPromo',
          props: {
            id: 'promo-1',
            media: MEDIA.advisory,
            titleEn: 'On-Spot Advisory Consultations',
            titleAr: 'الاستشارات الفورية',
            bodyEn:
              'QDB provides On-Spot advisory services and scheduled consultancy sessions to discuss business ideas, models, and key areas, offering guidance and challenging concepts.',
            bodyAr:
              'يقدّم بنك قطر للتنمية خدمات استشارية فورية وجلسات استشارية مجدولة لمناقشة أفكار الأعمال ونماذجها ومجالاتها الرئيسية، مع تقديم التوجيه ومناقشة المفاهيم.',
            ctaEn: 'Book a Session',
            ctaAr: 'احجز جلسة',
          },
        },
        {
          type: 'RegisteredEvents',
          props: {
            id: 'reg-1',
            titleEn: 'Registered Events',
            titleAr: 'الفعاليات المسجلة',
            subtitleEn: 'These are your upcoming registered events',
            subtitleAr: 'هذه هي فعالياتك المسجلة القادمة',
            allEn: 'View all Registrations',
            allAr: 'عرض جميع التسجيلات',
            items: [
              {
                tone: 'green',
                badgeEn: 'Exhibition',
                badgeAr: 'معرض',
                titleEn: 'Future of AI in Business: Interactive Exhibition',
                titleAr: 'مستقبل الذكاء الاصطناعي في الأعمال: معرض تفاعلي',
                dateEn: '15 Jun 2025 - 16 Jun 2025',
                dateAr: DATE_AR,
                timeEn: TIME_EN,
                timeAr: TIME_AR,
                venueEn: VENUE_EN,
                venueAr: VENUE_AR,
              },
              {
                tone: 'navy',
                badgeEn: 'Matchmaking',
                badgeAr: 'ربط الأعمال',
                titleEn: 'Investor-Startup Matchmaking Forum',
                titleAr: 'ملتقى ربط المستثمرين بالشركات الناشئة',
                dateEn: '15 Jun 2025 - 16 Jun 2025',
                dateAr: DATE_AR,
                timeEn: TIME_EN,
                timeAr: TIME_AR,
                venueEn: VENUE_EN,
                venueAr: VENUE_AR,
              },
            ],
          },
        },
        {
          type: 'BusinessRegistration',
          props: {
            id: 'cr-1',
            titleEn: 'Is Your Business Registered?',
            titleAr: 'هل شركتك مسجلة؟',
            bodyEn: 'Share your company CR number to access extra features.',
            bodyAr: 'شارك رقم السجل التجاري لشركتك للوصول إلى مزايا إضافية.',
            ctaEn: 'Unlock QDB Services',
            ctaAr: 'فتح خدمات بنك قطر للتنمية',
            noteEn: 'MOCI link to trade name, registration, and licensing info.',
            noteAr: 'رابط وزارة التجارة والصناعة للاسم التجاري والتسجيل ومعلومات الترخيص.',
          },
        },
      ],
    },
  },
  content: [],
  zones: {},
};

export default reyadaData;
