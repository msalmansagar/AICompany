/**
 * Table icons for the survey tables, in the same style as the Form Engine's
 * (dynamic-form-engine/scripts/set-entity-icons.mjs): 20×20 viewBox, QDB blue #0078d4, 1.5
 * stroke, no fill. Each becomes an SVG web resource qdb_icon_<table without qdb_> and the
 * table's IconVectorName.
 *
 * @module survey-provisioning/ui-icons
 */

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">${body}</svg>`;
const STROKE = 'stroke="#0078d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

/** Table → label and SVG. */
export const ICONS = Object.freeze({
  // A request table feeding surveys: a database cylinder.
  qdb_survey_source: {
    label: 'Survey Source',
    svg: svg(`<ellipse cx="10" cy="5" rx="6" ry="2.5" ${STROKE}/><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" ${STROKE}/><path d="M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" ${STROKE}/>`),
  },
  // A survey definition: a clipboard with a checklist.
  qdb_survey_setup: {
    label: 'Survey Setup',
    svg: svg(`<rect x="4" y="3.5" width="12" height="14.5" rx="1.5" ${STROKE}/><rect x="7.5" y="2" width="5" height="3" rx="1" ${STROKE}/>`
      + `<polyline points="6.5,9 7.5,10 9,8.5" ${STROKE}/><line x1="10.5" y1="9.5" x2="13.5" y2="9.5" ${STROKE}/>`
      + `<polyline points="6.5,13 7.5,14 9,12.5" ${STROKE}/><line x1="10.5" y1="13.5" x2="13.5" y2="13.5" ${STROKE}/>`),
  },
  // When a survey is sent: a lightning bolt.
  qdb_survey_trigger: {
    label: 'Survey Trigger',
    svg: svg(`<path d="M11.5 2L5 11h4.5L8.5 18 15 9h-4.5L11.5 2z" ${STROKE}/>`),
  },
  // One survey sent to one customer: an envelope.
  qdb_survey_invitation: {
    label: 'Survey Invitation',
    svg: svg(`<rect x="2.5" y="4.5" width="15" height="11" rx="1.5" ${STROKE}/><polyline points="3,5.5 10,11 17,5.5" ${STROKE}/>`),
  },
  // A submitted response: a speech bubble with a tick.
  qdb_survey_response: {
    label: 'Survey Response',
    svg: svg(`<path d="M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 13V5A1.5 1.5 0 0 1 4 3.5z" ${STROKE}/><polyline points="7,9 9,11 13,7" ${STROKE}/>`),
  },
  // One answered question, often a rating: a star.
  qdb_survey_answer: {
    label: 'Survey Answer',
    svg: svg(`<path d="M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8L10 2.5z" ${STROKE}/>`),
  },
  // Why a trigger sent nothing: a list crossed by a "no" sign.
  qdb_survey_suppression_log: {
    label: 'Survey Suppression Log',
    svg: svg(`<line x1="3" y1="5" x2="9" y2="5" ${STROKE}/><line x1="3" y1="9" x2="8" y2="9" ${STROKE}/><line x1="3" y1="13" x2="7" y2="13" ${STROKE}/>`
      + `<circle cx="13.5" cy="12.5" r="4" ${STROKE}/><line x1="10.7" y1="15.3" x2="16.3" y2="9.7" ${STROKE}/>`),
  },
  // Org-wide settings: a gear.
  qdb_survey_settings: {
    label: 'Survey Settings',
    svg: svg(`<circle cx="10" cy="10" r="2.5" ${STROKE}/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" ${STROKE}/>`
      + `<circle cx="10" cy="10" r="5.5" ${STROKE}/>`),
  },
  // The SMS hand-off: a phone with a message bubble.
  qdb_survey_sms_config: {
    label: 'Survey SMS Config',
    svg: svg(`<rect x="3" y="2.5" width="8" height="15" rx="1.5" ${STROKE}/><line x1="6" y1="15" x2="8" y2="15" ${STROKE}/>`
      + `<path d="M12.5 5.5h4a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-1.5l-2 1.5v-1.5h-.5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" ${STROKE}/>`),
  },
});

/** The web resource name for a table's icon, matching the Form Engine's qdb_icon_<name> convention. */
export const iconResourceName = (table) => `qdb_icon_${table.replace(/^qdb_/, '')}`;
