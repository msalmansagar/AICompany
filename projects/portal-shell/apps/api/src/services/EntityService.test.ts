// RED → GREEN → REFACTOR — EntityService unit tests
// TC-ENT-001 through TC-ENT-003 (DFE-PORT-001 Phase 5 QA)
// References: FR: ENT-* (entity switcher), Auth requirement AUTH-007

import { describe, it, expect, vi } from 'vitest';
import { EntityService } from './EntityService.js';
import { DataverseError } from '@portal/dataverse-client';
import type { DataverseClient } from '@portal/dataverse-client';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

interface MockJunctionRecord {
  qdb_portal_user_entityid: string;
  qdb_user_id: string;
  '_qdb_account_id_value': string;
}

interface MockAccountRecord {
  accountid: string;
  name: string;
  qdb_sub_type: string;
  qdb_logo_url: string | null;
}

function makeJunctionRecord(overrides: Partial<MockJunctionRecord> = {}): MockJunctionRecord {
  return {
    qdb_portal_user_entityid: 'junction-001',
    qdb_user_id: 'user-001',
    '_qdb_account_id_value': 'account-001',
    ...overrides,
  };
}

function makeAccountRecord(overrides: Partial<MockAccountRecord> = {}): MockAccountRecord {
  return {
    accountid: 'account-001',
    name: 'Acme Corp',
    qdb_sub_type: 'Manufacturing',
    qdb_logo_url: 'https://cdn.example.com/acme-logo.png',
    ...overrides,
  };
}

function buildMockDataverse(
  junctionRecords: MockJunctionRecord[],
  accountRecords: MockAccountRecord[],
): DataverseClient {
  // getList is called twice: first for junctions, then for accounts
  return {
    getList: vi.fn()
      .mockResolvedValueOnce({ value: junctionRecords })
      .mockResolvedValueOnce({ value: accountRecords }),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as DataverseClient;
}

// ---------------------------------------------------------------------------
// TC-ENT-001: getLinkedEntities_UserHasNoLinks_ReturnsEmptyArray
// ---------------------------------------------------------------------------

describe('EntityService.getLinkedEntities', () => {
  it('getLinkedEntities_UserHasNoLinks_ReturnsEmptyArray', async () => {
    // Arrange: junction table returns nothing for this user
    const dvMock = buildMockDataverse([], []);
    const service = new EntityService(dvMock);

    // Act
    const result = await service.getLinkedEntities('user-001');

    // Assert: empty array returned without calling getList a second time
    expect(result).toEqual([]);

    // loadAccounts must not be called when there are no junction records
    expect(dvMock.getList).toHaveBeenCalledTimes(1);
  });

  // TC-ENT-002: getLinkedEntities_UserHasMultipleEntities_ReturnsAllMapped
  it('getLinkedEntities_UserHasMultipleEntities_ReturnsAllMapped', async () => {
    // Arrange: two junction records linking user to two accounts
    const junctionRecords: MockJunctionRecord[] = [
      makeJunctionRecord({ '_qdb_account_id_value': 'account-001' }),
      makeJunctionRecord({
        qdb_portal_user_entityid: 'junction-002',
        '_qdb_account_id_value': 'account-002',
      }),
    ];
    const accountRecords: MockAccountRecord[] = [
      makeAccountRecord({ accountid: 'account-001', name: 'Acme Corp', qdb_sub_type: 'Manufacturing' }),
      makeAccountRecord({
        accountid: 'account-002',
        name: 'Beta Ltd',
        qdb_sub_type: 'Healthcare',
        qdb_logo_url: null,
      }),
    ];
    const dvMock = buildMockDataverse(junctionRecords, accountRecords);
    const service = new EntityService(dvMock);

    // Act
    const result = await service.getLinkedEntities('user-001');

    // Assert: both entities are returned and correctly mapped
    expect(result).toHaveLength(2);

    const first = result[0];
    expect(first?.id).toBe('account-001');
    expect(first?.name).toBe('Acme Corp');
    expect(first?.subType).toBe('Manufacturing');
    expect(first?.logoUrl).toBe('https://cdn.example.com/acme-logo.png');

    const second = result[1];
    expect(second?.id).toBe('account-002');
    expect(second?.name).toBe('Beta Ltd');
    expect(second?.subType).toBe('Healthcare');
    expect(second?.logoUrl).toBeNull();
  });

  // TC-ENT-003: getLinkedEntities_DataverseError_PropagatesError
  it('getLinkedEntities_DataverseError_PropagatesError', async () => {
    // Arrange: Dataverse throws on junction table query
    const dvError = new DataverseError('Junction table unavailable', '0x80040217', 500);
    const dvMock: DataverseClient = {
      getList: vi.fn().mockRejectedValue(dvError),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      executeAction: vi.fn(),
    } as unknown as DataverseClient;
    const service = new EntityService(dvMock);

    // Act + Assert: error is not swallowed — same instance propagates
    await expect(service.getLinkedEntities('user-001')).rejects.toBeInstanceOf(DataverseError);
    await expect(service.getLinkedEntities('user-001')).rejects.toMatchObject({
      httpStatus: 500,
    });
  });

  it('getLinkedEntities_NullSubType_MapsToEmptyString', async () => {
    // Arrange: account with no sub-type set in Dataverse (null)
    const junctionRecords: MockJunctionRecord[] = [
      makeJunctionRecord({ '_qdb_account_id_value': 'account-003' }),
    ];
    const accountRecords = [
      {
        accountid: 'account-003',
        name: 'No Subtype Corp',
        qdb_sub_type: null as unknown as string, // null from Dataverse
        qdb_logo_url: null,
      },
    ];
    // Manual mock that resolves sequentially
    const dvMock: DataverseClient = {
      getList: vi.fn()
        .mockResolvedValueOnce({ value: junctionRecords })
        .mockResolvedValueOnce({ value: accountRecords }),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      executeAction: vi.fn(),
    } as unknown as DataverseClient;
    const service = new EntityService(dvMock);

    // Act
    const result = await service.getLinkedEntities('user-001');

    // Assert: null sub-type is safely coerced to empty string
    expect(result[0]?.subType).toBe('');
  });
});
