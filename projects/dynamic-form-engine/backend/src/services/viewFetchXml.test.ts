// The saved-view FetchXML builder ships in @qdb/shared for the in-CRM engine; it is
// exercised here because the backend workspace owns the shared package's test runner.
import { describe, it, expect } from 'vitest';
import { buildViewFetchXml } from '@qdb/shared';

const VIEW_XML =
  '<fetch version="1.0" mapping="logical">' +
  '<entity name="contact">' +
  '<attribute name="fullname"/>' +
  '<order attribute="fullname" descending="false"/>' +
  '<filter type="and"><condition attribute="statecode" operator="eq" value="0"/></filter>' +
  '</entity></fetch>';

describe('buildViewFetchXml', () => {
  describe('paging', () => {
    it('injectsPageAndCount', () => {
      const result = buildViewFetchXml({ baseXml: VIEW_XML, page: 3, pageSize: 10 });

      expect(result).toContain('page="3"');
      expect(result).toContain('count="10"');
    });

    it('requestsTotalRecordCount_soNumberedPagingCanShowTotals', () => {
      const result = buildViewFetchXml({ baseXml: VIEW_XML, page: 1, pageSize: 10 });

      expect(result).toContain('returntotalrecordcount="true"');
    });

    it('replacesPagingAttributesTheViewAlreadyCarried', () => {
      const paged = '<fetch version="1.0" page="7" count="99" top="5" paging-cookie="x"><entity name="contact"/></fetch>';

      const result = buildViewFetchXml({ baseXml: paged, page: 1, pageSize: 10 });

      expect(result).toContain('page="1"');
      expect(result).toContain('count="10"');
      expect(result).not.toContain('page="7"');
      expect(result).not.toContain('top="5"');
      expect(result).not.toContain('paging-cookie');
    });

    it('preservesTheViewsOwnFetchAttributes', () => {
      const result = buildViewFetchXml({ baseXml: VIEW_XML, page: 1, pageSize: 10 });

      expect(result).toContain('mapping="logical"');
    });
  });

  describe('columns', () => {
    it('addsAConfiguredColumnTheViewDoesNotSelect', () => {
      const result = buildViewFetchXml({
        baseXml: VIEW_XML, page: 1, pageSize: 10, columnAttributes: ['gendercode'],
      });

      expect(result).toContain('<attribute name="gendercode"/>');
    });

    it('doesNotDuplicateAColumnTheViewAlreadySelects', () => {
      const result = buildViewFetchXml({
        baseXml: VIEW_XML, page: 1, pageSize: 10, columnAttributes: ['fullname'],
      });

      expect(result.match(/<attribute name="fullname"\/>/g)).toHaveLength(1);
    });
  });

  describe('sorting', () => {
    it('keepsTheViewOrder_whenNoSortOverride', () => {
      const result = buildViewFetchXml({ baseXml: VIEW_XML, page: 1, pageSize: 10 });

      expect(result).toContain('<order attribute="fullname" descending="false"/>');
    });

    it('replacesTheViewOrder_whenUserSorts', () => {
      const result = buildViewFetchXml({
        baseXml: VIEW_XML, page: 1, pageSize: 10, sortBy: 'createdon', sortDirection: 'desc',
      });

      expect(result).toContain('<order attribute="createdon" descending="true"/>');
      expect(result).not.toContain('attribute="fullname" descending="false"');
    });
  });

  describe('filters', () => {
    it('appendsTheGridFilterAlongsideTheViewFilter', () => {
      const result = buildViewFetchXml({
        baseXml: VIEW_XML,
        page: 1,
        pageSize: 10,
        filterXml: '<filter type="and"><condition attribute="gendercode" operator="eq" value="1"/></filter>',
      });

      expect(result).toContain('<condition attribute="statecode" operator="eq" value="0"/>');
      expect(result).toContain('<condition attribute="gendercode" operator="eq" value="1"/>');
    });

    it('wrapsABareConditionInAFilterElement', () => {
      const result = buildViewFetchXml({
        baseXml: VIEW_XML,
        page: 1,
        pageSize: 10,
        filterXml: '<condition attribute="gendercode" operator="eq" value="1"/>',
      });

      expect(result).toContain('<filter type="and"><condition attribute="gendercode" operator="eq" value="1"/></filter>');
    });

    it('leavesTheViewUntouched_whenNoGridFilter', () => {
      const result = buildViewFetchXml({ baseXml: VIEW_XML, page: 1, pageSize: 10 });

      expect(result.match(/<filter/g)).toHaveLength(1);
    });
  });

  describe('link entities', () => {
    it('appendsALookupJoinInsideTheEntity', () => {
      const link =
        '<link-entity name="account" from="accountid" to="parentcustomerid" alias="lnk_a" link-type="inner">' +
        '<filter><condition attribute="name" operator="like" value="%QNB%"/></filter></link-entity>';

      const result = buildViewFetchXml({ baseXml: VIEW_XML, page: 1, pageSize: 10, linkEntityXml: link });

      expect(result).toContain(link);
      expect(result.indexOf(link)).toBeLessThan(result.indexOf('</entity>'));
    });

    it('keepsTheJoinOutsideTheFilterElement', () => {
      const result = buildViewFetchXml({
        baseXml: VIEW_XML,
        page: 1,
        pageSize: 10,
        filterXml: '<filter type="and"><condition attribute="gendercode" operator="eq" value="1"/></filter>',
        linkEntityXml: '<link-entity name="account" from="accountid" to="parentcustomerid" alias="lnk_a" link-type="inner"/>',
      });

      // A <link-entity> nested inside <filter> is invalid FetchXML.
      expect(result).not.toMatch(/<filter[^>]*>[^<]*<link-entity/);
      expect(result).toContain('</filter><link-entity');
    });

    it('leavesTheXmlAlone_whenNoJoinRequested', () => {
      const result = buildViewFetchXml({ baseXml: VIEW_XML, page: 1, pageSize: 10 });

      expect(result).not.toContain('link-entity');
    });
  });

  it('doesNotMutateTheSourceXml', () => {
    const original = VIEW_XML;

    buildViewFetchXml({ baseXml: VIEW_XML, page: 2, pageSize: 10, columnAttributes: ['gendercode'] });

    expect(VIEW_XML).toBe(original);
  });
});
