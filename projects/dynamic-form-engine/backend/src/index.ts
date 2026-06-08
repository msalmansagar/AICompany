import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { correlationMiddleware } from './utils/correlation.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { inputSanitiserMiddleware } from './middleware/input.sanitiser.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { LRUCache } from 'lru-cache';
import { CrmAuthService } from './services/CrmAuthService.js';
import { CrmAuditService } from './services/CrmAuditService.js';
import { CrmDataService } from './services/CrmDataService.js';
import { CrmLookupService } from './services/CrmLookupService.js';
import { CrmSubmissionService } from './services/CrmSubmissionService.js';
import { CrmMetadataService } from './services/CrmMetadataService.js';
import { CrmFileService } from './services/CrmFileService.js';
import { CrmDesignService } from './services/CrmDesignService.js';
import { CrmFormCloneService } from './services/CrmFormCloneService.js';
import { CrmDesignerProxyService } from './services/CrmDesignerProxyService.js';
import { AccessPolicyService } from './services/AccessPolicyService.js';
import { CrmInfoCardService } from './services/CrmInfoCardService.js';
import { CrmInfoCardAdminService } from './services/CrmInfoCardAdminService.js';
import { CrmGridDataService } from './services/CrmGridDataService.js';
import { CssSanitiserService } from './utils/cssSanitiser.js';
import {
  MockMetadataService,
  MockDataService,
  MockLookupService,
  MockSubmissionService,
  MockAuditService,
  MockFileService,
  MockDesignService,
} from './services/MockCrmService.js';
import { createLookupsRouter } from './routes/lookups.routes.js';
import { createFormsRouter } from './routes/forms.routes.js';
import { createOptionsRouter } from './routes/options.routes.js';
import { createFilesRouter } from './routes/files.routes.js';
import { createThemesRouter, createFormDesignRouter, createDesignCacheRouter } from './routes/design.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createGridsRouter } from './routes/grids.routes.js';
import { createInfoCardsAdminRouter } from './routes/info-cards.admin.routes.js';
import { createDesignerProxyRouter } from './routes/designer-proxy.routes.js';
import type { FormDefinition, DesignPayload, ThemeDefinition } from '@qdb/shared';

// â”€â”€ Service wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TTL=0 means no caching (every request hits Dataverse â€” useful for local dev).
const metadataCache = new LRUCache<string, FormDefinition>(
  config.METADATA_CACHE_TTL_SECONDS > 0
    ? { max: 500, ttl: config.METADATA_CACHE_TTL_SECONDS * 1000 }
    : { max: 1,   ttl: 1 },
);

// Separate LRU cache for design payloads and the themes list.
// The union type mirrors DesignCacheValue inside CrmDesignService.
const designCache = new LRUCache<string, DesignPayload | ThemeDefinition[]>(
  config.DESIGN_CACHE_TTL_SECONDS > 0
    ? { max: 500, ttl: config.DESIGN_CACHE_TTL_SECONDS * 1000 }
    : { max: 1,   ttl: 1 },
);

const policyCache = new LRUCache<string, string[]>(
  config.METADATA_CACHE_TTL_SECONDS > 0
    ? { max: 1000, ttl: config.METADATA_CACHE_TTL_SECONDS * 1000 }
    : { max: 1,    ttl: 1 },
);

const authService = new CrmAuthService();
const policyService = config.MOCK_CRM ? null : new AccessPolicyService(authService, policyCache);
const cssSanitiser = new CssSanitiserService();
const infoCardService = config.MOCK_CRM ? null : new CrmInfoCardService(authService);
const infoCardAdminService = config.MOCK_CRM ? null : new CrmInfoCardAdminService(authService);
const gridDataService = config.MOCK_CRM
  ? null
  : new CrmGridDataService(authService, metadataCache as LRUCache<string, unknown>);

// When MOCK_CRM=true, swap all CRM services for in-memory mocks.
// This allows full local development without a Dataverse environment.
const auditService = config.MOCK_CRM
  ? (new MockAuditService() as unknown as CrmAuditService)
  : new CrmAuditService(authService);

const dataService = config.MOCK_CRM
  ? (new MockDataService() as unknown as CrmDataService)
  : new CrmDataService(authService);

const lookupService = config.MOCK_CRM
  ? (new MockLookupService() as unknown as CrmLookupService)
  : new CrmLookupService(authService);

const submissionService = config.MOCK_CRM
  ? (new MockSubmissionService() as unknown as CrmSubmissionService)
  : new CrmSubmissionService(authService, auditService);

const metadataService = config.MOCK_CRM
  ? (new MockMetadataService() as unknown as CrmMetadataService)
  : new CrmMetadataService(authService, metadataCache, infoCardService);

const fileService = config.MOCK_CRM
  ? (new MockFileService() as unknown as CrmFileService)
  : new CrmFileService(authService);

const designService = config.MOCK_CRM
  ? (new MockDesignService() as unknown as CrmDesignService)
  : new CrmDesignService(authService, designCache, cssSanitiser);

const cloneService = new CrmFormCloneService(authService);
const designerProxyService = config.MOCK_CRM
  ? null
  : new CrmDesignerProxyService(authService);

// â”€â”€ Express app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger }));
app.use(correlationMiddleware);
app.use(inputSanitiserMiddleware);

// â”€â”€ Public routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api/health', healthRouter);

// â”€â”€ Authenticated routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api', authMiddleware);
app.use('/api/lookups', createLookupsRouter(lookupService));
app.use('/api/forms', createFormsRouter(metadataService, dataService, submissionService, designService, cloneService, policyService, infoCardService));
if (gridDataService) {
  app.use('/api/grids', createGridsRouter(gridDataService));
}
app.use('/api/options', createOptionsRouter(metadataService));
app.use('/api/files', createFilesRouter(fileService));
app.use('/api/themes', createThemesRouter(designService));
app.use('/api/form-design', createFormDesignRouter(designService));
app.use('/api/admin/cache/design', createDesignCacheRouter(designService));
app.use('/api/admin', createAdminRouter(metadataService, designService));
if (infoCardAdminService) {
  app.use('/api/admin', createInfoCardsAdminRouter(infoCardAdminService));
}
if (designerProxyService) {
  app.use('/api/designer/records', createDesignerProxyRouter(designerProxyService));
}

// â”€â”€ Error handler (must be last) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(errorMiddleware);

// â”€â”€ Start server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, mockCrm: config.MOCK_CRM },
    'Dynamic Form Engine API started',
  );
});

export {
  app, metadataCache, designCache, policyCache,
  authService, auditService, dataService, lookupService,
  submissionService, metadataService, fileService,
  designService, cloneService, designerProxyService, policyService,
  infoCardService, infoCardAdminService, gridDataService,
};
