import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_VERSION_ATTRS } from '@/constants/attributeNames';
import { withRetry } from './crmRetry';
import type { DesignerState } from '@/state/designerStore';

export interface FormVersion {
  id: string;
  formId: string;
  versionNumber: string;
  versionLabel: string;
  publishedOn: Date | null;
  publishedBy: string | null;
}

export class VersionService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  async createVersion(
    formId: string,
    versionNumber: string,
    versionLabel: string,
    snapshot: Partial<DesignerState>,
    publishedBy: string | null = null
  ): Promise<string> {
    const versionInt = parseInt(versionNumber, 10) || 1;
    const result = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_VERSION, {
          [`${FORM_VERSION_ATTRS.FORM_ID}@odata.bind`]: `/qdb_form_definitions(${formId})`,
          [FORM_VERSION_ATTRS.VERSION_NUMBER]: versionInt,
          [FORM_VERSION_ATTRS.VERSION_LABEL]: versionLabel,
          [FORM_VERSION_ATTRS.SNAPSHOT_JSON]: JSON.stringify(snapshot),
          [FORM_VERSION_ATTRS.PUBLISHED_ON]: publishedBy ? new Date().toISOString() : null,
          [FORM_VERSION_ATTRS.PUBLISHED_BY]: publishedBy ?? '',
        }),
      'createVersion'
    );
    return result.id;
  }

  async listVersions(formId: string): Promise<FormVersion[]> {
    const select = [
      FORM_VERSION_ATTRS.ID,
      FORM_VERSION_ATTRS.FORM_ID_VALUE,
      FORM_VERSION_ATTRS.VERSION_NUMBER,
      FORM_VERSION_ATTRS.VERSION_LABEL,
      FORM_VERSION_ATTRS.PUBLISHED_ON,
      FORM_VERSION_ATTRS.PUBLISHED_BY,
    ].join(',');

    const result = await withRetry(
      () =>
        this.webApi.retrieveMultipleRecords(
          ENTITY_NAMES.FORM_VERSION,
          `?$select=${select}&$filter=${FORM_VERSION_ATTRS.FORM_ID_VALUE} eq ${formId}&$orderby=${FORM_VERSION_ATTRS.PUBLISHED_ON} desc`
        ),
      'listVersions'
    );

    return result.entities.map(record => ({
      id: String(record[FORM_VERSION_ATTRS.ID] ?? ''),
      formId: String(record[FORM_VERSION_ATTRS.FORM_ID_VALUE] ?? ''),
      versionNumber: String(record[FORM_VERSION_ATTRS.VERSION_NUMBER] ?? ''),
      versionLabel: String(record[FORM_VERSION_ATTRS.VERSION_LABEL] ?? ''),
      publishedOn: record[FORM_VERSION_ATTRS.PUBLISHED_ON]
        ? new Date(String(record[FORM_VERSION_ATTRS.PUBLISHED_ON]))
        : null,
      publishedBy: record[FORM_VERSION_ATTRS.PUBLISHED_BY]
        ? String(record[FORM_VERSION_ATTRS.PUBLISHED_BY])
        : null,
    }));
  }

  async getVersionSnapshot(versionId: string): Promise<Partial<DesignerState>> {
    const record = await withRetry(
      () =>
        this.webApi.retrieveRecord(
          ENTITY_NAMES.FORM_VERSION,
          versionId,
          `?$select=${FORM_VERSION_ATTRS.SNAPSHOT_JSON}`
        ),
      'getVersionSnapshot'
    );

    const snapshotJson = record[FORM_VERSION_ATTRS.SNAPSHOT_JSON];
    if (!snapshotJson) throw new Error(`Version ${versionId} has no snapshot data`);

    return JSON.parse(String(snapshotJson)) as Partial<DesignerState>;
  }

  incrementMinorVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    const major = parseInt(parts[0] ?? '1', 10);
    const minor = parseInt(parts[1] ?? '0', 10);
    return `${major}.${minor + 1}`;
  }

  incrementMajorVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    const major = parseInt(parts[0] ?? '1', 10);
    return `${major + 1}.0`;
  }
}
