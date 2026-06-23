import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmInfoCardAdminService } from './CrmInfoCardAdminService.js';
import { ValidationError } from '../utils/errors.js';

// ── Mocks ──────────────────────────────────────────────────────

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockAuthService = { getAccessToken: mockGetAccessToken } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function okCreated(id: string) {
  return Promise.resolve({
    ok: true,
    status: 201,
    json: () => Promise.resolve({ qdb_info_card_itemid: id }),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

function okNoContent() {
  return Promise.resolve({
    ok: true,
    status: 204,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

// ── Tests ──────────────────────────────────────────────────────

describe('CrmInfoCardAdminService', () => {
  let service: CrmInfoCardAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmInfoCardAdminService(mockAuthService);
  });

  describe('createInfoCardItem', () => {
    it('createInfoCardItem_withValidHttpsUrl_createsItemSuccessfully', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(okCreated('item-abc'));

      // Act
      const id = await service.createInfoCardItem(
        {
          infoCardSectionId: 'section-001',
          displayOrder: 1,
          itemTitle: 'Download form',
          downloadUrl: 'https://cdn.example.com/form.pdf',
        },
        'admin-001',
        'corr-001',
      );

      // Assert
      expect(id).toBe('item-abc');
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('createInfoCardItem_withoutDownloadUrl_createsItemSuccessfully', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(okCreated('item-xyz'));

      // Act
      const id = await service.createInfoCardItem(
        { infoCardSectionId: 'section-001', displayOrder: 1, itemTitle: 'No link' },
        'admin-001',
        'corr-001',
      );

      // Assert
      expect(id).toBe('item-xyz');
    });

    it('createInfoCardItem_withHttpUrl_throwsValidationError', async () => {
      // Act & Assert — CEO condition ADD-001-C3
      await expect(
        service.createInfoCardItem(
          {
            infoCardSectionId: 'section-001',
            displayOrder: 1,
            itemTitle: 'Insecure',
            downloadUrl: 'http://insecure.example.com/file.pdf',
          },
          'admin-001',
          'corr-001',
        ),
      ).rejects.toThrow(ValidationError);

      // Dataverse must NOT be called — validation runs before network
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('createInfoCardItem_withRelativePath_throwsValidationError', async () => {
      // Act & Assert
      await expect(
        service.createInfoCardItem(
          {
            infoCardSectionId: 'section-001',
            displayOrder: 1,
            itemTitle: 'Relative',
            downloadUrl: '/relative/path/file.pdf',
          },
          'admin-001',
          'corr-001',
        ),
      ).rejects.toThrow('absolute URL');
    });

    it('createInfoCardItem_withMalformedUrl_throwsValidationError', async () => {
      // Act & Assert
      await expect(
        service.createInfoCardItem(
          {
            infoCardSectionId: 'section-001',
            displayOrder: 1,
            itemTitle: 'Malformed',
            downloadUrl: 'not a url!! @@@',
          },
          'admin-001',
          'corr-001',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('createInfoCardItem_withFtpUrl_throwsValidationError', async () => {
      // Act & Assert — non-HTTPS schemes are rejected
      await expect(
        service.createInfoCardItem(
          {
            infoCardSectionId: 'section-001',
            displayOrder: 1,
            itemTitle: 'FTP link',
            downloadUrl: 'ftp://files.example.com/doc.pdf',
          },
          'admin-001',
          'corr-001',
        ),
      ).rejects.toThrow('HTTPS protocol');
    });
  });

  describe('updateInfoCardItem', () => {
    it('updateInfoCardItem_withValidHttpsUrl_updatesSuccessfully', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(okNoContent());

      // Act — should not throw
      await expect(
        service.updateInfoCardItem(
          'item-001',
          { downloadUrl: 'https://cdn.example.com/updated.pdf' },
          'admin-001',
          'corr-001',
        ),
      ).resolves.toBeUndefined();
    });

    it('updateInfoCardItem_withHttpUrl_throwsValidationError', async () => {
      // Act & Assert
      await expect(
        service.updateInfoCardItem(
          'item-001',
          { downloadUrl: 'http://insecure.example.com/file.pdf' },
          'admin-001',
          'corr-001',
        ),
      ).rejects.toThrow(ValidationError);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
