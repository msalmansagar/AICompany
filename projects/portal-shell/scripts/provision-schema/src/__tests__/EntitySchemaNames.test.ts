import { describe, it, expect } from 'vitest';

import { portalConfigsDefinition } from '../entities/definitions/portalConfigs.js';
import { portalUsersDefinition } from '../entities/definitions/portalUsers.js';
import { portalServicesDefinition } from '../entities/definitions/portalServices.js';
import { portalResetTokensDefinition } from '../entities/definitions/portalResetTokens.js';
import { portalRevokedTokensDefinition } from '../entities/definitions/portalRevokedTokens.js';
import { portalNavItemsDefinition } from '../entities/definitions/portalNavItems.js';
import { portalWidgetConfigsDefinition } from '../entities/definitions/portalWidgetConfigs.js';
import { portalRequestsDefinition } from '../entities/definitions/portalRequests.js';
import { portalUserEntitiesDefinition } from '../entities/definitions/portalUserEntities.js';
import { portalNotificationsDefinition } from '../entities/definitions/portalNotifications.js';
import { cmsContentsDefinition } from '../entities/definitions/cmsContents.js';
import { portalServiceTabsDefinition } from '../entities/definitions/portalServiceTabs.js';
import { portalRequestTimelinesDefinition } from '../entities/definitions/portalRequestTimelines.js';
import { portalRequestDocumentsDefinition } from '../entities/definitions/portalRequestDocuments.js';
import { cmsRevisionsDefinition } from '../entities/definitions/cmsRevisions.js';
import type { EntityMetadataPayload } from '../types/DataverseMetadata.js';

// Expected mapping: SchemaName → BRD-authoritative logical name
const EXPECTED: ReadonlyArray<{ definition: EntityMetadataPayload; expectedLogicalName: string }> = [
  { definition: portalConfigsDefinition,          expectedLogicalName: 'qdb_portal_configs' },
  { definition: portalUsersDefinition,            expectedLogicalName: 'qdb_portal_users' },
  { definition: portalServicesDefinition,         expectedLogicalName: 'qdb_portal_services' },
  { definition: portalResetTokensDefinition,      expectedLogicalName: 'qdb_portal_reset_tokens' },
  { definition: portalRevokedTokensDefinition,    expectedLogicalName: 'qdb_portal_revoked_tokens' },
  { definition: portalNavItemsDefinition,         expectedLogicalName: 'qdb_portal_nav_items' },
  { definition: portalWidgetConfigsDefinition,    expectedLogicalName: 'qdb_portal_widget_configs' },
  { definition: portalRequestsDefinition,         expectedLogicalName: 'qdb_portal_requests' },
  { definition: portalUserEntitiesDefinition,     expectedLogicalName: 'qdb_portal_user_entities' },
  { definition: portalNotificationsDefinition,    expectedLogicalName: 'qdb_portal_notifications' },
  { definition: cmsContentsDefinition,            expectedLogicalName: 'qdb_cms_contents' },
  { definition: portalServiceTabsDefinition,      expectedLogicalName: 'qdb_portal_service_tabs' },
  { definition: portalRequestTimelinesDefinition, expectedLogicalName: 'qdb_portal_request_timelines' },
  { definition: portalRequestDocumentsDefinition, expectedLogicalName: 'qdb_portal_request_documents' },
  { definition: cmsRevisionsDefinition,           expectedLogicalName: 'qdb_cms_revisions' },
];

// B-001 fix verification: SchemaName must follow qdb_Word_Word convention so
// that SchemaName.toLowerCase() produces the BRD-authoritative logical name.
const SCHEMA_NAME_CONVENTION = /^qdb_[A-Z][A-Za-z]+(_[A-Z][A-Za-z]+)+$/;

describe('Entity SchemaNames (B-001 fix verification)', () => {
  describe('TC-SCHEMA-001: all 15 entities follow qdb_Word_Word naming convention', () => {
    for (const { definition, expectedLogicalName } of EXPECTED) {
      it(`${definition.SchemaName} matches qdb_Word_Word pattern`, () => {
        expect(definition.SchemaName).toMatch(SCHEMA_NAME_CONVENTION);
      });
    }
  });

  describe('TC-SCHEMA-002: SchemaName.toLowerCase() produces BRD-authoritative logical name', () => {
    for (const { definition, expectedLogicalName } of EXPECTED) {
      it(`${definition.SchemaName}.toLowerCase() === '${expectedLogicalName}'`, () => {
        expect(definition.SchemaName.toLowerCase()).toBe(expectedLogicalName);
      });
    }
  });

  describe('TC-SCHEMA-003: all SchemaNames start with qdb_ prefix', () => {
    it('should ensure no entity omits the publisher prefix', () => {
      for (const { definition } of EXPECTED) {
        expect(definition.SchemaName).toMatch(/^qdb_/);
      }
    });
  });

  describe('TC-SCHEMA-004: old PascalCase format is not present (regression guard)', () => {
    it('should not contain PascalCase SchemaNames like qdb_PortalUsers', () => {
      const pascalCasePattern = /^qdb_[A-Z][a-z]+[A-Z]/;
      for (const { definition } of EXPECTED) {
        expect(definition.SchemaName).not.toMatch(pascalCasePattern);
      }
    });
  });

  describe('TC-SCHEMA-005: all 15 expected entities are present', () => {
    it('should have exactly 15 entity definitions under test', () => {
      expect(EXPECTED).toHaveLength(15);
    });
  });
});
