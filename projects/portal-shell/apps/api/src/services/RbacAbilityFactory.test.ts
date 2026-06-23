import { describe, it, expect } from 'vitest';
import { buildAbility } from './RbacAbilityFactory.js';

// RED — failing tests written first (TDD mandate)

describe('buildAbility', () => {
  describe('portal-admin', () => {
    it('should_return_manage_all_when_role_is_portal_admin', () => {
      const ability = buildAbility(['portal-admin']);
      expect(ability.can('manage', 'all')).toBe(true);
    });

    it('should_allow_read_citizen_pii_when_role_is_portal_admin', () => {
      const ability = buildAbility(['portal-admin']);
      expect(ability.can('read', 'CitizenPII')).toBe(true);
    });

    it('should_allow_delete_portal_request_when_role_is_portal_admin', () => {
      const ability = buildAbility(['portal-admin']);
      expect(ability.can('delete', 'PortalRequest')).toBe(true);
    });
  });

  describe('staff-viewer', () => {
    it('should_allow_read_portal_request_when_role_is_staff_viewer', () => {
      const ability = buildAbility(['staff-viewer']);
      expect(ability.can('read', 'PortalRequest')).toBe(true);
    });

    it('should_deny_read_citizen_pii_when_role_is_staff_viewer', () => {
      const ability = buildAbility(['staff-viewer']);
      expect(ability.can('read', 'CitizenPII')).toBe(false);
    });

    it('should_deny_create_portal_request_when_role_is_staff_viewer', () => {
      const ability = buildAbility(['staff-viewer']);
      expect(ability.can('create', 'PortalRequest')).toBe(false);
    });

    it('should_allow_read_all_non_pii_subjects_when_role_is_staff_viewer', () => {
      const ability = buildAbility(['staff-viewer']);
      expect(ability.can('read', 'PortalService')).toBe(true);
      expect(ability.can('read', 'CmsContent')).toBe(true);
      expect(ability.can('read', 'PortalUser')).toBe(true);
      expect(ability.can('read', 'RbacRole')).toBe(true);
      expect(ability.can('read', 'PortalConfig')).toBe(true);
      expect(ability.can('read', 'ComponentRegistry')).toBe(true);
    });
  });

  describe('support-agent', () => {
    it('should_allow_read_citizen_pii_when_role_is_support_agent', () => {
      const ability = buildAbility(['support-agent']);
      expect(ability.can('read', 'CitizenPII')).toBe(true);
    });

    it('should_allow_update_portal_request_when_role_is_support_agent', () => {
      const ability = buildAbility(['support-agent']);
      expect(ability.can('update', 'PortalRequest')).toBe(true);
    });

    it('should_deny_manage_cms_content_when_role_is_support_agent', () => {
      const ability = buildAbility(['support-agent']);
      expect(ability.can('manage', 'CmsContent')).toBe(false);
    });

    it('should_deny_delete_portal_request_when_role_is_support_agent', () => {
      const ability = buildAbility(['support-agent']);
      expect(ability.can('delete', 'PortalRequest')).toBe(false);
    });
  });

  describe('content-editor', () => {
    it('should_allow_manage_cms_content_when_role_is_content_editor', () => {
      const ability = buildAbility(['content-editor']);
      expect(ability.can('manage', 'CmsContent')).toBe(true);
    });

    it('should_allow_read_portal_service_when_role_is_content_editor', () => {
      const ability = buildAbility(['content-editor']);
      expect(ability.can('read', 'PortalService')).toBe(true);
    });

    it('should_deny_read_portal_request_when_role_is_content_editor', () => {
      const ability = buildAbility(['content-editor']);
      expect(ability.can('read', 'PortalRequest')).toBe(false);
    });
  });

  describe('service-owner', () => {
    it('should_allow_manage_portal_service_when_role_is_service_owner', () => {
      const ability = buildAbility(['service-owner']);
      expect(ability.can('manage', 'PortalService')).toBe(true);
    });

    it('should_deny_read_citizen_pii_when_role_is_service_owner', () => {
      const ability = buildAbility(['service-owner']);
      expect(ability.can('read', 'CitizenPII')).toBe(false);
    });
  });

  describe('registered-citizen', () => {
    it('should_allow_create_portal_request_when_role_is_registered_citizen', () => {
      const ability = buildAbility(['registered-citizen']);
      expect(ability.can('create', 'PortalRequest')).toBe(true);
    });

    it('should_allow_read_citizen_pii_when_role_is_registered_citizen', () => {
      const ability = buildAbility(['registered-citizen']);
      expect(ability.can('read', 'CitizenPII')).toBe(true);
    });

    it('should_deny_delete_portal_request_when_role_is_registered_citizen', () => {
      const ability = buildAbility(['registered-citizen']);
      expect(ability.can('delete', 'PortalRequest')).toBe(false);
    });

    it('should_deny_manage_rbac_role_when_role_is_registered_citizen', () => {
      const ability = buildAbility(['registered-citizen']);
      expect(ability.can('manage', 'RbacRole')).toBe(false);
    });
  });

  describe('corporate-user', () => {
    it('should_have_same_permissions_as_registered_citizen', () => {
      const citizenAbility = buildAbility(['registered-citizen']);
      const corporateAbility = buildAbility(['corporate-user']);
      expect(corporateAbility.can('create', 'PortalRequest')).toBe(
        citizenAbility.can('create', 'PortalRequest'),
      );
      expect(corporateAbility.can('read', 'CitizenPII')).toBe(
        citizenAbility.can('read', 'CitizenPII'),
      );
    });
  });

  describe('guest', () => {
    it('should_allow_read_portal_service_when_role_is_guest', () => {
      const ability = buildAbility(['guest']);
      expect(ability.can('read', 'PortalService')).toBe(true);
    });

    it('should_allow_read_cms_content_when_role_is_guest', () => {
      const ability = buildAbility(['guest']);
      expect(ability.can('read', 'CmsContent')).toBe(true);
    });

    it('should_deny_read_portal_request_when_role_is_guest', () => {
      const ability = buildAbility(['guest']);
      expect(ability.can('read', 'PortalRequest')).toBe(false);
    });

    it('should_deny_read_citizen_pii_when_role_is_guest', () => {
      const ability = buildAbility(['guest']);
      expect(ability.can('read', 'CitizenPII')).toBe(false);
    });
  });

  describe('unknown role', () => {
    it('should_deny_all_when_role_is_unknown', () => {
      const ability = buildAbility(['completely-unknown-role']);
      expect(ability.can('read', 'PortalRequest')).toBe(false);
      expect(ability.can('manage', 'all')).toBe(false);
    });

    it('should_return_empty_ability_when_no_roles', () => {
      const ability = buildAbility([]);
      expect(ability.can('read', 'CmsContent')).toBe(false);
    });
  });

  describe('multi-role', () => {
    it('should_union_permissions_when_user_holds_multiple_roles', () => {
      // content-editor + support-agent union
      const ability = buildAbility(['content-editor', 'support-agent']);
      expect(ability.can('manage', 'CmsContent')).toBe(true);
      expect(ability.can('read', 'CitizenPII')).toBe(true);
      expect(ability.can('update', 'PortalRequest')).toBe(true);
    });
  });
});
