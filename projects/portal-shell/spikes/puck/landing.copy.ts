/**
 * Landing + login copy, both languages.
 *
 * A static marketing page has no admin-editable structure, so a flat
 * dictionary is the right shape here — unlike the dashboard, where content is
 * data and lives as localised props on the Puck tree.
 */

export type Locale = 'en' | 'ar';

export const COPY = {
  en: {
    nav: ['Services', 'Service Providers', 'About Us', 'Growth Opportunities', 'Reyada Academy', 'For Providers'],
    langSwitch: 'عربي',
    signIn: 'Button title',
    heroA: 'Find the Perfect ',
    heroHi1: 'Service',
    heroB: ' for Your ',
    heroHi2: 'Business',
    heroC: ' Needs',
    heroSub: 'Connect with trusted advisors and discover services tailored to your business needs.',
    searchPlaceholder: 'Service title or keyword...',
    search: 'Search',
    cards: [
      { title: 'Restructuring', tags: ['SME'], sub: '', providers: '+10 Service Providers' },
      { title: 'Franchise', tags: ['Investor', 'Expert'], sub: '2 Sub Services', providers: '+10 Service Providers' },
      { title: 'Annual Audit & Taxation services', tags: ['SME'], sub: '', providers: '+10 Service Providers' },
      { title: 'Product Certification', tags: ['Startup', 'SME'], sub: '', providers: '+10 Service Providers' },
      { title: 'Cost Analysis Expense Reduction', tags: ['SME', 'Investor'], sub: '', providers: '+10 Service Providers' },
    ],
    worksA: 'How ',
    worksHi: 'Advisory Marketplace',
    worksB: ' Works?',
    worksDesc:
      'The Advisory Marketplace is designed to connect businesses with expert advisors, creating a streamlined process for collaboration and decision-making. Here’s how it work',
    steps: [
      { step: 'Step 1', title: 'Explore our Services' },
      { step: 'Step 2', title: 'Create your Profile' },
      { step: 'Step 3', title: 'Perform self assessment' },
      { step: 'Step 4', title: 'Connect & Grow' },
    ],
    pathTitle: 'Choose Your Path',
    pathSub: 'Select the option that best fits your current needs',
    pathA: {
      title: 'I’m not sure what I need?',
      desc: 'Take our smart assessment quiz to discover the perfect advisory services for your business needs.',
      items: ['3-minute assessment', 'Personalized recommendations', 'Tailored service matches'],
      cta: 'Start Assessment',
    },
    pathB: {
      title: 'I know what I need',
      desc: 'Browse our comprehensive directory of advisory services and connect directly with experts.',
      items: ['Direct service search', 'Filter by expertise', 'Compare providers'],
      cta: 'Explore Services',
    },
    topA: 'Top Service ',
    topHi: 'Providers',
    providerName: 'Morison Menon Chartered Accountant...',
    providerTags: ['ISO', 'Cost', 'Accounting'],
    providerDesc:
      'We provide company consultancy to clients to assist them in making informed decisions. We have considerable experien...',
    viewAll: 'View All',
    academyTitle: 'Reyada Academy',
    academyDesc:
      'Enhance your business skills with our comprehensive online courses. Learn from industry experts and take your career to the next level.',
    academyCards: [
      { title: 'Expert Instructors', desc: 'Learn from industry professionals with years of real-world experience' },
      { title: 'Certified Programs', desc: 'Earn recognized certifications upon course completion' },
      { title: 'Flexible Learning', desc: 'Study at your own pace with lifetime access to course materials' },
    ],
    learnMore: 'Learn More',
    providerA: 'Are you an advisory ',
    providerHi: 'Service Provider?',
    providerJoinDesc:
      'Join our marketplace to connect with businesses that need your expertise. Expand your client base and grow your practice.',
    joinCta: 'Join as a Service Provider',
    learnMoreAlt: 'Learn more',
    benefits: [
      { title: 'Zero Upfront Costs', desc: 'Focus on delivering your best service without financial worries.' },
      { title: 'Intelligent Matching', desc: 'Our algorithm connects you with clients that match your expertise and experience.' },
      { title: 'Support & Resources', desc: 'Access marketing materials, best practices, and dedicated support.' },
    ],
    readyTitle: 'Ready to find your perfect advisory match?',
    readyDesc:
      'Whether you know exactly what you need or want guidance to discover the right services, we’re here to help your business succeed.',
    getStarted: 'Get Started',
    footerTagline: 'Connecting businesses with trusted service providers',
    footerCols: [
      { head: 'Services', links: ['Business Strategy', 'Marketing', 'Financial', 'Tadqeeq', 'Product Certification'], more: 'Show All' },
      { head: 'Advisory Marketplace', links: ['About Us', 'How it Works', 'For Providers'], more: '' },
      { head: 'Support', links: ['FAQ', 'Contact Us', 'Privacy policy', 'Terms and conditions'], more: '' },
    ],
    connect: 'Connect',
    contactUs: 'Contact Us',
    phone: '+974 - 88988899',
    email: 'support@advisoryqdb.qa',
    address: 'Bank street road, QDB building, Doha',
    rights: '© 2025 QDB Marketplace. All rights reserved.',
    // login
    loginTitle: 'Sign in to Reyada',
    loginSub: 'Access your advisory dashboard and service requests',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    remember: 'Keep me signed in',
    forgot: 'Forgot password?',
    loginCta: 'Sign In',
    noAccount: 'Don’t have an account?',
    register: 'Register',
    backHome: 'Back to home',
    demoNote: 'Demo only — any values sign you in.',
  },

  ar: {
    nav: ['الخدمات', 'مزودو الخدمات', 'من نحن', 'فرص النمو', 'أكاديمية ريادة', 'لمزودي الخدمات'],
    langSwitch: 'English',
    signIn: 'تسجيل الدخول',
    heroA: 'اعثر على ',
    heroHi1: 'الخدمة',
    heroB: ' المثالية لاحتياجات ',
    heroHi2: 'عملك',
    heroC: '',
    heroSub: 'تواصل مع مستشارين موثوقين واكتشف خدمات مصممة خصيصاً لاحتياجات عملك.',
    searchPlaceholder: 'اسم الخدمة أو كلمة مفتاحية...',
    search: 'بحث',
    cards: [
      { title: 'إعادة الهيكلة', tags: ['المنشآت الصغيرة'], sub: '', providers: '+١٠ مزود خدمة' },
      { title: 'الامتياز التجاري', tags: ['مستثمر', 'خبير'], sub: 'خدمتان فرعيتان', providers: '+١٠ مزود خدمة' },
      { title: 'خدمات التدقيق السنوي والضرائب', tags: ['المنشآت الصغيرة'], sub: '', providers: '+١٠ مزود خدمة' },
      { title: 'شهادة المنتج', tags: ['شركة ناشئة', 'المنشآت الصغيرة'], sub: '', providers: '+١٠ مزود خدمة' },
      { title: 'تحليل التكاليف وخفض المصروفات', tags: ['المنشآت الصغيرة', 'مستثمر'], sub: '', providers: '+١٠ مزود خدمة' },
    ],
    worksA: 'كيف يعمل ',
    worksHi: 'سوق الاستشارات',
    worksB: '؟',
    worksDesc:
      'صُمم سوق الاستشارات لربط الشركات بالمستشارين الخبراء، مما يوفر عملية مبسطة للتعاون واتخاذ القرار. إليك كيف يعمل',
    steps: [
      { step: 'الخطوة ١', title: 'استكشف خدماتنا' },
      { step: 'الخطوة ٢', title: 'أنشئ ملفك الشخصي' },
      { step: 'الخطوة ٣', title: 'قم بالتقييم الذاتي' },
      { step: 'الخطوة ٤', title: 'تواصل وانمُ' },
    ],
    pathTitle: 'اختر مسارك',
    pathSub: 'اختر الخيار الذي يناسب احتياجاتك الحالية',
    pathA: {
      title: 'لست متأكداً مما أحتاجه؟',
      desc: 'أجب عن اختبار التقييم الذكي لاكتشاف الخدمات الاستشارية المثالية لاحتياجات عملك.',
      items: ['تقييم في ٣ دقائق', 'توصيات مخصصة', 'خدمات مطابقة لاحتياجاتك'],
      cta: 'ابدأ التقييم',
    },
    pathB: {
      title: 'أعرف ما أحتاجه',
      desc: 'تصفح دليلنا الشامل للخدمات الاستشارية وتواصل مباشرة مع الخبراء.',
      items: ['بحث مباشر عن الخدمات', 'تصفية حسب التخصص', 'مقارنة المزودين'],
      cta: 'استكشف الخدمات',
    },
    topA: 'أفضل ',
    topHi: 'مزودي الخدمات',
    providerName: 'موريسون منون محاسبون قانونيون...',
    providerTags: ['الأيزو', 'التكلفة', 'المحاسبة'],
    providerDesc:
      'نقدم استشارات للشركات لمساعدة عملائنا على اتخاذ قرارات مدروسة. لدينا خبرة واسعة...',
    viewAll: 'عرض الكل',
    academyTitle: 'أكاديمية ريادة',
    academyDesc:
      'طوّر مهاراتك في الأعمال من خلال دوراتنا الشاملة عبر الإنترنت. تعلّم من خبراء القطاع وارتقِ بمسيرتك المهنية.',
    academyCards: [
      { title: 'مدربون خبراء', desc: 'تعلّم من مختصين يملكون سنوات من الخبرة العملية' },
      { title: 'برامج معتمدة', desc: 'احصل على شهادات معترف بها عند إتمام الدورة' },
      { title: 'تعلّم مرن', desc: 'ادرس وفق وتيرتك مع وصول دائم إلى المواد التعليمية' },
    ],
    learnMore: 'اعرف المزيد',
    providerA: 'هل أنت ',
    providerHi: 'مزود خدمات استشارية؟',
    providerJoinDesc:
      'انضم إلى سوقنا للتواصل مع الشركات التي تحتاج خبرتك. وسّع قاعدة عملائك وطوّر ممارستك المهنية.',
    joinCta: 'انضم كمزود خدمة',
    learnMoreAlt: 'اعرف المزيد',
    benefits: [
      { title: 'بدون تكاليف مسبقة', desc: 'ركّز على تقديم أفضل خدمة دون أعباء مالية.' },
      { title: 'مطابقة ذكية', desc: 'تربطك خوارزميتنا بالعملاء المناسبين لخبرتك وتخصصك.' },
      { title: 'الدعم والموارد', desc: 'احصل على مواد تسويقية وأفضل الممارسات ودعم مخصص.' },
    ],
    readyTitle: 'هل أنت مستعد لإيجاد المستشار المناسب؟',
    readyDesc:
      'سواء كنت تعرف ما تحتاجه تماماً أو ترغب في إرشاد لاكتشاف الخدمات المناسبة، نحن هنا لمساعدة عملك على النجاح.',
    getStarted: 'ابدأ الآن',
    footerTagline: 'نربط الشركات بمزودي خدمات موثوقين',
    footerCols: [
      { head: 'الخدمات', links: ['استراتيجية الأعمال', 'التسويق', 'المالية', 'تدقيق', 'شهادة المنتج'], more: 'عرض الكل' },
      { head: 'سوق الاستشارات', links: ['من نحن', 'كيف يعمل', 'لمزودي الخدمات'], more: '' },
      { head: 'الدعم', links: ['الأسئلة الشائعة', 'اتصل بنا', 'سياسة الخصوصية', 'الشروط والأحكام'], more: '' },
    ],
    connect: 'تواصل معنا',
    contactUs: 'اتصل بنا',
    phone: '+974 - 88988899',
    email: 'support@advisoryqdb.qa',
    address: 'شارع البنوك، مبنى بنك قطر للتنمية، الدوحة',
    rights: '© ٢٠٢٥ سوق بنك قطر للتنمية. جميع الحقوق محفوظة.',
    // login
    loginTitle: 'تسجيل الدخول إلى ريادة',
    loginSub: 'ادخل إلى لوحة معلوماتك وطلبات الخدمة',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة المرور',
    remember: 'أبقني مسجلاً للدخول',
    forgot: 'نسيت كلمة المرور؟',
    loginCta: 'تسجيل الدخول',
    noAccount: 'ليس لديك حساب؟',
    register: 'إنشاء حساب',
    backHome: 'العودة إلى الرئيسية',
    demoNote: 'عرض تجريبي — أي قيم تسجّل دخولك.',
  },
} as const;

export default COPY;
