/** Raw Dataverse API response for qdb_work_item_record_type */
export interface RawProcess {
  qdb_work_item_record_typeid: string;
  qdb_name: string;
  qdb_recordentity: string;
  qdb_regardingfield: string;
  qdb_parententity: string;
  qdb_version_major: number;
  qdb_version_minor: number;
  qdb_workflow_state: number;
  qdb_workflow_snapshot: string | null;
}

/** Raw Dataverse API response for qdb_work_item_steps */
export interface RawStep {
  qdb_work_item_stepsid: string;
  qdb_name: string;
  qdb_schemaname: string;
  qdb_sequenceno: number;
  qdb_tasksubject: string;
  qdb_taskdescription: string;
  qdb_recordentity: string;
  qdb_regardingfield: string;
  qdb_parententity: string;
  qdb_task_assign_to: number;
  '_qdb_assigned_user_value': string | null;
  'qdb_assigned_user_fullname': string | null;
  '_qdb_team_value': string | null;
  'qdb_team_name': string | null;
  qdb_enableroundrobin: boolean;
  '_qdb_roundrobinteam_value': string | null;
  'qdb_roundrobinteam_name': string | null;
  '_qdb_record_type_value': string;
}

/** Raw Dataverse API response for qdb_outcome */
export interface RawOutcome {
  qdb_outcomeid: string;
  qdb_name: string;
  qdb_sequencenumber: number;
  qdb_applyfilter: boolean;
  '_qdb_workitemstep_value': string;
}

/** Raw Dataverse API response for qdb_outcomeworktasks */
export interface RawRoute {
  qdb_outcomeworktasksid: string;
  qdb_name: string;
  qdb_subject: string;
  qdb_sequencenumber: number;
  qdb_filter: string;
  '_qdb_outcome_value': string;
  '_qdb_nextworkitemstep_value': string;
}

/** Metadata response from EntityDefinitions */
export interface RawEntityMetadata {
  LogicalName: string;
  DisplayName: { UserLocalizedLabel: { Label: string } | null } | null;
  ObjectTypeCode: number;
}

/** Metadata response from Attributes */
export interface RawAttributeMetadata {
  SchemaName: string;
  DisplayName: { UserLocalizedLabel: { Label: string } | null } | null;
  AttributeType: string;
}

/** SystemUser query response */
export interface RawSystemUser {
  systemuserid: string;
  fullname: string;
  domainname: string;
}

/** Team query response */
export interface RawTeam {
  teamid: string;
  name: string;
}

/** OData collection response wrapper */
export interface ODataCollection<T> {
  value: T[];
}

export type CrmApiError = {
  kind: 'crmApiError';
  status: number;
  message: string;
};

export type CrmContextError = {
  kind: 'crmContextError';
  message: string;
};

export type CrmError = CrmApiError | CrmContextError;
