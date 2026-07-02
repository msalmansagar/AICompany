import 'express-async-errors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDesignerProxyRouter } from './designer-proxy.routes.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import { correlationMiddleware } from '../utils/correlation.js';

// ── Mocks ──────────────────────────────────────────────────────

const mockExecuteAction = vi.fn();
const mockProxyService = {
  executeAction: mockExecuteAction,
} as never;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(correlationMiddleware);
  app.use('/api/designer/records', createDesignerProxyRouter(mockProxyService));
  app.use(errorMiddleware);
  return app;
}

const app = buildApp();

// ── Tests ──────────────────────────────────────────────────────

describe('POST /api/designer/records/_actions/:actionName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards_the_action_and_returns_result', async () => {
    mockExecuteAction.mockResolvedValueOnce({ PublishedVersion: 2 });

    const response = await request(app)
      .post('/api/designer/records/_actions/qdb_PublishForm')
      .send({ FormCode: 'demo', TargetVersion: 0 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { PublishedVersion: 2 } });
    expect(mockExecuteAction).toHaveBeenCalledWith('qdb_PublishForm', {
      FormCode: 'demo',
      TargetVersion: 0,
    });
  });

  it('rejects_an_invalid_action_name_without_calling_the_service', async () => {
    const response = await request(app)
      .post('/api/designer/records/_actions/bad-name!')
      .send({});

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });
});
