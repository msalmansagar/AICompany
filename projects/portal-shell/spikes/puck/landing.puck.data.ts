import type { Data } from '@puckeditor/core';
import { COPY } from './landing.copy';

/**
 * Seed trees for the Puck-composed landing and login pages.
 *
 * Built by zipping the English and Arabic copy dictionaries into `…En`/`…Ar`
 * prop pairs. In production this is a stored JSON blob in a Dataverse Memo
 * column — the derivation here exists only so the spike has one source of
 * truth for content while it is still being edited by hand.
 *
 * Every prop the components read is present. Puck's `defaultProps` apply only
 * when a component is dragged in, never when stored data is rendered.
 */

const en = COPY.en;
const ar = COPY.ar;

const RAIL_MEDIA = [
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#5b6b7a,#8d9aa6)',
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#8a6a3f,#c2a274)',
  'linear-gradient(rgba(20,34,48,.6),rgba(20,34,48,.6)), linear-gradient(135deg,#2a3f55,#4f6f8c)',
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#6b7f8f,#a8bac6)',
  'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#4a6270,#7d95a3)',
];

const STEP_ART = ['#e4f2ec', '#e7ecf5', '#f2ead8', '#f3e9f7'];

export const landingData: Data = {
  root: {
    props: {
      sections: [
        {
          type: 'TopNav',
          props: {
            id: 'nav-1',
            links: en.nav.map((labelEn, i) => ({ labelEn, labelAr: ar.nav[i] })),
            langEn: en.langSwitch, langAr: ar.langSwitch,
            ctaEn: en.signIn, ctaAr: ar.signIn,
            ctaHref: '/login-puck',
          },
        },
        {
          type: 'Hero',
          props: {
            id: 'hero-1',
            leadEn: en.heroA, leadAr: ar.heroA,
            highlight1En: en.heroHi1, highlight1Ar: ar.heroHi1,
            middleEn: en.heroB, middleAr: ar.heroB,
            highlight2En: en.heroHi2, highlight2Ar: ar.heroHi2,
            tailEn: en.heroC, tailAr: ar.heroC,
            subEn: en.heroSub, subAr: ar.heroSub,
            placeholderEn: en.searchPlaceholder, placeholderAr: ar.searchPlaceholder,
            searchEn: en.search, searchAr: ar.search,
          },
        },
        {
          type: 'ServiceRail',
          props: {
            id: 'rail-1',
            activeDot: 0,
            cards: en.cards.map((card, i) => ({
              titleEn: card.title, titleAr: ar.cards[i].title,
              tagsEn: card.tags.join(', '), tagsAr: ar.cards[i].tags.join(', '),
              subEn: card.sub, subAr: ar.cards[i].sub,
              providersEn: card.providers, providersAr: ar.cards[i].providers,
              media: RAIL_MEDIA[i],
            })),
          },
        },
        {
          type: 'HowItWorks',
          props: {
            id: 'works-1',
            leadEn: en.worksA, leadAr: ar.worksA,
            highlightEn: en.worksHi, highlightAr: ar.worksHi,
            tailEn: en.worksB, tailAr: ar.worksB,
            descEn: en.worksDesc, descAr: ar.worksDesc,
            steps: en.steps.map((s, i) => ({
              stepEn: s.step, stepAr: ar.steps[i].step,
              titleEn: s.title, titleAr: ar.steps[i].title,
              art: STEP_ART[i],
              accent: i === 2 ? 'yes' : 'no',
            })),
          },
        },
        {
          type: 'ChoosePath',
          props: {
            id: 'path-1',
            titleEn: en.pathTitle, titleAr: ar.pathTitle,
            subEn: en.pathSub, subAr: ar.pathSub,
            cards: [
              {
                titleEn: en.pathA.title, titleAr: ar.pathA.title,
                descEn: en.pathA.desc, descAr: ar.pathA.desc,
                items: en.pathA.items.map((labelEn, i) => ({ labelEn, labelAr: ar.pathA.items[i] })),
                ctaEn: en.pathA.cta, ctaAr: ar.pathA.cta,
                variant: 'navy', icon: 'help',
              },
              {
                titleEn: en.pathB.title, titleAr: ar.pathB.title,
                descEn: en.pathB.desc, descAr: ar.pathB.desc,
                items: en.pathB.items.map((labelEn, i) => ({ labelEn, labelAr: ar.pathB.items[i] })),
                ctaEn: en.pathB.cta, ctaAr: ar.pathB.cta,
                variant: 'primary', icon: 'services',
              },
            ],
          },
        },
        {
          type: 'TopProviders',
          props: {
            id: 'providers-1',
            leadEn: en.topA, leadAr: ar.topA,
            highlightEn: en.topHi, highlightAr: ar.topHi,
            viewAllEn: en.viewAll, viewAllAr: ar.viewAll,
            providers: [0, 1, 2].map(() => ({
              nameEn: en.providerName, nameAr: ar.providerName,
              tagsEn: en.providerTags.join(', '), tagsAr: ar.providerTags.join(', '),
              descEn: en.providerDesc, descAr: ar.providerDesc,
            })),
          },
        },
        {
          type: 'AcademyBand',
          props: {
            id: 'academy-1',
            titleEn: en.academyTitle, titleAr: ar.academyTitle,
            descEn: en.academyDesc, descAr: ar.academyDesc,
            ctaEn: en.learnMore, ctaAr: ar.learnMore,
            cards: en.academyCards.map((c, i) => ({
              titleEn: c.title, titleAr: ar.academyCards[i].title,
              descEn: c.desc, descAr: ar.academyCards[i].desc,
              icon: ['users', 'award', 'clock'][i],
            })),
          },
        },
        {
          type: 'BecomeProvider',
          props: {
            id: 'become-1',
            leadEn: en.providerA, leadAr: ar.providerA,
            highlightEn: en.providerHi, highlightAr: ar.providerHi,
            descEn: en.providerJoinDesc, descAr: ar.providerJoinDesc,
            primaryCtaEn: en.joinCta, primaryCtaAr: ar.joinCta,
            secondaryCtaEn: en.learnMoreAlt, secondaryCtaAr: ar.learnMoreAlt,
            benefits: en.benefits.map((b, i) => ({
              titleEn: b.title, titleAr: ar.benefits[i].title,
              descEn: b.desc, descAr: ar.benefits[i].desc,
              icon: ['services', 'wrench', 'book'][i],
            })),
          },
        },
        {
          type: 'ReadyCta',
          props: {
            id: 'ready-1',
            titleEn: en.readyTitle, titleAr: ar.readyTitle,
            descEn: en.readyDesc, descAr: ar.readyDesc,
            ctaEn: en.getStarted, ctaAr: ar.getStarted,
            ctaHref: '/login-puck',
          },
        },
        {
          type: 'SiteFooter',
          props: {
            id: 'footer-1',
            taglineEn: en.footerTagline, taglineAr: ar.footerTagline,
            connectEn: en.connect, connectAr: ar.connect,
            contactEn: en.contactUs, contactAr: ar.contactUs,
            phone: en.phone,
            email: en.email,
            addressEn: en.address, addressAr: ar.address,
            rightsEn: en.rights, rightsAr: ar.rights,
            columns: en.footerCols.map((col, i) => ({
              headEn: col.head, headAr: ar.footerCols[i].head,
              links: col.links.map((labelEn, j) => ({ labelEn, labelAr: ar.footerCols[i].links[j] })),
              moreEn: col.more, moreAr: ar.footerCols[i].more,
            })),
          },
        },
      ],
    },
  },
  content: [],
  zones: {},
};

export const loginData: Data = {
  root: {
    props: {
      brand: [
        {
          type: 'LoginBrandPanel',
          props: {
            id: 'brand-1',
            titleEn: en.loginTitle, titleAr: ar.loginTitle,
            descEn: en.academyDesc, descAr: ar.academyDesc,
          },
        },
      ],
      form: [
        {
          type: 'LoginForm',
          props: {
            id: 'form-1',
            titleEn: en.loginTitle, titleAr: ar.loginTitle,
            subEn: en.loginSub, subAr: ar.loginSub,
            emailLabelEn: en.emailLabel, emailLabelAr: ar.emailLabel,
            passwordLabelEn: en.passwordLabel, passwordLabelAr: ar.passwordLabel,
            rememberEn: en.remember, rememberAr: ar.remember,
            forgotEn: en.forgot, forgotAr: ar.forgot,
            ctaEn: en.loginCta, ctaAr: ar.loginCta,
            noAccountEn: en.noAccount, noAccountAr: ar.noAccount,
            registerEn: en.register, registerAr: ar.register,
            noteEn: en.demoNote, noteAr: ar.demoNote,
            redirectTo: '/reyada',
          },
        },
      ],
    },
  },
  content: [],
  zones: {},
};
