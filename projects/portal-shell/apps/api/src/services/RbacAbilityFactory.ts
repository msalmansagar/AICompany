import { createMongoAbility, AbilityBuilder } from '@casl/ability';
import type { AppAbility, RbacSubject, RbacAction } from '@portal/types';

// ---------------------------------------------------------------------------
// Subject collections grouped by access pattern
// ---------------------------------------------------------------------------

const ALL_NON_PII_SUBJECTS: RbacSubject[] = [
  'PortalRequest',
  'PortalService',
  'CmsContent',
  'PortalUser',
  'RbacRole',
  'PortalConfig',
  'ComponentRegistry',
];

const CITIZEN_READ_SUBJECTS: RbacSubject[] = ['PortalService', 'CmsContent', 'PortalUser'];

// ---------------------------------------------------------------------------
// Role rule builders — one function per role slug, each with one responsibility
// ---------------------------------------------------------------------------

function applyPortalAdminRules(
  can: AbilityBuilder<AppAbility>['can'],
): void {
  can('manage', 'all');
}

function applyStaffViewerRules(
  can: AbilityBuilder<AppAbility>['can'],
  cannot: AbilityBuilder<AppAbility>['cannot'],
): void {
  can('read', ALL_NON_PII_SUBJECTS);
  cannot('read', 'CitizenPII');
}

function applySupportAgentRules(
  can: AbilityBuilder<AppAbility>['can'],
): void {
  can('read', 'PortalRequest');
  can('read', 'CitizenPII');
  can('update', 'PortalRequest');
  can('read', 'PortalUser');
}

function applyContentEditorRules(
  can: AbilityBuilder<AppAbility>['can'],
): void {
  can('read', 'PortalService');
  can('manage', 'CmsContent');
}

function applyServiceOwnerRules(
  can: AbilityBuilder<AppAbility>['can'],
): void {
  can('read', 'PortalRequest');
  can('manage', 'PortalService');
  can('manage', 'CmsContent');
}

function applyCitizenRules(
  can: AbilityBuilder<AppAbility>['can'],
): void {
  const citizenActions: RbacAction[] = ['create', 'read'];
  can(citizenActions, 'PortalRequest');
  can('read', CITIZEN_READ_SUBJECTS);
  can('read', 'CitizenPII');
}

function applyGuestRules(
  can: AbilityBuilder<AppAbility>['can'],
): void {
  const guestSubjects: RbacSubject[] = ['PortalService', 'CmsContent'];
  can('read', guestSubjects);
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Builds a CASL AppAbility from a list of role slugs.
 *
 * Called on NodeCache miss. Rules are additive — a user holding multiple
 * roles receives the union of all their permitted actions.
 */
export function buildAbility(roleSlugs: string[]): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  for (const slug of roleSlugs) {
    applySlugRules(slug, can, cannot);
  }

  return build();
}

function applySlugRules(
  slug: string,
  can: AbilityBuilder<AppAbility>['can'],
  cannot: AbilityBuilder<AppAbility>['cannot'],
): void {
  switch (slug) {
    case 'portal-admin':
      applyPortalAdminRules(can);
      break;
    case 'staff-viewer':
      applyStaffViewerRules(can, cannot);
      break;
    case 'support-agent':
      applySupportAgentRules(can);
      break;
    case 'content-editor':
      applyContentEditorRules(can);
      break;
    case 'service-owner':
      applyServiceOwnerRules(can);
      break;
    case 'registered-citizen':
    case 'corporate-user':
      applyCitizenRules(can);
      break;
    case 'guest':
      applyGuestRules(can);
      break;
    default:
      // Unknown slugs are silently skipped — no permissions granted.
      break;
  }
}
