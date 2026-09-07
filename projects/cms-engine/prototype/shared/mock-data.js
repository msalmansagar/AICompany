/* =====================================================================
   Mock data.

   Field names mirror the Dataverse schema the engine would really use, so
   the prototype and the eventual implementation talk about the same things:

     qdb_cmspage         header      qdb_slug, qdb_titleen, qdb_titlear, qdb_status
     qdb_cmspageversion  versions    qdb_versionnumber, qdb_contentjson, qdb_islatest
     qdb_cmspublishlog   audit       plugin-written, append-only
     qdb_cmsmediaasset   media       qdb_assetkey, qdb_kind
     qdb_themetoken      tokens      qdb_slug, qdb_tokentype, qdb_value
   ===================================================================== */

const STATUS = { DRAFT: "Draft", REVIEW: "In review", PUBLISHED: "Published", SCHEDULED: "Scheduled" };

const PAGES = [
  { id: "p-01", slug: "home",              en: "Home",                      ar: "الرئيسية",                 status: STATUS.PUBLISHED, v: 14, locales: ["EN","AR"], owner: "Noora A.",   modified: "2026-08-05 09:12", views: 48210, template: "Landing" },
  { id: "p-02", slug: "about-reyada",      en: "About Reyada",              ar: "عن ريادة",                 status: STATUS.PUBLISHED, v: 6,  locales: ["EN","AR"], owner: "Khalid M.",  modified: "2026-08-04 16:40", views: 9120,  template: "Standard" },
  { id: "p-03", slug: "services",          en: "Advisory Services",         ar: "الخدمات الاستشارية",       status: STATUS.PUBLISHED, v: 21, locales: ["EN","AR"], owner: "Noora A.",   modified: "2026-08-04 11:05", views: 22740, template: "Directory" },
  { id: "p-04", slug: "growth",            en: "Growth Opportunities",      ar: "فرص النمو",                status: STATUS.REVIEW,    v: 3,  locales: ["EN","AR"], owner: "Sara H.",    modified: "2026-08-05 08:55", views: 0,     template: "Standard" },
  { id: "p-05", slug: "academy",           en: "Reyada Academy",            ar: "أكاديمية ريادة",           status: STATUS.PUBLISHED, v: 9,  locales: ["EN","AR"], owner: "Khalid M.",  modified: "2026-08-02 13:20", views: 6480,  template: "Landing" },
  { id: "p-06", slug: "for-providers",     en: "For Service Providers",     ar: "لمزودي الخدمات",           status: STATUS.DRAFT,     v: 2,  locales: ["EN"],      owner: "Sara H.",    modified: "2026-08-05 10:02", views: 0,     template: "Standard" },
  { id: "p-07", slug: "faq",               en: "Frequently Asked Questions",ar: "الأسئلة الشائعة",          status: STATUS.PUBLISHED, v: 11, locales: ["EN","AR"], owner: "Noora A.",   modified: "2026-07-29 15:44", views: 3310,  template: "Standard" },
  { id: "p-08", slug: "privacy",           en: "Privacy Policy",            ar: "سياسة الخصوصية",           status: STATUS.PUBLISHED, v: 4,  locales: ["EN","AR"], owner: "Legal",      modified: "2026-06-18 10:00", views: 1870,  template: "Legal" },
  { id: "p-09", slug: "terms",             en: "Terms & Conditions",        ar: "الشروط والأحكام",          status: STATUS.PUBLISHED, v: 4,  locales: ["EN","AR"], owner: "Legal",      modified: "2026-06-18 10:00", views: 1540,  template: "Legal" },
  { id: "p-10", slug: "contact",           en: "Contact Us",                ar: "اتصل بنا",                 status: STATUS.SCHEDULED, v: 5,  locales: ["EN","AR"], owner: "Sara H.",    modified: "2026-08-05 07:30", views: 2210,  template: "Standard" },
  { id: "p-11", slug: "events",            en: "Events & Workshops",        ar: "الفعاليات وورش العمل",     status: STATUS.DRAFT,     v: 1,  locales: ["EN"],      owner: "Noora A.",   modified: "2026-08-05 09:58", views: 0,     template: "Directory" },
  { id: "p-12", slug: "success-stories",   en: "Success Stories",           ar: "قصص النجاح",               status: STATUS.PUBLISHED, v: 7,  locales: ["EN","AR"], owner: "Khalid M.",  modified: "2026-07-31 12:15", views: 5090,  template: "Standard" },
];

