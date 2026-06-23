// RED → GREEN → REFACTOR — @portal/types Zod schema tests
// TC-ZOD-001 through TC-ZOD-018 (DFE-PORT-001 Phase 5 QA)
// References: FR: AUTH-002, AUTH-004, AUTH-005, PC-001, PC-010, NAV-001, CMS

import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  PortalConfigPatchSchema,
  NavItemCreateSchema,
  CmsListQuerySchema,
} from './index.js';

// ---------------------------------------------------------------------------
// LoginSchema (TC-ZOD-001, TC-ZOD-002, TC-ZOD-003)
// ---------------------------------------------------------------------------

describe('LoginSchema', () => {
  it('LoginSchema_ValidEmailAndPassword_ParsesSuccessfully', () => {
    const result = LoginSchema.safeParse({
      email: 'user@example.com',
      password: 'secret12',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('LoginSchema_InvalidEmail_ReturnsZodError', () => {
    const result = LoginSchema.safeParse({
      email: 'not-an-email',
      password: 'secret12',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('email');
    }
  });

  it('LoginSchema_PasswordTooShort_ReturnsZodError', () => {
    const result = LoginSchema.safeParse({
      email: 'user@example.com',
      password: '7chars!', // 7 characters — min is 8
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('password');
    }
  });

  it('LoginSchema_EmptyEmail_ReturnsZodError', () => {
    const result = LoginSchema.safeParse({ email: '', password: 'ValidPass1' });

    expect(result.success).toBe(false);
  });

  it('LoginSchema_MissingPassword_ReturnsZodError', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com' });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RegisterSchema (TC-ZOD-004, TC-ZOD-005, TC-ZOD-006)
// ---------------------------------------------------------------------------

describe('RegisterSchema', () => {
  it('RegisterSchema_Valid_ParsesSuccessfully', () => {
    const result = RegisterSchema.safeParse({
      email: 'newuser@example.com',
      password: 'ValidP@ss12',
      firstName: 'Ahmad',
      lastName: 'Al-Rashid',
      preferredLanguage: 'en',
    });

    expect(result.success).toBe(true);
  });

  it('RegisterSchema_MissingFirstName_ReturnsZodError', () => {
    const result = RegisterSchema.safeParse({
      email: 'user@example.com',
      password: 'ValidP@ss12',
      firstName: '', // empty string fails min(1)
      lastName: 'Al-Rashid',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('firstName');
    }
  });

  it('RegisterSchema_WeakPassword_NoUppercase_ReturnsZodError', () => {
    const result = RegisterSchema.safeParse({
      email: 'user@example.com',
      password: 'alllower1@xy', // no uppercase
      firstName: 'Ahmad',
      lastName: 'Al-Rashid',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('password');
    }
  });

  it('RegisterSchema_PasswordTooShort_ReturnsZodError', () => {
    const result = RegisterSchema.safeParse({
      email: 'user@example.com',
      password: 'Short1!', // under 12 chars
      firstName: 'Ahmad',
      lastName: 'Al-Rashid',
    });

    expect(result.success).toBe(false);
  });

  it('RegisterSchema_DefaultsPreferredLanguageToEn_WhenOmitted', () => {
    const result = RegisterSchema.safeParse({
      email: 'user@example.com',
      password: 'ValidP@ss12!',
      firstName: 'Ahmad',
      lastName: 'Al-Rashid',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferredLanguage).toBe('en');
    }
  });

  it('RegisterSchema_InvalidPreferredLanguage_ReturnsZodError', () => {
    const result = RegisterSchema.safeParse({
      email: 'user@example.com',
      password: 'ValidP@ss12!',
      firstName: 'Ahmad',
      lastName: 'Al-Rashid',
      preferredLanguage: 'fr', // not in enum
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ResetPasswordSchema (TC-ZOD-007, TC-ZOD-008, TC-ZOD-009)
// ---------------------------------------------------------------------------

describe('ResetPasswordSchema', () => {
  it('ResetPasswordSchema_ValidStrongPassword_ParsesSuccessfully', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'reset-token-abc',
      newPassword: 'ValidP@ss12!',
    });

    expect(result.success).toBe(true);
  });

  it('ResetPasswordSchema_NoUppercase_ReturnsZodError', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'reset-token-abc',
      newPassword: 'nouppercase1!', // no uppercase letter
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('newPassword');
    }
  });

  it('ResetPasswordSchema_NoSpecialChar_ReturnsZodError', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'reset-token-abc',
      newPassword: 'NoSpecial1234', // missing special character
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('newPassword');
    }
  });

  it('ResetPasswordSchema_NoDigit_ReturnsZodError', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'reset-token-abc',
      newPassword: 'NoDigitHere!@#', // no digit
    });

    expect(result.success).toBe(false);
  });

  it('ResetPasswordSchema_MissingToken_ReturnsZodError', () => {
    const result = ResetPasswordSchema.safeParse({
      newPassword: 'ValidP@ss12!',
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PortalConfigPatchSchema (TC-ZOD-010, TC-ZOD-011, TC-ZOD-012, TC-ZOD-013)
// ---------------------------------------------------------------------------

describe('PortalConfigPatchSchema', () => {
  it('PortalConfigPatchSchema_ValidHexColors_ParsesSuccessfully', () => {
    const result = PortalConfigPatchSchema.safeParse({
      primaryColor: '#0078d4',
      accentColor: '#00b4d8',
      backgroundColor: '#ffffff',
    });

    expect(result.success).toBe(true);
  });

  it('PortalConfigPatchSchema_InvalidHex_NotStartingWithHash_ReturnsZodError', () => {
    const result = PortalConfigPatchSchema.safeParse({
      primaryColor: 'blue', // no # prefix
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('primaryColor');
    }
  });

  it('PortalConfigPatchSchema_InvalidHex_WrongLength_ReturnsZodError', () => {
    const result = PortalConfigPatchSchema.safeParse({
      primaryColor: '#abc', // 3-char hex not valid per schema regex (#[0-9a-fA-F]{6})
    });

    expect(result.success).toBe(false);
  });

  it('PortalConfigPatchSchema_PollIntervalBelowMin_Returns_ZodError', () => {
    // CEO Condition 5: min is 10 seconds
    const result = PortalConfigPatchSchema.safeParse({
      notificationPollIntervalSeconds: 9,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('notificationPollIntervalSeconds');
    }
  });

  it('PortalConfigPatchSchema_PollIntervalAboveMax_ReturnsZodError', () => {
    // CEO Condition 5: max is 120 seconds
    const result = PortalConfigPatchSchema.safeParse({
      notificationPollIntervalSeconds: 121,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('notificationPollIntervalSeconds');
    }
  });

  it('PortalConfigPatchSchema_PollIntervalAtMin_ParsesSuccessfully', () => {
    const result = PortalConfigPatchSchema.safeParse({
      notificationPollIntervalSeconds: 10,
    });

    expect(result.success).toBe(true);
  });

  it('PortalConfigPatchSchema_PollIntervalAtMax_ParsesSuccessfully', () => {
    const result = PortalConfigPatchSchema.safeParse({
      notificationPollIntervalSeconds: 120,
    });

    expect(result.success).toBe(true);
  });

  it('PortalConfigPatchSchema_ValidNavLayout_ParsesSuccessfully', () => {
    const result = PortalConfigPatchSchema.safeParse({
      navLayout: 'top-nav',
    });

    expect(result.success).toBe(true);
  });

  it('PortalConfigPatchSchema_InvalidNavLayout_ReturnsZodError', () => {
    const result = PortalConfigPatchSchema.safeParse({
      navLayout: 'floating', // not in enum
    });

    expect(result.success).toBe(false);
  });

  it('PortalConfigPatchSchema_EmptyPatch_ParsesSuccessfully', () => {
    // All fields optional — empty object is valid
    const result = PortalConfigPatchSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('PortalConfigPatchSchema_ValidFooterLinks_ParsesSuccessfully', () => {
    const result = PortalConfigPatchSchema.safeParse({
      footerLinks: [
        { label: 'Privacy Policy', url: 'https://example.com/privacy' },
        { label: 'Terms', url: 'https://example.com/terms' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('PortalConfigPatchSchema_FooterLinkWithInvalidUrl_ReturnsZodError', () => {
    const result = PortalConfigPatchSchema.safeParse({
      footerLinks: [{ label: 'Bad Link', url: 'not-a-url' }],
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NavItemCreateSchema (TC-ZOD-014, TC-ZOD-015)
// ---------------------------------------------------------------------------

describe('NavItemCreateSchema', () => {
  const VALID_NAV_ITEM = {
    label: 'Dashboard',
    labelAr: 'لوحة القيادة',
    icon: 'Home',
    pageCode: '/dashboard',
    displayOrder: 1,
    isVisible: true,
    badgeSource: 'none' as const,
    badgeValue: null,
    requiredRole: null,
    parentId: null,
  };

  it('NavItemCreateSchema_ValidItem_ParsesSuccessfully', () => {
    const result = NavItemCreateSchema.safeParse(VALID_NAV_ITEM);

    expect(result.success).toBe(true);
  });

  it('NavItemCreateSchema_EmptyLabel_ReturnsZodError', () => {
    const result = NavItemCreateSchema.safeParse({
      ...VALID_NAV_ITEM,
      label: '', // fails min(1)
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('label');
    }
  });

  it('NavItemCreateSchema_InvalidBadgeSource_ReturnsZodError', () => {
    const result = NavItemCreateSchema.safeParse({
      ...VALID_NAV_ITEM,
      badgeSource: 'live', // not in enum
    });

    expect(result.success).toBe(false);
  });

  it('NavItemCreateSchema_NegativeDisplayOrder_ReturnsZodError', () => {
    const result = NavItemCreateSchema.safeParse({
      ...VALID_NAV_ITEM,
      displayOrder: -1,
    });

    expect(result.success).toBe(false);
  });

  it('NavItemCreateSchema_InvalidParentIdUuid_ReturnsZodError', () => {
    const result = NavItemCreateSchema.safeParse({
      ...VALID_NAV_ITEM,
      parentId: 'not-a-uuid',
    });

    expect(result.success).toBe(false);
  });

  it('NavItemCreateSchema_ValidParentIdUuid_ParsesSuccessfully', () => {
    const result = NavItemCreateSchema.safeParse({
      ...VALID_NAV_ITEM,
      parentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CmsListQuerySchema (TC-ZOD-016, TC-ZOD-017, TC-ZOD-018)
// ---------------------------------------------------------------------------

describe('CmsListQuerySchema', () => {
  it('CmsListQuerySchema_ValidPagination_ParsesSuccessfully', () => {
    // page and pageSize are coerced from string (query param)
    const result = CmsListQuerySchema.safeParse({
      page: '2',
      pageSize: '10',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(10);
    }
  });

  it('CmsListQuerySchema_DefaultsToPage1AndPageSize12_WhenOmitted', () => {
    const result = CmsListQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(12);
    }
  });

  it('CmsListQuerySchema_PageSizeOver50_ReturnsZodError', () => {
    const result = CmsListQuerySchema.safeParse({ pageSize: '51' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('pageSize');
    }
  });

  it('CmsListQuerySchema_InvalidTypeEnum_ReturnsZodError', () => {
    const result = CmsListQuerySchema.safeParse({ type: 'video' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('type');
    }
  });

  it('CmsListQuerySchema_ValidType_ParsesSuccessfully', () => {
    const result = CmsListQuerySchema.safeParse({ type: 'blog' });

    expect(result.success).toBe(true);
  });

  it('CmsListQuerySchema_PageBelowOne_ReturnsZodError', () => {
    const result = CmsListQuerySchema.safeParse({ page: '0' });

    expect(result.success).toBe(false);
  });

  it('CmsListQuerySchema_TagFilter_ParsesSuccessfully', () => {
    const result = CmsListQuerySchema.safeParse({ tag: 'technology' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tag).toBe('technology');
    }
  });
});
