// Dataverse string ceilings the designer must not exceed.
//
// These mirror the MaxLength provisioned on the column. They live here rather than inline
// so a widening runs as one edit: change the provisioning script, change the constant.
// A designer input that lets a maker type past the column ceiling fails at save with a
// raw OData error, so every bound input states its limit.

/** qdb_form_definition / qdb_form_tab .qdb_submit_confirmation_label — widened from 200. */
export const SUBMIT_CONFIRMATION_LABEL_MAX_LENGTH = 1000;