const VERSIONS = [
  { v: 6, on: "2026-08-04 16:40", by: "Khalid M.", note: "Updated advisory copy for Q3",       state: "Published", bytes: 14820 },
  { v: 5, on: "2026-08-01 09:22", by: "Noora A.",  note: "Added Reyada Academy callout",       state: "Superseded", bytes: 13940 },
  { v: 4, on: "2026-07-24 14:10", by: "Khalid M.", note: "Arabic translation pass",            state: "Superseded", bytes: 13110 },
  { v: 3, on: "2026-07-18 11:35", by: "Sara H.",   note: "Restructured hero section",          state: "Superseded", bytes: 11480 },
  { v: 2, on: "2026-07-11 16:02", by: "Noora A.",  note: "First content draft",                state: "Superseded", bytes: 8940 },
  { v: 1, on: "2026-07-10 10:00", by: "Noora A.",  note: "Page created",                       state: "Superseded", bytes: 320 },
];

const AUDIT = [
  { on: "2026-08-05 09:12", who: "Noora A.",  action: "Published",   page: "Home",                  v: 14, tone: "ok",   detail: "qdb_PublishPage · async · render cache rebuilt" },
  { on: "2026-08-05 08:55", who: "Sara H.",   action: "Submitted",   page: "Growth Opportunities",  v: 3,  tone: "warn", detail: "Awaiting review — 2 approvers notified" },
  { on: "2026-08-04 16:40", who: "Khalid M.", action: "Published",   page: "About Reyada",          v: 6,  tone: "ok",   detail: "qdb_PublishPage · async · render cache rebuilt" },
  { on: "2026-08-04 16:32", who: "Khalid M.", action: "Saved draft", page: "About Reyada",          v: 6,  tone: "",     detail: "qdb_cmspageversion created (14,820 bytes)" },
  { on: "2026-08-04 11:05", who: "Noora A.",  action: "Published",   page: "Advisory Services",     v: 21, tone: "ok",   detail: "qdb_PublishPage · async · render cache rebuilt" },
  { on: "2026-08-04 10:48", who: "Noora A.",  action: "Rolled back", page: "Advisory Services",     v: 19, tone: "warn", detail: "v20 reverted — broken Arabic layout" },
  { on: "2026-08-02 13:20", who: "Khalid M.", action: "Published",   page: "Reyada Academy",        v: 9,  tone: "ok",   detail: "qdb_PublishPage · async · render cache rebuilt" },
  { on: "2026-07-31 12:15", who: "Khalid M.", action: "Published",   page: "Success Stories",       v: 7,  tone: "ok",   detail: "qdb_PublishPage · async · render cache rebuilt" },
];

const MEDIA = [
  { key: "hero-advisory",   name: "Advisory consultation",  kind: "Image", size: "412 KB", dims: "1920×960", used: 3, css: "linear-gradient(rgba(10,28,45,.62),rgba(10,28,45,.62)),linear-gradient(135deg,#20415c,#5b93ad)" },
  { key: "tech-ai",         name: "AI in business",         kind: "Image", size: "388 KB", dims: "1600×900", used: 2, css: "linear-gradient(135deg,#0b1a2b,#1b4f6b)" },
  { key: "meeting-warm",    name: "Investor matchmaking",   kind: "Image", size: "455 KB", dims: "1600×900", used: 2, css: "linear-gradient(135deg,#b08d5f,#d9c3a0)" },
  { key: "academy",         name: "Financial literacy",     kind: "Image", size: "301 KB", dims: "1400×900", used: 1, css: "linear-gradient(135deg,#efe7d8,#cbb99b)" },
  { key: "legal",           name: "Legal services",         kind: "Image", size: "276 KB", dims: "1400×900", used: 1, css: "linear-gradient(135deg,#cbb9a4,#e6dccd)" },
  { key: "certification",   name: "Product certification",  kind: "Image", size: "264 KB", dims: "1400×900", used: 1, css: "linear-gradient(135deg,#dfe6ec,#f2f5f8)" },
  { key: "security",        name: "Digital transformation", kind: "Image", size: "402 KB", dims: "1600×900", used: 1, css: "linear-gradient(135deg,#081527,#1c6b8f)" },
  { key: "qdb-logo",        name: "QDB logo (SVG)",         kind: "Logo",  size: "12 KB",  dims: "vector",   used: 12, css: "linear-gradient(135deg,#1b3a63,#2f5f8f)" },
];

