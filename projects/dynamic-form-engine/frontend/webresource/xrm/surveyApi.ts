// CSE-ENG-001 B6: the survey Custom APIs as the in-CRM runtime calls them. A survey page is opened
// for one invitation; it renders the invitation's pinned form version (qdb_srv_GetSurvey) and
// submits to qdb_srv_SubmitResponse, never to mapped CRM entities.
import type { FormDefinition, FormFieldValues } from '@qdb/shared';
import { buildSurveyAnswers, type SurveyContext } from '../../src/engine/surveySubmission';
import { executeUnboundAction, type ActionParameter } from './xrmClient';

const GET_SURVEY = 'qdb_srv_GetSurvey';
const SUBMIT_RESPONSE = 'qdb_srv_SubmitResponse';
const PRIMITIVE = 1;

// Page-scoped, like formApi's loadedForm: the renderer calls formApi with only a form code, so the
// invitation cannot travel as an argument. Set once at page load; a new page is a new module.
let activeSurvey: SurveyContext | null = null;
// The entry point needs the form code before the renderer mounts and asks for the JSON; keeping
// that first answer saves the renderer a second GetSurvey call for the same language.
let prefetched: { languages: string[]; survey: { formCode: string; runtimeJson: string } } | null = null;

/** Puts the runtime in survey mode for this invitation. */
export function startSurvey(context: SurveyContext): void {
  activeSurvey = context;
  prefetched = null;
}

/** The invitation being answered, or null when the page renders a standard form. */
export function getActiveSurvey(): SurveyContext | null {
  return activeSurvey;
}

function text(value: string | undefined): ActionParameter {
  return { value: value ?? '', typeName: 'Edm.String', structuralProperty: PRIMITIVE };
}

function identification(context: SurveyContext): Record<string, ActionParameter> {
  return { InvitationId: text(context.invitationId), CallerCustomerId: text(context.customerId), Token: text(context.token) };
}

/** The pinned survey JSON for the invitation, in the requested language when it was published in it. */
export async function fetchSurvey(context: SurveyContext, language: string): Promise<{ formCode: string; runtimeJson: string }> {
  if (prefetched && prefetched.languages.includes(language)) return prefetched.survey;
  const result = await executeUnboundAction(GET_SURVEY, { ...identification(context), Language: text(language) });
  const survey = { formCode: String(result.FormCode), runtimeJson: String(result.RuntimeJson) };
  // Matches both what was asked ('' on first load) and what the server rendered ('en').
  prefetched = { languages: [language, String(result.RenderedLanguage)], survey };
  return survey;
}

/** Submits the answers; answers the new response id, shown to the customer as the reference. */
export async function submitSurvey(context: SurveyContext, form: FormDefinition, values: FormFieldValues): Promise<string> {
  const answers = buildSurveyAnswers(form, values);
  const result = await executeUnboundAction(SUBMIT_RESPONSE, { ...identification(context), AnswersJson: text(JSON.stringify(answers)) });
  return String(result.ResponseId);
}
