import { describe, it, expect } from 'vitest';
import { buildFetchXmlFilterParts, buildODataFilter, collectLookupPathAttributes } from '@qdb/shared';

// Searching a lookup COLUMN by its display text. The lookup attribute itself only compares
// by GUID, so `company/name like '%acme%'` has to reach through to the related record:
// a join in FetchXML, a navigation path in OData.

const ACCOUNT = { company: { entityLogicalName: 'account' } };

describe('collectLookupPathAttributes', () => {
  it('returnsTheLookupAttributesATemplateReachesThrough', () => {
    const attributes = collectLookupPathAttributes(
      "company/name like '%{search}%' and statuscode eq 1 and owner/fullname like '%{who}%'",
    );

    expect(attributes.sort()).toEqual(['company', 'owner']);
  });

  it('returnsNothingForATemplateWithNoPaths', () => {
    expect(collectLookupPathAttributes("_company_value eq '{picker}'")).toEqual([]);
  });

  it('returnsNothingForAMalformedTemplate_ratherThanThrowing', () => {
    // The emitter reports the parse failure; collection is only used to pre-fetch metadata.
    expect(collectLookupPathAttributes('company/ like')).toEqual([]);
  });
});

describe('buildFetchXmlFilterParts — lookup paths', () => {
  it('emitsAnOuterJoinAndAnAliasedCondition', () => {
    const parts = buildFetchXmlFilterParts(
      "company/name like '%{search}%'", { search: 'Acme' }, ACCOUNT,
    );

    expect(parts.linkEntityXml).toBe(
      '<link-entity name="account" from="accountid" to="company" alias="rel_company" link-type="outer"/>',
    );
    expect(parts.filterXml).toBe(
      '<condition entityname="rel_company" attribute="name" operator="like" value="%Acme%"/>',
    );
  });

  it('keepsOrSemantics_whichAnInnerJoinWouldDestroy', () => {
    // The whole reason for the outer join + entityname form: with a filter nested inside an
    // inner join, this OR would silently behave as an AND and drop every row whose company
    // does not match, even those matching the GUID branch.
    const parts = buildFetchXmlFilterParts(
      "_company_value eq '{picker}' or company/name like '%{search}%'",
      { picker: '11111111-1111-1111-1111-111111111111', search: 'Acme' },
      ACCOUNT,
    );

    expect(parts.filterXml).toBe(
      '<filter type="or">'
      + '<condition attribute="company" operator="eq" value="11111111-1111-1111-1111-111111111111"/>'
      + '<condition entityname="rel_company" attribute="name" operator="like" value="%Acme%"/>'
      + '</filter>',
    );
    expect(parts.linkEntityXml).toContain('link-type="outer"');
  });

  it('sharesOneJoinAcrossTwoConditionsOnTheSameLookup', () => {
    const parts = buildFetchXmlFilterParts(
      "company/name like '%{a}%' or company/city like '%{b}%'",
      { a: 'Acme', b: 'Doha' },
      ACCOUNT,
    );

    expect(parts.linkEntityXml.match(/<link-entity/g)).toHaveLength(1);
  });

  it('dropsThePath_andReportsIt_whenNoJoinTargetIsSupplied', () => {
    // A configuration error, not empty user input — the caller logs it rather than
    // silently returning a wider result set with no explanation.
    const parts = buildFetchXmlFilterParts("company/name like '%{search}%'", { search: 'Acme' }, {});

    expect(parts.filterXml).toBe('');
    expect(parts.linkEntityXml).toBe('');
    expect(parts.unresolvedPaths).toEqual(['company']);
  });

  it('dropsTheConditionWhenTheSearchBoxIsEmpty_leavingTheGridUnfiltered', () => {
    const parts = buildFetchXmlFilterParts("company/name like '%{search}%'", { search: '' }, ACCOUNT);

    expect(parts.filterXml).toBe('');
  });

  it('escapesTheSearchTerm', () => {
    const parts = buildFetchXmlFilterParts(
      "company/name like '%{search}%'", { search: 'A & B "x"' }, ACCOUNT,
    );

    expect(parts.filterXml).toContain('value="%A &amp; B &quot;x&quot;%"');
  });

  it('leavesATemplateWithNoPathsExactlyAsBefore', () => {
    const parts = buildFetchXmlFilterParts(
      "_company_value eq '{picker}'",
      { picker: '11111111-1111-1111-1111-111111111111' },
    );

    expect(parts.filterXml).toBe(
      '<condition attribute="company" operator="eq" value="11111111-1111-1111-1111-111111111111"/>',
    );
    expect(parts.linkEntityXml).toBe('');
  });
});

describe('buildODataFilter — lookup paths', () => {
  it('traversesTheNavigationProperty', () => {
    const filter = buildODataFilter(
      "company/name like '%{search}%'", { search: 'Acme' }, { company: 'qdb_CompanyId' },
    );

    expect(filter).toBe("contains(qdb_CompanyId/name,'Acme')");
  });

  it('usesStartswithWhenTheWildcardIsTrailingOnly', () => {
    const filter = buildODataFilter(
      "company/name like '{search}%'", { search: 'Acme' }, { company: 'qdb_CompanyId' },
    );

    expect(filter).toBe("startswith(qdb_CompanyId/name,'Acme')");
  });

  it('dropsThePathWhenTheNavigationPropertyIsUnknown', () => {
    // The attribute name is not traversable in OData, so emitting it unresolved would 400.
    expect(buildODataFilter("company/name like '%{search}%'", { search: 'Acme' })).toBe('');
  });

  it('keepsOrSemantics', () => {
    const filter = buildODataFilter(
      "_company_value eq '{picker}' or company/name like '%{search}%'",
      { picker: '11111111-1111-1111-1111-111111111111', search: 'Acme' },
      { company: 'qdb_CompanyId' },
    );

    expect(filter).toBe(
      "(_company_value eq 11111111-1111-1111-1111-111111111111 or contains(qdb_CompanyId/name,'Acme'))",
    );
  });
});