const TOKENS = [
  { slug: "rey-green",       label: "Brand green",       type: "Colour", value: "#3d8a72", scope: "Global" },
  { slug: "rey-green-dark",  label: "Brand green dark",  type: "Colour", value: "#2f7d68", scope: "Global" },
  { slug: "rey-green-soft",  label: "Brand green soft",  type: "Colour", value: "#e6f2ee", scope: "Global" },
  { slug: "rey-navy",        label: "Navy",              type: "Colour", value: "#1b3a63", scope: "Global" },
  { slug: "rey-purple",      label: "Purple",            type: "Colour", value: "#6b4bb0", scope: "Global" },
  { slug: "rey-canvas",      label: "Page background",   type: "Colour", value: "#f4f6f8", scope: "Global" },
  { slug: "rey-surface",     label: "Card surface",      type: "Colour", value: "#ffffff", scope: "Global" },
  { slug: "rey-border",      label: "Border",            type: "Colour", value: "#e5e8eb", scope: "Global" },
  { slug: "rey-ink",         label: "Text",              type: "Colour", value: "#1a2129", scope: "Global" },
  { slug: "rey-muted",       label: "Text muted",        type: "Colour", value: "#5d6b7a", scope: "Global" },
];

const TYPO_TOKENS = [
  { slug: "font-family-base", label: "Base family (EN)", type: "Typography", value: "'Segoe UI', Tahoma, sans-serif", scope: "Locale EN" },
  { slug: "font-family-base", label: "Base family (AR)", type: "Typography", value: "'GE Dinar One', 'Noto Sans Arabic', Tahoma", scope: "Locale AR" },
  { slug: "font-size-body",   label: "Body size",        type: "Typography", value: "16px", scope: "Global" },
  { slug: "text-direction",   label: "Direction (AR)",   type: "Direction",  value: "rtl",  scope: "Locale AR" },
];

const COMPONENTS = [
  { name: "Section",   cat: "Layout",  props: 4, used: 38, version: "1.2.0", targets: "Portal, Admin" },
  { name: "Columns",   cat: "Layout",  props: 2, used: 24, version: "1.1.0", targets: "Portal, Admin" },
  { name: "Spacer",    cat: "Layout",  props: 1, used: 51, version: "1.0.0", targets: "Portal, Admin" },
  { name: "Heading",   cat: "Content", props: 6, used: 64, version: "1.3.0", targets: "Portal, Admin, Mobile" },
  { name: "Text",      cat: "Content", props: 5, used: 88, version: "1.3.0", targets: "Portal, Admin, Mobile" },
  { name: "Image",     cat: "Content", props: 4, used: 29, version: "1.1.0", targets: "Portal, Mobile" },
  { name: "Button",    cat: "Actions", props: 5, used: 41, version: "2.0.0", targets: "Portal, Admin, Mobile" },
  { name: "Tabs",      cat: "Interactive", props: 2, used: 7, version: "1.0.0", targets: "Portal" },
  { name: "Accordion", cat: "Interactive", props: 1, used: 12, version: "1.0.0", targets: "Portal" },
  { name: "StatCard",  cat: "Data",    props: 5, used: 18, version: "1.2.0", targets: "Portal, Admin" },
  { name: "Callout",   cat: "Data",    props: 6, used: 9,  version: "1.0.0", targets: "Portal" },
];

