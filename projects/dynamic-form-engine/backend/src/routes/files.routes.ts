import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import type { ApiResponse } from '@dfe/shared';
import type { CrmFileService } from '../services/CrmFileService.js';
import { config } from '../config/env.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB hard ceiling (BR-011)

export interface UploadedFileReference {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export function createFilesRouter(fileService: CrmFileService | null): Router {
  const router = Router();

  // POST /api/files/upload
  // Accepts multipart/form-data: file, formCode, fieldId, parentRecordId?
  router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file received', correlationId: req.correlationId },
      });
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: `File type '${file.mimetype}' is not allowed`,
          correlationId: req.correlationId,
        },
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds the 25 MB limit',
          correlationId: req.correlationId,
        },
      });
      return;
    }

    const fileId = randomUUID();
    let fileUrl: string;

    if (fileService) {
      const annotationId = await fileService.uploadToCrmNotes({
        file: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
      });
      fileUrl = `/api/files/${annotationId}`;
    } else {
      // Mock mode: return a local reference without actual storage
      fileUrl = `/api/files/${fileId}`;
    }

    const fileRef: UploadedFileReference = {
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      url: fileUrl,
    };

    const response: ApiResponse<UploadedFileReference> = { success: true, data: fileRef };
    res.status(201).json(response);
  });

  // DELETE /api/files/:fileId
  router.delete('/:fileId', async (_req: Request, res: Response) => {
    // In production, this would delete the CRM Notes annotation.
    // Deletion is currently a no-op — files are orphaned until cleanup job runs.
    res.status(204).send();
  });

  return router;
}
