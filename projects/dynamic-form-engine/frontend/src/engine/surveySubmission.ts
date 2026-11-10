// CSE-ENG-001 B6: the survey branch of the in-CRM runtime. A survey is opened for one invitation,
// not by form id, and its answers go to qdb_srv_SubmitResponse instead of mapped CRM entities.
import type { FormDefinition, FormFieldValues } from '@qdb/shared';

/** Which invitation the page renders: an id plus the customer it belongs to, or a link token. */
export interface SurveyContext {
  invitationId?: string;
  customerId?: string;
  token?: string;
}

/** One element of qdb_srv_SubmitResponse's AnswersJson. */
export interface SurveyAnswer {
  questionCode: string;
  value: string;
}

const MULTI_VALUE_SEPARATOR = ',';

/**
 * Reads a survey context from the web resource's `data` parameter, which then holds a query
 * string such as `invitationId=<guid>&customerId=<guid>` or `token=<token>`. A plain form
 * definition GUID (every non-survey use) answers null, so standard forms are unaffected.
 */
export function parseSurveyContext(data: string | null): SurveyContext | null {
  if (!data) return null;
  const params = new URLSearchParams(data.includes('=') ? data : '');
  const context: SurveyContext = {
    invitationId: params.get('invitationId') ?? undefined,
    customerId: params.get('customerId') ?? undefined,
    token: params.get('token') ?? undefined,
  };
  return context.token || context.invitationId ? context : null;
}

/**
 * The answers to send: one per question of the form that has a value, in form order. Option
 * values are sent as stored (the server turns them into labels); several values are joined with
 * a comma; empty answers are left out.
 */
export function buildSurveyAnswers(form: FormDefinition, values: FormFieldValues): SurveyAnswer[] {
  const schemaNames = form.tabs.flatMap((tab) => tab.sections.flatMap((section) => section.fields.map((field) => field.schemaName)));
  return schemaNames
    .filter((schemaName): schemaName is string => Boolean(schemaName))
    .map((schemaName) => ({ questionCode: schemaName, value: toAnswerText(values[schemaName]) }))
    .filter((answer) => answer.value !== '');
}

function toAnswerText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(toAnswerText).filter((part) => part !== '').join(MULTI_VALUE_SEPARATOR);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}
