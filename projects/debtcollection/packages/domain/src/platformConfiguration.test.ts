import { describe, expect, it } from 'vitest';
import {
  PlatformConfigurationError,
  PlatformConfigurationSchema,
  readMappedValue,
  requireFacilityEntity,
  resolveField,
  resolveFields,
  type PlatformConfiguration,
} from './platformConfiguration.js';

/** A Housing Loan deployment: customers on contact, no facility master. */
const housingLoan: PlatformConfiguration = {
  organizationCode: 'HL',
  platformType: 'Cloud',
  apiVersion: '9.2',
  customerEntity: 'contacts',
  customerBusinessIdField: 'qdb_qid',
  mappings: [
    {
      businessObject: 'Customer',
      canonicalField: 'businessId',
      entity: 'contacts',
      field: 'qdb_qid',
      isRequired: true,
      accessMode: 'Read',
    },
    {
      businessObject: 'Customer',
      canonicalField: 'displayName',
      entity: 'contacts',
      field: 'fullname',
      isRequired: true,
      accessMode: 'Read',
    },
  ],
};

describe('PlatformConfigurationSchema', () => {
  it('accepts a configuration with no facility master', () => {
    expect(() => PlatformConfigurationSchema.parse(housingLoan)).not.toThrow();
  });

  it('rejects an api version that is not a version number', () => {
    expect(() => PlatformConfigurationSchema.parse({ ...housingLoan, apiVersion: 'latest' }))
      .toThrow();
  });

  it('rejects an organisation code outside the provisioned choice', () => {
    expect(() => PlatformConfigurationSchema.parse({ ...housingLoan, organizationCode: 'SME' }))
      .toThrow();
  });

  it('has no default snapshot policy', () => {
    const parsed = PlatformConfigurationSchema.parse(housingLoan);
    expect(parsed.snapshotPolicy).toBeUndefined();
  });
});

describe('resolveField', () => {
  it('returns the physical column the deployment uses', () => {
    expect(resolveField(housingLoan, 'Customer', 'businessId').field).toBe('qdb_qid');
  });

  it('names the missing mapping rather than falling back to a guess', () => {
    expect(() => resolveField(housingLoan, 'Customer', 'mobileNumber'))
      .toThrow(PlatformConfigurationError);
  });

  it('does not match a canonical field belonging to another business object', () => {
    expect(() => resolveField(housingLoan, 'Facility', 'businessId'))
      .toThrow(PlatformConfigurationError);
  });
});

describe('resolveFields', () => {
  it('maps a whole select list in order', () => {
    expect(resolveFields(housingLoan, 'Customer', ['businessId', 'displayName']))
      .toEqual(['qdb_qid', 'fullname']);
  });

  it('fails on the first unmapped field', () => {
    expect(() => resolveFields(housingLoan, 'Customer', ['businessId', 'mobileNumber']))
      .toThrow(/mobileNumber/);
  });
});

describe('requireFacilityEntity', () => {
  it('returns the facility master when the deployment has one', () => {
    const bfd: PlatformConfiguration = {
      ...housingLoan,
      organizationCode: 'BFD',
      customerEntity: 'accounts',
      facilityEntity: 'qdb_facilities',
    };
    expect(requireFacilityEntity(bfd)).toBe('qdb_facilities');
  });

  it('explains that a facility master is an optional extension when absent', () => {
    expect(() => requireFacilityEntity(housingLoan)).toThrow(/optional per-deployment extension/);
  });
});

describe('readMappedValue', () => {
  it('reads a canonical value through the deployment mapping', () => {
    const record = { qdb_qid: '28912345678', fullname: 'Test Customer' };
    expect(readMappedValue(housingLoan, 'Customer', 'businessId', record)).toBe('28912345678');
  });

  it('returns undefined when the mapped column is absent from the record', () => {
    expect(readMappedValue(housingLoan, 'Customer', 'displayName', {})).toBeUndefined();
  });
});
