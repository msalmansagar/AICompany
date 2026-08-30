import { describe, it, expect } from 'vitest';
import { buildParallelGroupNodes } from './parallelGroups';
import type { GroupRect, ParallelGroupStep } from './parallelGroups';

const CARD = { w: 280, h: 90 };

function step(id: string, parentStepId: string | null = null, name = `Step ${id}`): ParallelGroupStep {
  return { id, parentStepId, name };
}

function rects(map: Record<string, { x: number; y: number }>): (id: string) => GroupRect | null {
  return (id) => (map[id] ? { ...map[id], ...CARD } : null);
}

describe('buildParallelGroupNodes', () => {
  it('should_wrap_the_branch_children_and_name_the_parent', () => {
    const steps = [step('p', null, 'Proposal Review'), step('c1', 'p'), step('c2', 'p')];
    const groups = buildParallelGroupNodes(
      steps,
      rects({ p: { x: 0, y: 0 }, c1: { x: 400, y: 0 }, c2: { x: 400, y: 140 } })
    );
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.id).toBe('pgroup_p');
    expect((group.data as { label: string }).label).toContain('Proposal Review');
    // The box covers both children plus padding, and sits behind the cards.
    expect(group.position.x).toBeLessThan(400);
    expect((group.data as { groupHeight: number }).groupHeight).toBeGreaterThan(230);
    expect(group.zIndex).toBe(-1);
    expect(group.selectable).toBe(false);
  });

  it('should_not_draw_a_band_an_unrelated_card_would_sit_inside', () => {
    const steps = [step('p'), step('c1', 'p'), step('c2', 'p'), step('stranger')];
    const groups = buildParallelGroupNodes(
      steps,
      rects({
        p: { x: 0, y: 0 },
        c1: { x: 400, y: 0 },
        c2: { x: 400, y: 300 },
        // Sits squarely between the two children.
        stranger: { x: 400, y: 150 },
      })
    );
    expect(groups).toHaveLength(0);
  });

  it('should_ignore_children_missing_from_this_canvas_and_groups_with_none', () => {
    const steps = [step('p'), step('c1', 'p'), step('ghost', 'p2')];
    const groups = buildParallelGroupNodes(steps, rects({ p: { x: 0, y: 0 }, c1: { x: 400, y: 0 } }));
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('pgroup_p');
  });

  it('should_return_nothing_for_a_process_without_branches', () => {
    expect(buildParallelGroupNodes([step('a'), step('b')], rects({}))).toHaveLength(0);
  });
});
