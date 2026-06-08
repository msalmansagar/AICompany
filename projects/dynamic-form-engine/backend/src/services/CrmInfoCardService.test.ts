import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmInfoCardService } from './CrmInfoCardService.js';
import { CrmApiError } from '../utils/errors.js';

// ── Mocks ──────────────────────────────────────────────────────

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockAuthService = { getAccessToken: mockGetAccessToken } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: () => null },
  });
}

function notFoundResponse() {
  return Promise.resolve({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: () => Promise.resolve('{"error":{"code":"0x80040217"}}'),
    headers: { get: () => null },
  });
}

function duplicateKeyResponse() {
  return Promise.resolve({
    ok: false,
    status: 412,
    statusText: 'Precondition Failed',
    text: () => Promise.resolve('{"error":{"code":"0x80060892","message":"Duplicate alternate key"}}'),
    headers: { get: () => null },
  });
}

// ── Tests ──────────────────────────────────────────────────────

describe('CrmInfoCardService', () => {
  let service: CrmInfoCardService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmInfoCardService(mockAuthService);
  });

  describe('fetchInfoCardScreens', () => {
    it('fetchInfoCardScreens_whenNoScreensExist_returnsEmptyArray', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(okJson({ value: [] }));

      // Act
      const result = await service.fetchInfoCardScreens('form-001', 'corr-001');

      // Assert
      expect(result).toEqual([]);
    });

    it('fetchInfoCardScreens_withScreensAndSections_returnsNestedStructure', async () => {
      // Arrange
      mockFetch
        .mockReturnValueOnce(okJson({
          value: [
            {
              qdb_info_card_screenid: 'screen-001',
              qdb_display_order: 1,
              qdb_heading: 'Welcome',
              qdb_sub_heading: 'Read before proceeding',
              qdb_icon_url: null,
              qdb_icon_alt_text: null,
            },
          ],
        }))
        .mockReturnValueOnce(okJson({
          value: [
            {
              qdb_info_card_sectionid: 'section-001',
              _qdb_info_card_screen_id_value: 'screen-001',
              qdb_display_order: 1,
              qdb_section_type: 100000001,
              qdb_note_text: null,
            },
          ],
        }))
        .mockReturnValueOnce(okJson({ value: [] }));

      // Act
      const result = await service.fetchInfoCardScreens('form-001', 'corr-001');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].screenId).toBe('screen-001');
      expect(result[0].heading).toBe('Welcome');
      expect(result[0].sections).toHaveLength(1);
      expect(result[0].sections[0].sectionType).toBe('numbered-steps');
      expect(result[0].sections[0].items).toHaveLength(0);
    });
  });

  describe('hasUserViewedInfoCard', () => {
    it('hasUserViewedInfoCard_whenRecordExists_returnsTrue', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(okJson({
        value: [{ qdb_info_card_view_recordid: 'vr-001' }],
      }));

      // Act
      const result = await service.hasUserViewedInfoCard('user-001', 'form-001', 'corr-001');

      // Assert
      expect(result).toBe(true);
    });

    it('hasUserViewedInfoCard_whenNoRecord_returnsFalse', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(okJson({ value: [] }));

      // Act
      const result = await service.hasUserViewedInfoCard('user-001', 'form-001', 'corr-001');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('recordInfoCardView', () => {
    it('recordInfoCardView_onSuccess_writesRecord', async () => {
      // Arrange
      mockFetch.mockReturnValueOnce(Promise.resolve({
        ok: true,
        status: 204,
        json: () => Promise.resolve(null),
        text: () => Promise.resolve(''),
        headers: { get: () => null },
      }));

      // Act — should not throw
      await expect(
        service.recordInfoCardView('user-001', 'form-001', 'corr-001'),
      ).resolves.toBeUndefined();
    });

    it('recordInfoCardView_onDuplicateAlternateKey_treatsAsSuccessPerBC006', async () => {
      // Arrange — 412 with 0x80060892 error code = duplicate alternate key
      mockFetch.mockReturnValueOnce(duplicateKeyResponse());

      // Act — CEO condition BC-006: must not throw on duplicate key
      await expect(
        service.recordInfoCardView('user-001', 'form-001', 'corr-001'),
      ).resolves.toBeUndefined();
    });

    it('recordInfoCardView_onDataverseError_logsAndContinues', async () => {
      // Arrange — generic Dataverse failure (not duplicate key)
      mockFetch.mockReturnValueOnce(notFoundResponse());

      // Act — fire-and-forget: must not throw on non-duplicate errors either
      await expect(
        service.recordInfoCardView('user-001', 'form-001', 'corr-001'),
      ).resolves.toBeUndefined();
    });
  });
});
