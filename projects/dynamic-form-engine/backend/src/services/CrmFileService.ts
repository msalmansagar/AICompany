import type { CrmAuthService } from './CrmAuthService.js';
import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';

export class CrmFileService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  async uploadToCrmNotes(params: {
    file: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<string> {
    const { file, fileName, mimeType } = params;

    // Annotations are created without a parent binding during upload staging.
    // Notes must be enabled on an entity before it can be used as objectid target;
    // a floating annotation avoids that schema requirement while still storing the file.
    const annotation = {
      subject: fileName,
      filename: fileName,
      mimetype: mimeType,
      documentbody: file.toString('base64'),
    };

    const response = await this.crmFetch<{ annotationid: string }>('/annotations', {
      method: 'POST',
      body: JSON.stringify(annotation),
      headers: { Prefer: 'return=representation', $select: 'annotationid' },
    });

    logger.info({ annotationId: response.annotationid, fileName }, 'File uploaded to CRM Notes');

    return response.annotationid;
  }

  async uploadToSharePoint(params: {
    file: Buffer;
    fileName: string;
    libraryUrl: string;
    folderPath: string;
    accessToken: string;
  }): Promise<string> {
    const { file, fileName, libraryUrl, folderPath, accessToken } = params;

    const uploadUrl = `${libraryUrl}/_api/web/GetFolderByServerRelativeUrl('${folderPath}')/Files/add(url='${encodeURIComponent(fileName)}',overwrite=true)`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json;odata=verbose',
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`SharePoint upload failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as { d: { ServerRelativeUrl: string } };
    const fileUrl = `${new URL(libraryUrl).origin}${result.d.ServerRelativeUrl}`;

    logger.info({ fileUrl, fileName }, 'File uploaded to SharePoint');
    return fileUrl;
  }
}
