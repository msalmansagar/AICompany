import { describe, it, expect } from 'vitest';
import type { FormDefinition } from '@qdb/shared';
import { buildSurveyAnswers, parseSurveyContext } from './surveySubmission';

const form = {
  tabs: [
    { sections: [{ fields: [{ schemaName: 'srv_overall' }, { schemaName: 'srv_channel' }, { schemaName: '' }] }] },
    { sections: [{ fields: [{ schemaName: 'srv_well' }] }] },
  ],
} as unknown as FormDefinition;

describe('parseSurveyContext', () => {
  it('should_return_null_for_a_plain_form_definition_guid', () => {
    expect(parseSurveyContext('0d39ab5e-fedc-f111-84ea-000d3abd8313')).toBeNull();
  });

  it('should_read_invitation_and_customer_ids', () => {
    expect(parseSurveyContext('invitationId=abc&customerId=def')).toEqual({ invitationId: 'abc', customerId: 'def', token: undefined });
  });

  it('should_read_a_link_token', () => {
    expect(parseSurveyContext('token=xyz')?.token).toBe('xyz');
  });

  it('should_return_null_when_neither_invitation_nor_token_is_given', () => {
    expect(parseSurveyContext('customerId=def')).toBeNull();
  });
});

describe('buildSurveyAnswers', () => {
  it('should_send_answered_questions_in_form_order_as_text', () => {
    expect(buildSurveyAnswers(form, { srv_well: 'Fast', srv_overall: 5 })).toEqual([
      { questionCode: 'srv_overall', value: '5' },
      { questionCode: 'srv_well', value: 'Fast' },
    ]);
  });

  it('should_join_several_values_with_a_comma', () => {
    expect(buildSurveyAnswers(form, { srv_channel: ['1', '2'] })).toEqual([{ questionCode: 'srv_channel', value: '1,2' }]);
  });

  it('should_leave_out_empty_answers_and_values_of_fields_not_on_the_form', () => {
    expect(buildSurveyAnswers(form, { srv_overall: '', srv_other: 'x', srv_well: '  ' })).toEqual([]);
  });
});
