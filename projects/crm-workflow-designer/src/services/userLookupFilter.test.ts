import { describe, it, expect } from 'vitest';
import { buildUserLookupFilter } from './userLookupFilter';

describe('buildUserLookupFilter', () => {
  it('should_exclude_disabled_users', () => {
    expect(buildUserLookupFilter()).toContain('isdisabled eq false');
  });

  // 200 of the 699 enabled accounts on org5869857f are non-interactive service
  // accounts. They cannot sign in, so they can never open a task.
  it('should_offer_only_access_modes_a_person_can_sign_in_with', () => {
    const filter = buildUserLookupFilter();
    expect(filter).toContain('accessmode eq 0');
    expect(filter).toContain('accessmode eq 1');
    expect(filter).not.toContain('accessmode eq 4');
  });

  it('should_group_the_access_modes_so_the_or_does_not_escape_the_and', () => {
    // Ungrouped, "a and b or c" would readmit every non-interactive account.
    expect(buildUserLookupFilter()).toContain('(accessmode eq 0 or accessmode eq 1)');
  });

  it('should_leave_the_search_clause_out_entirely_when_none_is_given', () => {
    expect(buildUserLookupFilter()).not.toContain('contains(');
  });

  it('should_search_the_name_by_default', () => {
    expect(buildUserLookupFilter('Ahmed')).toBe(
      "isdisabled eq false and (accessmode eq 0 or accessmode eq 1) and (contains(fullname,'Ahmed'))"
    );
  });

  // The Dataverse adapter searches the sign-in name too; that behaviour is kept.
  it('should_search_every_field_it_is_given', () => {
    const filter = buildUserLookupFilter('Fatima', ['fullname', 'domainname']);
    expect(filter).toContain("contains(fullname,'Fatima') or contains(domainname,'Fatima')");
  });

  it('should_group_a_multi_field_search_so_it_does_not_widen_the_whole_filter', () => {
    const filter = buildUserLookupFilter('x', ['fullname', 'domainname']);
    expect(filter).toContain("and (contains(fullname,'x') or contains(domainname,'x'))");
  });
});
