import { describe, it, expect } from 'vitest';
import { parseDesignerLayout, serializeDesignerLayout } from './designerLayout';
import { pathThroughPoint, pointOnPathThrough } from './edgeGeometry';

describe('designer layout round trip', () => {
  it('should_round_trip_positions_anchors_and_offsets', () => {
    const json = serializeDesignerLayout({
      nodePositions: { step_a: { x: 10, y: 20 } },
      edgeAnchors: { outcome_b: { x: 5, y: 6 } },
      labelOffsets: { outcome_b: { dx: -4, dy: 9 } },
    });
    const parsed = parseDesignerLayout(json);
    expect(parsed?.nodePositions.step_a).toEqual({ x: 10, y: 20 });
    expect(parsed?.edgeAnchors.outcome_b).toEqual({ x: 5, y: 6 });
    expect(parsed?.labelOffsets.outcome_b).toEqual({ dx: -4, dy: 9 });
  });

  it('should_drop_malformed_entries_and_survive_junk', () => {
    const parsed = parseDesignerLayout(
      JSON.stringify({
        v: 99,
        future: true,
        nodePositions: { ok: { x: 1, y: 2 }, bad: { x: 'NaN' }, worse: null },
        edgeAnchors: 'not-an-object',
        labelOffsets: { ok: { dx: 0, dy: 0 }, bad: { dx: Infinity, dy: 1 } },
      })
    );
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!.nodePositions)).toEqual(['ok']);
    expect(parsed!.edgeAnchors).toEqual({});
    expect(Object.keys(parsed!.labelOffsets)).toEqual(['ok']);
  });

  it('should_return_null_for_empty_or_invalid_json', () => {
    expect(parseDesignerLayout(null)).toBeNull();
    expect(parseDesignerLayout('')).toBeNull();
    expect(parseDesignerLayout('{oops')).toBeNull();
  });
});

describe('pathThroughPoint', () => {
  const s = { x: 0, y: 0 };
  const t = { x: 100, y: 0 };
  const a = { x: 50, y: 40 };

  it('should_pass_through_the_anchor_at_the_midpoint', () => {
    const mid = pointOnPathThrough(s, t, a, 0.5);
    expect(mid.x).toBeCloseTo(a.x);
    expect(mid.y).toBeCloseTo(a.y);
  });

  it('should_start_and_end_on_the_terminals', () => {
    expect(pointOnPathThrough(s, t, a, 0)).toEqual(s);
    expect(pointOnPathThrough(s, t, a, 1)).toEqual(t);
    expect(pathThroughPoint(s, t, a)).toContain('M 0,0 Q');
  });
});
