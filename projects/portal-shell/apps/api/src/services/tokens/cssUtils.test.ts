// RED → GREEN → REFACTOR — cssUtils unit tests
//
// Verifies read-time sanitisation logic in sanitiseResolvedMap (Audit A-003-003).

import { describe, it, expect } from 'vitest';
import { sanitiseResolvedMap } from './cssUtils.js';

describe('sanitiseResolvedMap', () => {
  it('should_return_empty_object_when_map_is_empty', () => {
    expect(sanitiseResolvedMap({})).toEqual({});
  });

  it('should_pass_through_valid_css_value_unchanged', () => {
    const result = sanitiseResolvedMap({ 'color-primary': '#1a4d8f' });
    expect(result['color-primary']).toBe('#1a4d8f');
  });

  it('should_strip_semicolons_at_read_time', () => {
    const result = sanitiseResolvedMap({ spacing: '16px; color: red' });
    expect(result['spacing']).toBe('16px color: red');
  });

  it('should_neutralise_url_function_at_read_time', () => {
    const result = sanitiseResolvedMap({ bg: 'url(http://evil.com/x.png)' });
    expect(result['bg']).toContain('url-blocked(');
    expect(result['bg']).not.toContain('url(');
  });

  it('should_neutralise_expression_function_at_read_time', () => {
    const result = sanitiseResolvedMap({ val: 'expression(alert(1))' });
    expect(result['val']).toContain('expression-blocked(');
  });

  it('should_neutralise_import_function_at_read_time', () => {
    const result = sanitiseResolvedMap({ val: 'import(styles.css)' });
    expect(result['val']).toContain('import-blocked(');
  });

  it('should_encode_lt_angle_bracket_to_prevent_style_tag_breakout', () => {
    const result = sanitiseResolvedMap({ val: '</style><script>alert(1)' });
    expect(result['val']).not.toContain('<');
    expect(result['val']).toContain('&lt;');
  });

  it('should_encode_gt_angle_bracket_to_prevent_style_tag_breakout', () => {
    const result = sanitiseResolvedMap({ val: 'calc(10px > 5px)' });
    expect(result['val']).not.toContain('>');
    expect(result['val']).toContain('&gt;');
  });

  it('should_sanitise_all_entries_in_the_map', () => {
    const result = sanitiseResolvedMap({
      'color-primary': '#1a4d8f',
      'spacing-base': '16px; color: red',
      'icon-mirror': 'true',
    });
    expect(result['color-primary']).toBe('#1a4d8f');
    expect(result['spacing-base']).toBe('16px color: red');
    expect(result['icon-mirror']).toBe('true');
  });

  it('should_not_mutate_the_input_map', () => {
    const input = { val: '16px; color: red' };
    sanitiseResolvedMap(input);
    expect(input['val']).toBe('16px; color: red');
  });
});
