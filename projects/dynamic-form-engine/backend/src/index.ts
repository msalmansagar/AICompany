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
import { requireInternalSecret } from './middleware/internalSecret.middleware.js';
import { inputSanitiserMiddleware } from './middleware/input.sanitiser.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { LRUCache } from 'lru-cache';
import { CrmAuthService } from './services/CrmAuthService.js';
import { CrmAuditService } from './services/CrmAuditService.js';
import { CrmDataService } from './services/CrmDataService.js';
import { CrmLookupService } from './services/CrmLookupService.js';
import { EndpointRegistry } from './services/EndpointRegistry.js';
import { ApiLookupService } from './services/ApiLookupService.js';
import { CrmSubmissionService } from './services/CrmSubmissionService.js';
import { CrmMetadataService } from './services/CrmMetadataService.js';
import { CrmFileService } from './services/CrmFileService.js';
import { CrmDesignService } from './services/CrmDesignService.js';
import { CrmFormCloneService } from './services/CrmFormCloneService.js';
import { CrmDesignerProxyService } from './services/CrmDesignerProxyService.js';
import { AccessPolicyService } from './services/AccessPolicyService.js';
import { CrmInfoCardService } from './services/CrmInfoCardService.js';
import { CrmInfoCardAdminService } from './services/CrmInfoCardAdminService.js';
import { CrmDocumentService } from './services/CrmDocumentService.js';
import { CrmGridDataService } from './services/CrmGridDataService.js';
import { CrmLanguageConfigService } from './services/CrmLanguageConfigService.js';
import { CrmTranslationQueryService } from './services/CrmTranslationQueryService.js';
import { CrmTranslationWriteService } from './services/CrmTranslationWriteService.js';
import { TranslationResolutionService } from './services/TranslationResolutionService.js';
import { CssSanitiserService } from './utils/cssSanitiser.js';
import { PublishedFormService } from './services/PublishedFormService.js';
import { createRenderCacheStore } from './services/RenderCacheStore.js';
import type { IRenderCacheStore } from './services/RenderCacheStore.js';
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
import { createLanguagesRouter } from './routes/languages.routes.js';
import { createInternalCacheRouter } from './routes/internal-cache.routes.js';
import { createOptionsRouter } from './routes/options.routes.js';
import { createFilesRouter } from './routes/files.routes.js';
import { createThemesRouter, createFormDesignRouter, createDesignCacheRouter } from './routes/design.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createGridsRouter } from './routes/grids.routes.js';
import { createInfoCardsAdminRouter } from './routes/info-cards.admin.routes.js';
import { createDesignerProxyRouter } from './routes/designer-proxy.routes.js';
import { createTranslationsRouter } from './routes/translations.routes.js';
import type { FormDefinition, DesignPayload, ThemeDefinition, LanguageConfig } from '@qdb/shared';

// ── Service wiring ─────────────────────────────────────────────────────────────
// TTL=0 means no caching (every request hits Dataverse — useful for local dev).
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

// DFE-i18n-001: language config cache (60-min TTL by default — list changes rarely)
const languageConfigCache = new LRUCache<string, LanguageConfig[]>({
  max: 10,
  ttl: config.LANGUAGE_CONFIG_CACHE_TTL_MS,
});

const authService = new CrmAuthService();
const policyService = config.MOCK_CRM ? null : new AccessPolicyService(authService, policyCache);
const languageConfigService = config.MOCK_CRM
  ? null
  : new CrmLanguageConfigService(authService, languageConfigCache);
const translationQueryService = config.MOCK_CRM ? null : new CrmTranslationQueryService(authService);
const translationWriteService = config.MOCK_CRM ? null : new CrmTranslationWriteService(authService);
const translationResolutionService = new TranslationResolutionService();
const cssSanitiser = new CssSanitiserService();
const infoCardService = config.MOCK_CRM ? null : new CrmInfoCardService(authService);
const infoCardAdminService = config.MOCK_CRM ? null : new CrmInfoCardAdminService(authService);
const gridDataService = config.MOCK_CRM
  ? null
  : new CrmGridDataService(authService, metadataCache as LRUCache<string, object>);

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

// DFE-APILOOKUP-001: external-API lookup source (staging-only V1).
// Active only when the flag is on AND (not production, or prod explicitly allowed) —
// the PDPPL data-egress hard gate. Inactive => the proxy/registry routes stay inert.
const apiLookupActive =
  config.API_LOOKUP_ENABLED && (config.NODE_ENV !== 'production' || config.API_LOOKUP_ALLOW_PROD);
const apiLookupService = apiLookupActive
  ? new ApiLookupService(new EndpointRegistry(config.API_LOOKUP_ENDPOINT_REGISTRY), {
      cacheTtlMs: config.API_LOOKUP_CACHE_TTL_MS,
      rateLimitPerMin: config.API_LOOKUP_RATE_LIMIT_PER_MIN,
    })
  : null;
if (config.API_LOOKUP_ENABLED && !apiLookupActive) {
  logger.warn('API_LOOKUP_ENABLED is set but blocked by the production data-egress gate (API_LOOKUP_ALLOW_PROD=false)');
}

const submissionService = config.MOCK_CRM
  ? (new MockSubmissionService() as unknown as CrmSubmissionService)
  : new CrmSubmissionService(authService, auditService);

