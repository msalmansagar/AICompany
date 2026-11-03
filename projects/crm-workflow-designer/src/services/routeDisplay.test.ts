// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { routeCanvasLabel, wantsResolvedConditionLabel, truncateRouteLabel } from './routeDisplay';

const CONDITION_XML =
  '<filter type="and"><condition attribute="qdb_amount" operator="gt" value="10000000" /></filter>';
const EMPTY_XML = '<filter type="and"></filter>';

describe('routeCanvasLabel', () => {
  it('should_show_the_name_and_nothing_else_for_a_named_route', () => {
    expect(
      routeCanvasLabel({ name: 'CEO Route', filter: CONDITION_XML, isDefault: false })
    ).toBe('CEO Route');
  });

  it('should_say_Default_in_business_language_never_else', () => {
    expect(routeCanvasLabel({ name: '', filter: EMPTY_XML, isDefault: true })).toBe('Default');
    // A custom name on the default route wins over the generic word.
    expect(
      routeCanvasLabel({ name: 'Rejected / Default', filter: EMPTY_XML, isDefault: true })
    ).toBe('Rejected / Default');
  });

  it('should_fall_back_to_a_short_condition_only_when_the_route_is_nameless', () => {
    const label = routeCanvasLabel({ name: '', filter: CONDITION_XML, isDefault: false });
    expect(label).toContain('qdb_amount');
    expect(label).toContain('>');
  });

  it('should_clamp_long_names_to_canvas_width', () => {
    const longName = 'A very long route name that would run to banner width at low zoom';
    const label = routeCanvasLabel({ name: longName, filter: '', isDefault: false });
    expect(label.length).toBeLessThanOrEqual(34);
    expect(label.endsWith('…')).toBe(true);
  });

  it('should_never_render_the_technical_else_word', () => {
    expect(routeCanvasLabel({ name: '', filter: EMPTY_XML, isDefault: false })).toBe('Route');
  });
});

describe('wantsResolvedConditionLabel', () => {
  it('should_dress_only_nameless_conditional_routes', () => {
    expect(
      wantsResolvedConditionLabel({ name: '', filter: CONDITION_XML, isDefault: false })
    ).toBe(true);
    expect(
      wantsResolvedConditionLabel({ name: 'CEO Route', filter: CONDITION_XML, isDefault: false })
    ).toBe(false);
    expect(wantsResolvedConditionLabel({ name: '', filter: EMPTY_XML, isDefault: true })).toBe(false);
  });
});

describe('truncateRouteLabel', () => {
  it('should_leave_short_labels_alone', () => {
    expect(truncateRouteLabel('Default')).toBe('Default');
  });
});
