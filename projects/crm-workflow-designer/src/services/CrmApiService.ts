import type { CrmContext } from '../types/CrmTypes';
import type { WorkflowDefinition } from '../types/WorkflowTypes';

const WORKFLOW_ENTITY_SET = 'wf_workflowdefinitions';
const DEFINITION_FIELD = 'wf_definition';
const NAME_FIELD = 'wf_name';
const TARGET_ENTITY_FIELD = 'wf_targetentity';
const MAX_DEFINITION_BYTES = 100_000;
const WARN_DEFINITION_BYTES = 90_000;

export interface SaveResult {
  success: boolean;
  recordId?: string;
  error?: string;
  sizeWarning?: string;
}

export interface LoadResult {
  success: boolean;
  definition?: WorkflowDefinition;
  name?: string;
  error?: string;
}

export class CrmApiService {
  private readonly baseUrl: string;

  constructor(context: CrmContext) {
    this.baseUrl = `${context.orgUrl}/api/data/v9.2`;
  }

  async saveWorkflow(
    definition: WorkflowDefinition,
    name: string,
    targetEntity: string,
    recordId: string | null
  ): Promise<SaveResult> {
    const json = JSON.stringify(definition);
    const sizeCheck = checkDefinitionSize(json);
    if (sizeCheck.blocked) {
      return { success: false, error: sizeCheck.message };
    }

    const body = {
      [NAME_FIELD]: name,
      [DEFINITION_FIELD]: json,
      [TARGET_ENTITY_FIELD]: targetEntity,
    };

    try {
      if (recordId) {
        await this.patch(`${WORKFLOW_ENTITY_SET}(${recordId})`, body);
        return { success: true, recordId, sizeWarning: sizeCheck.warning };
      }

      const newId = await this.post(WORKFLOW_ENTITY_SET, body);
      return { success: true, recordId: newId, sizeWarning: sizeCheck.warning };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  async loadWorkflow(recordId: string): Promise<LoadResult> {
    const url = `${this.baseUrl}/${WORKFLOW_ENTITY_SET}(${recordId})?$select=${NAME_FIELD},${DEFINITION_FIELD},${TARGET_ENTITY_FIELD}`;
    try {
      const response = await this.fetch(url);
      const raw = response[DEFINITION_FIELD] as string | undefined;
      if (!raw) {
        return { success: false, error: 'Workflow definition field is empty.' };
      }

      const definition = JSON.parse(raw) as WorkflowDefinition;
      return { success: true, definition, name: response[NAME_FIELD] as string };
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  private async fetch(url: string): Promise<Record<string, unknown>> {
    const response = await window.fetch(url, { headers: buildHeaders() });
    if (!response.ok) {
      throw new Error(`CRM API error ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<Record<string, unknown>>;
  }

  private async patch(path: string, body: Record<string, unknown>): Promise<void> {
    const response = await window.fetch(`${this.baseUrl}/${path}`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`CRM API error ${response.status}: ${await response.text()}`);
    }
  }

  private async post(path: string, body: Record<string, unknown>): Promise<string> {
    const response = await window.fetch(`${this.baseUrl}/${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`CRM API error ${response.status}: ${await response.text()}`);
    }
    const location = response.headers.get('OData-EntityId') ?? '';
    const match = /\(([^)]+)\)$/.exec(location);
    return match ? match[1] : '';
  }
}

function buildHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    'Accept': 'application/json',
    'Prefer': 'odata.include-annotations="*"',
  };
}

interface SizeCheckResult {
  blocked: boolean;
  warning?: string;
  message?: string;
}

function checkDefinitionSize(json: string): SizeCheckResult {
  const bytes = new Blob([json]).size;
  if (bytes > MAX_DEFINITION_BYTES) {
    return {
      blocked: true,
      message: `Workflow definition is ${(bytes / 1024).toFixed(1)}KB — exceeds the 100KB field limit. Simplify the workflow before saving.`,
    };
  }
  if (bytes > WARN_DEFINITION_BYTES) {
    return {
      blocked: false,
      warning: `Workflow definition is ${(bytes / 1024).toFixed(1)}KB — approaching the 100KB field limit.`,
    };
  }
  return { blocked: false };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