const NAV_TREE = [
  { label: "Home",        ar: "الرئيسية",           page: "home",            children: [] },
  { label: "Services",    ar: "الخدمات",            page: "services",        children: [
      { label: "Advisory",       ar: "الاستشارات",       page: "services" },
      { label: "Certification",  ar: "الشهادات",         page: "services" },
      { label: "Legal",          ar: "القانونية",        page: "services" },
  ]},
  { label: "Opportunities", ar: "الفرص",            page: "growth",          children: [
      { label: "Events",         ar: "الفعاليات",        page: "events" },
      { label: "Academy",        ar: "الأكاديمية",       page: "academy" },
  ]},
  { label: "About",       ar: "من نحن",             page: "about-reyada",    children: [] },
  { label: "Contact",     ar: "اتصل بنا",           page: "contact",         children: [] },
];

const TRANSLATIONS = [
  { key: "hero.title",    en: "Find the Perfect Service for Your Business Needs", ar: "اعثر على الخدمة المثالية لاحتياجات عملك", state: "Translated", page: "Home" },
  { key: "hero.subtitle", en: "Connect with trusted advisors and discover services", ar: "تواصل مع مستشارين موثوقين واكتشف الخدمات", state: "Translated", page: "Home" },
  { key: "cta.getStarted",en: "Get Started",                          ar: "ابدأ الآن",                    state: "Translated", page: "Home" },
  { key: "growth.title",  en: "Growth Opportunities",                 ar: "فرص النمو",                    state: "Translated", page: "Growth" },
  { key: "growth.lede",   en: "Discover and register for events designed to elevate your skills", ar: "", state: "Missing",    page: "Growth" },
  { key: "events.badge",  en: "Exhibition",                           ar: "معرض",                         state: "Translated", page: "Events" },
  { key: "events.cta",    en: "Learn More",                           ar: "اعرف المزيد",                  state: "Translated", page: "Events" },
  { key: "footer.rights", en: "All rights reserved",                  ar: "جميع الحقوق محفوظة",           state: "Stale",      page: "Global" },
  { key: "nav.providers", en: "For Providers",                        ar: "",                             state: "Missing",    page: "Global" },
];

const ROLES = [
  { role: "Portal Admin",   users: 3,  scope: "All pages, shell, tokens, navigation", publish: "Yes", tone: "err"  },
  { role: "Content Author", users: 11, scope: "Assigned pages — content region only",  publish: "No",  tone: "info" },
  { role: "Translator",     users: 5,  scope: "Arabic fields on assigned pages",       publish: "No",  tone: "info" },
  { role: "Approver",       users: 4,  scope: "Review queue, approve or reject",       publish: "Yes", tone: "warn" },
  { role: "Viewer",         users: 26, scope: "Read-only preview",                     publish: "No",  tone: ""     },
];

const REVIEW_QUEUE = [
  { page: "Growth Opportunities", by: "Sara H.",  waiting: "2h 14m", locales: ["EN","AR"], changes: 12 },
  { page: "Events & Workshops",   by: "Noora A.", waiting: "26m",    locales: ["EN"],      changes: 4 },
];

/* =====================================================================
   Icon library.

   `source` distinguishes icons that ship with the solution from those a
   power admin uploaded. Authors pick from the combined list and never
   need to know the difference — but governance does, because uploaded
   SVG is sanitised on write and built-in icons are not user input.
   ===================================================================== */
