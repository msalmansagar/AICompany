import type { CrmAuthService } from './CrmAuthService.js';
import { CrmBaseService } from './CrmBaseService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface RawDocumentTemplate {
  documenttemplateid: string;
  name: string;
  content: string; // base64-encoded file body
  documenttype: number; // 1 = Word, 2 = Excel
}

interface ODataCollection<T> {
  value: T[];
}

interface DownloadAttributeConfig {
  attributeName: string;
  attributeValue: string;
  type: string;
}

interface DownloadSetting {
  attributeConfig: DownloadAttributeConfig[];
}

interface DownloadDocumentSetting {
  downloadSetting: DownloadSetting;
}

export interface DocumentDownloadResult {
  content: Buffer;
  mimeType: string;
  fileName: string;
}

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class CrmDocumentService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async generateFromSetting(downloadDocumentSettingJson: string): Promise<DocumentDownloadResult> {
    const setting = this.parseDownloadSetting(downloadDocumentSettingJson);
    const documentName = this.extractDocumentName(setting);
    return this.fetchDocumentTemplate(documentName);
  }

  private parseDownloadSetting(json: string): DownloadDocumentSetting {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new ValidationError('downloadDocumentSetting contains invalid JSON');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('downloadSetting' in parsed) ||
      typeof (parsed as Record<string, unknown>).downloadSetting !== 'object'
    ) {
      throw new ValidationError(
        'downloadDocumentSetting must have shape { downloadSetting: { attributeConfig: [...] } }',
      );
    }

    return parsed as DownloadDocumentSetting;
  }

  private extractDocumentName(setting: DownloadDocumentSetting): string {
    const configs = setting.downloadSetting?.attributeConfig ?? [];
    const entry = configs.find((c) => c.attributeName === 'documentName');

    if (!entry?.attributeValue) {
      throw new ValidationError(
        'downloadDocumentSetting must include an entry with attributeName "documentName"',
      );
    }

    return entry.attributeValue;
  }

  private async fetchDocumentTemplate(documentName: string): Promise<DocumentDownloadResult> {
    // Escape single quotes to prevent OData injection
    const escapedName = documentName.replace(/'/g, "''");

    const response = await this.crmFetch<ODataCollection<RawDocumentTemplate>>(
      `/documenttemplates?$filter=name eq '${escapedName}'` +
      `&$select=documenttemplateid,name,content,documenttype&$top=1`,
    );

    const template = response.value[0];
    if (!template) {
      throw new NotFoundError(`Document template '${documentName}'`);
    }

    logger.info(
      { templateId: template.documenttemplateid, documentName, documentType: template.documenttype },
      'CRM document template fetched for download',
    );

    const content = Buffer.from(template.content, 'base64');
    const isWord = template.documenttype === 1;
    const mimeType = isWord ? WORD_MIME : EXCEL_MIME;
    const extension = isWord ? 'docx' : 'xlsx';
    const safeBaseName = template.name.replace(/[^a-zA-Z0-9_\- ]/g, '');
    const fileName = `${safeBaseName}.${extension}`;

    return { content, mimeType, fileName };
  }
}