const metadataService = config.MOCK_CRM
  ? (new MockMetadataService() as unknown as CrmMetadataService)
  : new CrmMetadataService(
      authService,
      metadataCache,
      infoCardService,
      translationQueryService,
      translationResolutionService,
      languageConfigService,
    );

const fileService = config.MOCK_CRM
  ? (new MockFileService() as unknown as CrmFileService)
  : new CrmFileService(authService);

const designService = config.MOCK_CRM
  ? (new MockDesignService() as unknown as CrmDesignService)
  : new CrmDesignService(authService, designCache, cssSanitiser);

const documentService = config.MOCK_CRM ? null : new CrmDocumentService(authService);

const cloneService = new CrmFormCloneService(authService);
const designerProxyService = config.MOCK_CRM
  ? null
  : new CrmDesignerProxyService(authService);

// ── DFE-RC-001: Render cache store and service ─────────────────────────────────
// Resolved asynchronously; app start deferred until store is ready.
let renderCacheStore: IRenderCacheStore | null = null;
let publishedFormService: PublishedFormService | null = null;

async function initRenderCacheServices(): Promise<void> {
  if (!config.USE_RENDER_CACHE || config.MOCK_CRM) return;

  renderCacheStore = await createRenderCacheStore(config.RENDER_CACHE_TTL_SECONDS, config.REDIS_URL);
  publishedFormService = new PublishedFormService(authService, renderCacheStore, languageConfigService);

  logger.info(
    { ttlSeconds: config.RENDER_CACHE_TTL_SECONDS, redis: Boolean(config.REDIS_URL) },
    'Render cache enabled',
  );
}

// ── Express app ────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger }));
app.use(correlationMiddleware);
app.use(inputSanitiserMiddleware);

// ── Public routes ──────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
// GET /api/languages — public, no auth required (language toggle must render before auth in some flows)
if (languageConfigService) {
  app.use('/api/languages', createLanguagesRouter(languageConfigService));
}

// ── Authenticated routes + server start ────────────────────────────────────────
// The render-cache services are resolved asynchronously, so the authenticated
// routers (forms, internal-cache) MUST be registered AFTER initRenderCacheServices()
// completes — otherwise they capture null publishedFormService/renderCacheStore and
// the render-cache hot path never engages.
async function bootstrap(): Promise<void> {
  await initRenderCacheServices();

  // When a shared secret is configured, the internal cache endpoint is authorised by the
  // x-internal-cache-secret header (mounted BEFORE the JWT gate so non-browser callers such as
  // the Dataverse command-bar web resource can invalidate without a user token).
  if (config.INTERNAL_CACHE_SECRET && languageConfigService) {
    app.use(
      '/api/internal/cache',
      requireInternalSecret(config.INTERNAL_CACHE_SECRET),
      createInternalCacheRouter(metadataService, languageConfigService, renderCacheStore),
    );
  }

  app.use('/api', authMiddleware);
  app.use('/api/lookups', createLookupsRouter(lookupService, apiLookupService));
  app.use('/api/forms', createFormsRouter(
    metadataService,
    dataService,
    submissionService,
    designService,
    cloneService,
    policyService,
    infoCardService,
    languageConfigService,
    publishedFormService,
    config.USE_RENDER_CACHE,
  ));
  if (gridDataService) {
    app.use('/api/grids', createGridsRouter(gridDataService));
  }
  app.use('/api/options', createOptionsRouter(metadataService));
  app.use('/api/files', createFilesRouter(fileService, documentService));
  app.use('/api/themes', createThemesRouter(designService));
  app.use('/api/form-design', createFormDesignRouter(designService));
  app.use('/api/admin/cache/design', createDesignCacheRouter(designService));
  app.use('/api/admin', createAdminRouter(metadataService, designService, apiLookupService));
  if (infoCardAdminService) {
    app.use('/api/admin', createInfoCardsAdminRouter(infoCardAdminService));
  }
  if (designerProxyService) {
    app.use('/api/designer/records', createDesignerProxyRouter(designerProxyService));
  }
  // PUT|GET|DELETE /api/design/translations — designer translation authoring (auth-gated)
  if (translationWriteService && languageConfigService) {
    app.use('/api/design/translations', createTranslationsRouter(translationWriteService, languageConfigService));
  }
  // POST /api/internal/cache/invalidate — when no shared secret is configured, the endpoint
  // stays behind JWT auth (the shared-secret mount above is skipped in that case).
  if (!config.INTERNAL_CACHE_SECRET && languageConfigService) {
    app.use('/api/internal/cache', createInternalCacheRouter(metadataService, languageConfigService, renderCacheStore));
  }

  // Error handler must be registered last.
  app.use(errorMiddleware);

  app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV, mockCrm: config.MOCK_CRM, renderCache: config.USE_RENDER_CACHE },
      'Dynamic Form Engine API started',
    );
  });
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, 'Failed to initialise render cache — aborting startup');
  process.exit(1);
});

export {
  app, metadataCache, designCache, policyCache, languageConfigCache,
  authService, auditService, dataService, lookupService,
  submissionService, metadataService, fileService, documentService,
  designService, cloneService, designerProxyService, policyService,
  infoCardService, infoCardAdminService, gridDataService,
  languageConfigService, translationQueryService, translationWriteService, translationResolutionService,
  renderCacheStore, publishedFormService,
};
