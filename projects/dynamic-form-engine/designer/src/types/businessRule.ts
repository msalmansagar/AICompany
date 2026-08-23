// Business Rule JSON Schema v1.0
// Stored in qdb_form_business_rule.qdb_rule_definition as serialized JSON.
// This contract must be kept in sync with the Dynamic Form Engine portal renderer.
// Schema version must be incremented when breaking changes are introduced.

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than';

export type LogicalOperator = 'AND' | 'OR';

export type RuleActionType =
  | 'show_field'
  | 'hide_field'
  // Tab and section targets. The runtime and the legacy plugin path have honoured these
  // since they existed; the designer format could not express them, so a rule aimed at a
  // tab was published as a rule aimed at nothing.
  | 'show_tab'
  | 'hide_tab'
  | 'show_section'
  | 'hide_section'
  | 'set_required'
  | 'clear_required'
  | 'set_value'
  | 'show_message';

/** Action types that act on a tab rather than a field. */
export const TAB_ACTION_TYPES: ReadonlySet<RuleActionType> = new Set(['show_tab', 'hide_tab']);

/** Action types that act on a section rather than a field. */
export const SECTION_ACTION_TYPES: ReadonlySet<RuleActionType> =
  new Set(['show_section', 'hide_section']);

export interface RuleCondition {
  /** Logical code of the triggering field — maps to qdb_form_field.qdb_code */
  field_code: string;
  operator: ConditionOperator;
  /** null is valid only for is_empty and is_not_empty operators */
  value: string | null;
}

export interface RuleConditionGroup {
  logical_operator: LogicalOperator;
  conditions: RuleCondition[];
}

export interface RuleAction {
  action_type: RuleActionType;
  /**
   * Logical code of the field this action targets. Optional since tab and section actions
   * exist — readers must not assume every action names a field.
   */
  target_field_code?: string;
  /** Record id of the tab this action targets. Required for show_tab / hide_tab. */
  target_tab_id?: string;
  /** Record id of the section this action targets. Required for show_section / hide_section. */
  target_section_id?: string;
  /** Required for set_value and show_message action types */
  value?: string;
}

/** Root schema for qdb_form_business_rule.qdb_rule_definition */
export interface BusinessRuleDefinition {
  /** Schema version — bump on breaking changes */
  version: '1.0';
  /** Field whose change event triggers rule evaluation */
  trigger_field_code: string;
  /** Extensible event type — currently only on_change is supported */
  trigger_event: 'on_change';
  condition_group: RuleConditionGroup;
  actions: RuleAction[];
}
