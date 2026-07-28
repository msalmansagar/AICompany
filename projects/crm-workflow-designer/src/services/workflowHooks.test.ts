import { describe, it, expect } from 'vitest';
import {
  emptyWorkflowHooks,
  mapWorkflowHooks,
  buildWorkflowHookBindPatches,
  hookSelectColumns,
  hookColumn,
  configuredHookCount,
  workflowHookSummary,
  mapCallableWorkflow,
  CALLABLE_WORKFLOW_QUERY,
  STEP_HOOKS,
  OUTCOME_HOOKS,
  HOOK_LABELS,
} from '@/services/workflowHooks';

const FMT = '@OData.Community.Display.V1.FormattedValue';

describe('hook columns', () => {
  it('should_use_the_engines_column_for_task_creation', () => {
    expect(hookColumn('onTaskCreation')).toBe('qdb_callworkflowontaskcreation');
  });

  it('should_use_the_engines_column_for_task_completion', () => {
    expect(hookColumn('onTaskCompletion')).toBe('qdb_callworkflowontaskcompletion');
  });

  it('should_carry_the_on_hold_hook_the_step_table_has', () => {
    expect(STEP_HOOKS).toContain('onTaskOnHold');
  });

  it('should_not_offer_the_on_hold_hook_where_the_table_lacks_it', () => {
    expect(OUTCOME_HOOKS).not.toContain('onTaskOnHold');
  });
});

describe('emptyWorkflowHooks', () => {
  it('should_create_one_empty_hook_per_kind', () => {
    expect(emptyWorkflowHooks(OUTCOME_HOOKS)).toEqual({
      onTaskCreation: { workflowId: null, workflowName: null },
      onTaskCompletion: { workflowId: null, workflowName: null },
    });
  });
});

describe('mapWorkflowHooks', () => {
  it('should_read_an_absent_hook_as_unset', () => {
    expect(mapWorkflowHooks({}, OUTCOME_HOOKS).onTaskCreation).toEqual({
      workflowId: null,
      workflowName: null,
    });
  });

  it('should_read_the_workflow_and_its_display_name', () => {
    const hooks = mapWorkflowHooks(
      {
        '_qdb_callworkflowontaskcompletion_value': 'wf-1',
        [`_qdb_callworkflowontaskcompletion_value${FMT}`]: 'Notify Underwriter',
      },
      OUTCOME_HOOKS
    );
    expect(hooks.onTaskCompletion).toEqual({ workflowId: 'wf-1', workflowName: 'Notify Underwriter' });
  });

  it('should_only_read_the_kinds_it_is_asked_for', () => {
    const hooks = mapWorkflowHooks({ '_qdb_callworkflowontaskonhold_value': 'wf-9' }, OUTCOME_HOOKS);
    expect(hooks.onTaskOnHold).toBeUndefined();
  });
});

describe('buildWorkflowHookBindPatches', () => {
  const resolveNavProp = async (_entity: string, attribute: string) => `nav_${attribute}`;

  it('should_return_empty_when_no_hooks_are_part_of_the_write', async () => {
    expect(await buildWorkflowHookBindPatches(undefined, resolveNavProp, 'e', 'workflows')).toEqual({});
  });

  it('should_bind_a_chosen_workflow', async () => {
    const patches = await buildWorkflowHookBindPatches(
      { onTaskCompletion: { workflowId: 'wf-1', workflowName: 'Notify' } },
      resolveNavProp, 'e', 'workflows'
    );
    expect(patches).toEqual({ 'nav_qdb_callworkflowontaskcompletion@odata.bind': '/workflows(wf-1)' });
  });

  it('should_clear_a_removed_hook_through_its_nav_prop', async () => {
    const patches = await buildWorkflowHookBindPatches(
      { onTaskCreation: { workflowId: null, workflowName: null } },
      resolveNavProp, 'e', 'workflows'
    );
    expect(patches).toEqual({ 'nav_qdb_callworkflowontaskcreation@odata.bind': null });
  });

  it('should_bind_every_hook_supplied', async () => {
    const patches = await buildWorkflowHookBindPatches(
      {
        onTaskCreation: { workflowId: 'wf-1', workflowName: 'A' },
        onTaskCompletion: { workflowId: 'wf-2', workflowName: 'B' },
      },
      resolveNavProp, 'e', 'workflows'
    );
    expect(Object.keys(patches)).toHaveLength(2);
  });
});

describe('hookSelectColumns', () => {
  it('should_request_the_lookup_value_column_for_each_kind', () => {
    expect(hookSelectColumns(OUTCOME_HOOKS)).toBe(
      '_qdb_callworkflowontaskcreation_value,_qdb_callworkflowontaskcompletion_value'
    );
  });
});

describe('configuredHookCount and summary', () => {
  it('should_count_nothing_when_no_hook_names_a_workflow', () => {
    expect(configuredHookCount(emptyWorkflowHooks(STEP_HOOKS))).toBe(0);
  });

  it('should_count_only_hooks_that_name_a_workflow', () => {
    expect(configuredHookCount({
      onTaskCreation: { workflowId: 'wf-1', workflowName: 'A' },
      onTaskCompletion: { workflowId: null, workflowName: null },
    })).toBe(1);
  });

  it('should_have_no_summary_when_nothing_is_hooked_up', () => {
    expect(workflowHookSummary(emptyWorkflowHooks(STEP_HOOKS))).toBeNull();
  });

  it('should_use_the_singular_for_one_workflow', () => {
    expect(workflowHookSummary({ onTaskCreation: { workflowId: 'wf-1', workflowName: 'A' } }))
      .toBe('1 workflow');
  });

  it('should_use_the_plural_beyond_one', () => {
    expect(workflowHookSummary({
      onTaskCreation: { workflowId: 'wf-1', workflowName: 'A' },
      onTaskCompletion: { workflowId: 'wf-2', workflowName: 'B' },
    })).toBe('2 workflows');
  });
});

describe('callable workflows', () => {
  it('should_only_offer_workflows_the_engine_can_execute_on_demand', () => {
    expect(CALLABLE_WORKFLOW_QUERY).toContain('ondemand eq true');
    expect(CALLABLE_WORKFLOW_QUERY).toContain('statecode eq 1');
    expect(CALLABLE_WORKFLOW_QUERY).toContain('category eq 0');
  });

  it('should_map_a_workflow_row_with_the_table_it_targets', () => {
    expect(mapCallableWorkflow({ workflowid: 'wf-1', name: 'Notify', primaryentity: 'task' })).toEqual({
      id: 'wf-1',
      name: 'Notify',
      primaryEntity: 'task',
    });
  });
});

describe('hook labels', () => {
  it('should_describe_each_hook_in_the_makers_terms_not_the_columns', () => {
    expect(HOOK_LABELS.onTaskCompletion).toBe('When the task is completed');
    expect(HOOK_LABELS.onTaskOnHold).toBe('When the task is put on hold');
  });
});