const ICON_LIBRARY = [
  { key: "grid",       name: "Dashboard",      source: "built-in", used: 4, added: "shipped" },
  { key: "pages",      name: "Document",       source: "built-in", used: 6, added: "shipped" },
  { key: "calendar",   name: "Calendar",       source: "built-in", used: 9, added: "shipped" },
  { key: "clock",      name: "Clock",          source: "built-in", used: 7, added: "shipped" },
  { key: "pin",        name: "Location",       source: "built-in", used: 8, added: "shipped" },
  { key: "award",      name: "Award",          source: "built-in", used: 3, added: "shipped" },
  { key: "users",      name: "People",         source: "built-in", used: 5, added: "shipped" },
  { key: "briefcase",  name: "Briefcase",      source: "built-in", used: 4, added: "shipped" },
  { key: "shield",     name: "Shield",         source: "built-in", used: 2, added: "shipped" },
  { key: "globe",      name: "Globe",          source: "built-in", used: 3, added: "shipped" },
  { key: "qdb-falcon",   name: "QDB falcon",       source: "uploaded", used: 5, added: "2026-08-03 by Noora A." },
  { key: "reyada-mark",  name: "Reyada mark",      source: "uploaded", used: 8, added: "2026-08-03 by Noora A." },
  { key: "qatar-vision",  name: "Vision 2030",     source: "uploaded", used: 2, added: "2026-07-28 by Khalid M." },
  { key: "sme-badge",    name: "SME badge",        source: "uploaded", used: 6, added: "2026-07-22 by Noora A." },
];

/** Components a power admin composed, with no developer involved. */
const CUSTOM_COMPONENTS = [
  { name: "Service card", from: "blocks", built: "Section + Image + Heading + Text + Button",
    fields: 5, used: 14, by: "Noora A.", on: "2026-08-04", status: "Published" },
  { name: "Event tile", from: "blocks", built: "Section + Image + Badge + Heading + Meta rows",
    fields: 7, used: 9, by: "Khalid M.", on: "2026-07-30", status: "Published" },
  { name: "Advisor profile", from: "template", built: "Card template",
    fields: 6, used: 22, by: "Noora A.", on: "2026-07-25", status: "Published" },
  { name: "Stat banner", from: "template", built: "Banner template",
    fields: 4, used: 3, by: "Sara H.", on: "2026-08-05", status: "Draft" },
];

/** Field types a power admin can add when defining a component. */
const FIELD_TYPES = [
  { type: "Text",        icon: "text",     desc: "Single line. Gets an EN and an AR box." },
  { type: "Long text",   icon: "pages",    desc: "Paragraph. Also bilingual." },
  { type: "Image",       icon: "image",    desc: "Picks from the media library." },
  { type: "Icon",        icon: "award",    desc: "Picks from the icon library." },
  { type: "Colour",      icon: "palette",  desc: "Picks an approved token. Never a free hex." },
  { type: "Link",        icon: "external", desc: "Page, external URL, or open a dialog." },
  { type: "Choice",      icon: "check",    desc: "A fixed list you define." },
  { type: "Number",      icon: "stat",     desc: "Numeric only." },
];

/** Every capability, and which role holds it. Drives the roles matrix. */
const CAPABILITIES = [
  { cap: "Create & compose pages",   admin: 1, author: 1, translator: 0, approver: 1, viewer: 0 },
  { cap: "Upload photos",            admin: 1, author: 1, translator: 0, approver: 0, viewer: 0 },
  { cap: "Upload icons",             admin: 1, author: 0, translator: 0, approver: 0, viewer: 0 },
  { cap: "Translations",             admin: 1, author: 1, translator: 1, approver: 1, viewer: 0 },
  { cap: "Pick approved colours",    admin: 1, author: 1, translator: 0, approver: 1, viewer: 0 },
  { cap: "Define approved colours",  admin: 1, author: 0, translator: 0, approver: 0, viewer: 0 },
  { cap: "Build components",         admin: 1, author: 0, translator: 0, approver: 0, viewer: 0 },
  { cap: "Define component fields",  admin: 1, author: 0, translator: 0, approver: 0, viewer: 0 },
  { cap: "Edit navigation",          admin: 1, author: 0, translator: 0, approver: 0, viewer: 0 },
  { cap: "Edit page shell",          admin: 1, author: 0, translator: 0, approver: 0, viewer: 0 },
  { cap: "Submit for review",        admin: 1, author: 1, translator: 1, approver: 1, viewer: 0 },
  { cap: "Publish",                  admin: 1, author: 0, translator: 0, approver: 1, viewer: 0 },
  { cap: "Roll back a version",      admin: 1, author: 0, translator: 0, approver: 1, viewer: 0 },
  { cap: "View audit log",           admin: 1, author: 0, translator: 0, approver: 1, viewer: 0 },
];
