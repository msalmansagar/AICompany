import { describe, it, expect } from 'vitest';
import { resolveSimEndpoints } from './simEndpoints';

describe('resolveSimEndpoints', () => {
  it('should_use_stored_edit_terminals_when_both_exist', () => {
    const endpoints = resolveSimEndpoints(
      {
        edit_start: { x: -80, y: 0 },
        edit_end: { x: 1100, y: 0 },
        step_a: { x: 300, y: 0 },
      },
      ['a']
    );
    expect(endpoints.start).toEqual({ x: -80, y: 0 });
    expect(endpoints.end).toEqual({ x: 1100, y: 0 });
    expect(endpoints.dir).toBe('LR');
  });

  it('should_report_TB_for_stored_terminals_stacked_vertically', () => {
    const endpoints = resolveSimEndpoints(
      { edit_start: { x: 300, y: -80 }, edit_end: { x: 300, y: 900 } },
      []
    );
    expect(endpoints.dir).toBe('TB');
  });

  it('should_place_terminals_on_the_horizontal_axis_for_a_row_of_steps', () => {
    const endpoints = resolveSimEndpoints(
      {
        step_a: { x: 100, y: 50 },
        step_b: { x: 500, y: 60 },
        step_c: { x: 900, y: 40 },
      },
      ['a', 'b', 'c']
    );
    expect(endpoints.dir).toBe('LR');
    expect(endpoints.start.x).toBeLessThan(100);
    expect(endpoints.start.y).toBe(50);
    expect(endpoints.end.x).toBeGreaterThan(900);
    expect(endpoints.end.y).toBe(40);
  });

  it('should_place_terminals_on_the_vertical_axis_for_a_column_of_steps', () => {
    const endpoints = resolveSimEndpoints(
      {
        step_a: { x: 300, y: 80 },
        step_b: { x: 310, y: 400 },
      },
      ['a', 'b']
    );
    expect(endpoints.dir).toBe('TB');
    expect(endpoints.start.y).toBeLessThan(80);
    expect(endpoints.end.y).toBeGreaterThan(400);
  });

  it('should_fall_back_to_static_defaults_when_no_step_has_a_position', () => {
    const endpoints = resolveSimEndpoints({}, ['a', 'b']);
    expect(endpoints.start).toEqual({ x: 300, y: -80 });
    expect(endpoints.end).toEqual({ x: 300, y: 2 * 160 + 80 });
    expect(endpoints.dir).toBe('TB');
  });
});
