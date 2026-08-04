import type { SectionDefinition, TabDefinition } from '@qdb/shared';
import {
  sectionsToRender,
  visibleSectionsOf,
  nextSectionIndex,
  isSectionComplete,
} from './sectionReveal';

const emptyRules = { visibilityMap: new Map<string, boolean>(), requiredMap: new Map<string, boolean>() };

function section(id: string, order: number, fields: unknown[] = []): SectionDefinition {
  return { sectionId: id, displayLabel: id, displayOrder: order, fields } as unknown as SectionDefinition;
}

function tab(revealsOneAtATime: boolean): TabDefinition {
  return {
    tabId: 'tab-1',
    displayOrder: 1,
    revealsSectionsOneAtATime: revealsOneAtATime,
    sections: [section('sec-1', 1), section('sec-2', 2), section('sec-3', 3)],
  } as unknown as TabDefinition;
}

const ids = (sections: SectionDefinition[]) => sections.map((s) => s.sectionId);

describe('sectionsToRender', () => {
  it('returns_every_section_when_the_tab_shows_them_all_at_once', () => {
    expect(ids(sectionsToRender(tab(false), emptyRules, 0))).toEqual(['sec-1', 'sec-2', 'sec-3']);
  });

  it('returns_only_the_active_section_when_revealing_one_at_a_time', () => {
    expect(ids(sectionsToRender(tab(true), emptyRules, 1))).toEqual(['sec-2']);
  });

  it('counts_the_index_against_visible_sections_only', () => {
    const rules = { ...emptyRules, visibilityMap: new Map([['sec-2', false]]) };
    expect(ids(sectionsToRender(tab(true), rules, 1))).toEqual(['sec-3']);
  });

  it('falls_back_to_the_last_section_when_a_rule_hides_the_active_one', () => {
    const rules = { ...emptyRules, visibilityMap: new Map([['sec-3', false]]) };
    expect(ids(sectionsToRender(tab(true), rules, 2))).toEqual(['sec-2']);
  });

  it('returns_nothing_rather_than_crashing_when_all_sections_are_hidden', () => {
    const rules = {
      ...emptyRules,
      visibilityMap: new Map([['sec-1', false], ['sec-2', false], ['sec-3', false]]),
    };
    expect(sectionsToRender(tab(true), rules, 1)).toEqual([]);
  });
});

describe('nextSectionIndex', () => {
  it('advances_forward', () => {
    expect(nextSectionIndex(tab(true), emptyRules, 0, 1)).toBe(1);
  });

  it('steps_back', () => {
    expect(nextSectionIndex(tab(true), emptyRules, 2, -1)).toBe(1);
  });

  it('returns_null_past_the_last_section', () => {
    expect(nextSectionIndex(tab(true), emptyRules, 2, 1)).toBeNull();
  });

  it('returns_null_before_the_first_section', () => {
    expect(nextSectionIndex(tab(true), emptyRules, 0, -1)).toBeNull();
  });

  it('accounts_for_a_hidden_section_shortening_the_list', () => {
    const rules = { ...emptyRules, visibilityMap: new Map([['sec-3', false]]) };
    expect(nextSectionIndex(tab(true), rules, 1, 1)).toBeNull();
  });
});

describe('isSectionComplete', () => {
  const requiredField = { fieldKey: 'cr', isVisibleDefault: true, isRequiredDefault: true };

  it('passes_when_a_required_field_has_a_value', () => {
    const s = section('sec', 1, [requiredField]);
    expect(isSectionComplete(s, { cr: '123' }, emptyRules)).toBe(true);
  });

  it('fails_when_a_required_field_is_empty', () => {
    const s = section('sec', 1, [requiredField]);
    expect(isSectionComplete(s, { cr: '' }, emptyRules)).toBe(false);
  });

  it('ignores_an_optional_empty_field', () => {
    const s = section('sec', 1, [{ fieldKey: 'cr', isVisibleDefault: true, isRequiredDefault: false }]);
    expect(isSectionComplete(s, {}, emptyRules)).toBe(true);
  });

  it('does_not_block_on_a_required_field_a_rule_has_hidden', () => {
    const s = section('sec', 1, [requiredField]);
    const rules = { ...emptyRules, visibilityMap: new Map([['cr', false]]) };
    expect(isSectionComplete(s, {}, rules)).toBe(true);
  });

  it('blocks_on_a_field_a_rule_has_made_required', () => {
    const s = section('sec', 1, [{ fieldKey: 'cr', isVisibleDefault: true, isRequiredDefault: false }]);
    const rules = { ...emptyRules, requiredMap: new Map([['cr', true]]) };
    expect(isSectionComplete(s, {}, rules)).toBe(false);
  });

  it('treats_an_empty_multi_select_as_unfilled', () => {
    const s = section('sec', 1, [requiredField]);
    expect(isSectionComplete(s, { cr: [] }, emptyRules)).toBe(false);
  });
});

describe('visibleSectionsOf', () => {
  it('sorts_by_display_order', () => {
    const unordered = {
      tabId: 't', displayOrder: 1, revealsSectionsOneAtATime: true,
      sections: [section('b', 2), section('a', 1)],
    } as unknown as TabDefinition;
    expect(ids(visibleSectionsOf(unordered, emptyRules))).toEqual(['a', 'b']);
  });
});
