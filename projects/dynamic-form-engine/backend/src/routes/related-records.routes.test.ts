import 'express-async-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRelatedRecordsRouter } from './related-records.routes.js';
import { PerUserRateLimiter } from '../utils/PerUserRateLimiter.js';
import { NotFoundError } from '../utils/errors.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import { correlationMiddleware } from '../utils/correlation.js';
import { logger } from '../utils/logger.js';

const RECORD_ID = '09f1b2a3-436a-f111-a826-7ced8d96ec97';
const PATH = `/api/related-records/demo/rb2_sponsor/${RECORD_ID}`;

const mockReadRuleAttributes = vi.fn();

function buildApp(limitPerMinute = 10) {
  const app = express();
  app.use(correlationMiddleware);
  app.use((req, _res, next) => {
    req.user = { oid: 'user-001', aud: 'api', iss: 'sts', exp: 9999999999 };
    next();
  });
  app.use('/api/related-records', createRelatedRecordsRouter(
    { readRuleAttributes: mockReadRuleAttributes } as never,
    new PerUserRateLimiter(limitPerMinute, 'slow down'),
  ));
  app.use(errorMiddleware);
  return app;
}

describe('GET /api/related-records/:formCode/:fieldSchemaName/:recordId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('relatedRecords_Allowed_Returns200WithTheValuesEnvelope', async () => {
    mockReadRuleAttributes.mockResolvedValue({ industrycode: 6 });

    const response = await request(buildApp()).get(PATH);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { industrycode: 6 } });
    expect(mockReadRuleAttributes).toHaveBeenCalledWith({ formCode: 'demo', fieldSchemaName: 'rb2_sponsor', recordId: RECORD_ID });
  });

  it('relatedRecords_Allowed_LogsWhoReadWhichColumnsButNotTheValues', async () => {
    mockReadRuleAttributes.mockResolvedValue({ address1_country: 'United Arab Emirates' });
    const info = vi.spyOn(logger, 'info');

    await request(buildApp()).get(PATH);

    const [entry] = info.mock.calls.find(([, message]) => message === 'related_record_read')!;
    expect(entry).toMatchObject({ userOid: 'user-001', formCode: 'demo', recordId: RECORD_ID, columns: ['address1_country'] });
    expect(JSON.stringify(entry)).not.toContain('United Arab Emirates');
  });

  it('relatedRecords_OutOfScopeRecord_Returns404', async () => {
    mockReadRuleAttributes.mockRejectedValue(new NotFoundError('Related record'));

    const response = await request(buildApp()).get(PATH);

    expect(response.status).toBe(404);
  });

  it('relatedRecords_OverTheLimit_Returns429BeforeReadingCrm', async () => {
    mockReadRuleAttributes.mockResolvedValue({});
    const app = buildApp(1);
    await request(app).get(PATH);

    const response = await request(app).get(PATH);

    expect(response.status).toBe(429);
    expect(mockReadRuleAttributes).toHaveBeenCalledTimes(1);
  });
});
