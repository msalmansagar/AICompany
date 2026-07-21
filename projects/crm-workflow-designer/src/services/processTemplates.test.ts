import { describe, it, expect } from 'vitest';
import { PROCESS_TEMPLATES, getTemplate } from '@/services/processTemplates';

const PROCESS_ID = 'process-under-test';

describe('getTemplate', () => {
  it('should_return_undefined_when_the_id_is_unknown', () => {
    expect(getTemplate('no-such-template')).toBeUndefined();
  });

  it('should_return_the_matching_template_for_every_known_id', () => {
    for (const template of PROCESS_TEMPLATES) {
      expect(getTemplate(template.id)).toBe(template);
    }
  });
});

describe('PROCESS_TEMPLATES metadata', () => {
  it('should_expose_unique_ids', () => {
    const ids = PROCESS_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should_give_every_template_an_icon_and_a_positive_step_count', () => {
    for (const template of PROCESS_TEMPLATES) {
      expect(template.icon.length).toBeGreaterThan(0);
      expect(template.stepCount).toBeGreaterThan(0);
    }
  });
});

describe.each(PROCESS_TEMPLATES.map((template) => [template.id, template] as const))(
  'template.build(): %s',
  (_id, template) => {
    const graph = template.build(PROCESS_ID);

    it('should_build_a_step_count_matching_the_declared_stepCount', () => {
      expect(graph.steps.length).toBe(template.stepCount);
    });

    it('should_generate_unique_crmIds_across_steps_outcomes_and_routes', () => {
      const ids = [
        ...graph.steps.map((step) => step.crmId),
        ...graph.outcomes.map((outcome) => outcome.crmId),
        ...graph.routes.map((route) => route.crmId),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should_point_every_route_at_an_outcome_in_the_same_graph', () => {
      const outcomeIds = new Set(graph.outcomes.map((outcome) => outcome.crmId));
      for (const route of graph.routes) {
        expect(outcomeIds.has(route.outcomeId)).toBe(true);
      }
    });

    it('should_point_every_advancing_outcome_at_a_step_in_the_same_graph', () => {
      const stepIds = new Set(graph.steps.map((step) => step.crmId));
      for (const outcome of graph.outcomes) {
        if (outcome.nextStepId !== null) {
          expect(stepIds.has(outcome.nextStepId)).toBe(true);
        }
      }
    });

    it('should_root_every_outcome_at_a_step_in_the_same_graph', () => {
      const stepIds = new Set(graph.steps.map((step) => step.crmId));
      for (const outcome of graph.outcomes) {
        expect(stepIds.has(outcome.stepId)).toBe(true);
      }
    });

    it('should_stamp_the_process_id_onto_every_step', () => {
      for (const step of graph.steps) {
        expect(step.processId).toBe(PROCESS_ID);
      }
    });
  }
);
