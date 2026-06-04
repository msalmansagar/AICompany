═══════════════════════════════════════════════════════════════════
PHASE 3 — TECHNICAL BUILD
Dynamic Form Engine — Mobile Rendering Extension (QDB)
═══════════════════════════════════════════════════════════════════
Prepared by:    Maqsad AI — Mobile Agent + Backend Agent (parallel)
Date:           2026-05-20
Version:        1.0
Architecture:   projects/dynamic-form-engine/mobile/phase-2-arch.md
Rules:          .claude/rules/common.md
═══════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BACKEND AGENT] — GET /api/forms + Audit Channel Header
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## B-1. CrmFormListService

```typescript
// backend/src/services/CrmFormListService.ts

import { DataverseClient } from '../crm/DataverseClient';
import { ODataQueryBuilder } from '../crm/ODataQueryBuilder';
import { CrmAuditService } from './CrmAuditService';
import { FormListItem } from '@qdb/form-engine-shared';
import { UserClaims } from '../middleware/authMiddleware';
import { Logger } from 'pino';

interface RawFormDefinitionRow {
  qdb_form_definition_id: string;
  qdb_form_code: string;
  qdb_display_name: string;
  qdb_description: string;
  qdb_is_active: boolean;
  qdb_allowed_ad_group_id: string | null;
}

interface RawFieldRow {
  qdb_form_field_id: string;
  qdb_field_type: string;
  qdb_is_required_default: boolean;
  _qdb_form_section_id_value: string;
}

export class CrmFormListService {
  constructor(
    private readonly dataverseClient: DataverseClient,
    private readonly logger: Logger
  ) {}

  async fetchAccessibleForms(
    userClaims: UserClaims,
    userGroupIds: string[]
  ): Promise<FormListItem[]> {
    const activeFormRows = await this.fetchActiveFormDefinitions();
    const accessible = activeFormRows.filter((row) =>
      this.isFormAccessibleToUser(row, userGroupIds)
    );
    const formIds = accessible.map((row) => row.qdb_form_definition_id);
    const gridFieldMap = await this.fetchRequiredGridFieldsByForm(formIds);
    const draftFormCodes = await this.fetchActiveUserDraftFormCodes(
      userClaims.oid
    );
    return this.buildFormListItems(accessible, gridFieldMap, draftFormCodes);
  }

  // CR-02 fix: extracted from fetchAccessibleForms to keep it under 20 lines
  private buildFormListItems(
    rows: RawFormDefinitionRow[],
    gridFieldMap: Map<string, boolean>,
    draftFormCodes: Set<string>
  ): FormListItem[] {
    return rows.map((row) =>
      this.mapToFormListItem(row, gridFieldMap, draftFormCodes)
    );
  }

  private async fetchActiveFormDefinitions(): Promise<RawFormDefinitionRow[]> {
    const query = new ODataQueryBuilder('qdb_form_definitions')
      .select([
        'qdb_form_definition_id',
        'qdb_form_code',
        'qdb_display_name',
        'qdb_description',
        'qdb_is_active',
        'qdb_allowed_ad_group_id',
      ])
      .filter("qdb_is_active eq true")
      .orderBy('qdb_display_name', 'asc')
      .build();

    const response = await this.dataverseClient.get<RawFormDefinitionRow>(query);
    return response.value;
  }

  private isFormAccessibleToUser(
    form: RawFormDefinitionRow,
    userGroupIds: string[]
  ): boolean {
    if (!form.qdb_allowed_ad_group_id) return true;
    return userGroupIds.includes(form.qdb_allowed_ad_group_id);
  }

  private async fetchRequiredGridFieldsByForm(
    formIds: string[]
  ): Promise<Map<string, boolean>> {
    if (formIds.length === 0) return new Map();

    // Query all grid fields that are required, joined back to form
    // via section → tab → form_definition
    const idList = formIds.map((id) => `'${id}'`).join(',');
    const query = new ODataQueryBuilder('qdb_form_fields')
      .select(['qdb_form_field_id', 'qdb_field_type', 'qdb_is_required_default'])
      .expand('qdb_form_section_id($select=qdb_form_tab_id;$expand=qdb_form_tab_id($select=qdb_form_definition_id))')
      .filter(`qdb_field_type eq 'grid' and qdb_is_required_default eq true`)
      .build();

    const response = await this.dataverseClient.get<RawFieldRow>(query);

    const requiresDesktopMap = new Map<string, boolean>();
    for (const row of response.value) {
      const formDefId =
        row['qdb_form_section_id']?.['qdb_form_tab_id']?.[
          'qdb_form_definition_id'
        ];
      if (formDefId && formIds.includes(formDefId)) {
        requiresDesktopMap.set(formDefId, true);
      }
    }
    return requiresDesktopMap;
  }

  private async fetchActiveUserDraftFormCodes(
    userOid: string
  ): Promise<Set<string>> {
    const query = new ODataQueryBuilder('qdb_form_drafts')
      .select(['qdb_form_definition_id'])
      .expand('qdb_form_definition_id($select=qdb_form_code)')
      .filter(
        `qdb_user_aad_object_id eq '${ODataQueryBuilder.escapeString(userOid)}' and qdb_status eq 'active'`
      )
      .build();

    const response = await this.dataverseClient.get<{
      qdb_form_definition_id: { qdb_form_code: string };
    }>(query);

    return new Set(
      response.value.map((row) => row.qdb_form_definition_id.qdb_form_code)
    );
  }

  private mapToFormListItem(
    row: RawFormDefinitionRow,
    gridFieldMap: Map<string, boolean>,
    draftFormCodes: Set<string>
  ): FormListItem {
    return {
      formId: row.qdb_form_definition_id,
      formCode: row.qdb_form_code,
      displayName: row.qdb_display_name,
      description: row.qdb_description ?? '',
      requiresDesktop: gridFieldMap.get(row.qdb_form_definition_id) ?? false,
      hasDraft: draftFormCodes.has(row.qdb_form_code),
      version: 0, // populated by CrmMetadataService on full metadata fetch
    };
  }
}
```

## B-2. FormListController

```typescript
// backend/src/controllers/FormListController.ts

import { Request, Response, NextFunction } from 'express';
import { CrmFormListService } from '../services/CrmFormListService';
import { MetadataLruCache } from '../cache/MetadataLruCache';
import { resolveUserGroupIds } from '../middleware/roleMiddleware';
import { ApiResponse } from '@qdb/form-engine-shared';
import { FormListItem } from '@qdb/form-engine-shared';

const FORM_LIST_CACHE_TTL_SECONDS = 60;

export class FormListController {
  constructor(
    private readonly formListService: CrmFormListService,
    private readonly formListCache: MetadataLruCache<FormListItem[]>
  ) {}

  async listForms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userClaims = req.user!;
      const cacheKey = `formList:${userClaims.oid}`;

      const cached = this.formListCache.get(cacheKey);
      if (cached) {
        res.status(200).json(this.successResponse(cached, req.correlationId));
        return;
      }

      const userGroupIds = await resolveUserGroupIds(userClaims, req.logger);
      const forms = await this.formListService.fetchAccessibleForms(
        userClaims,
        userGroupIds
      );

      this.formListCache.set(cacheKey, forms, FORM_LIST_CACHE_TTL_SECONDS);

      res.status(200).json(this.successResponse(forms, req.correlationId));
    } catch (error) {
      next(error);
    }
  }

  private successResponse(
    data: FormListItem[],
    correlationId: string
  ): ApiResponse<FormListItem[]> {
    return {
      success: true,
      data,
      meta: {
        correlationId,
        timestamp: new Date().toISOString(),
        version: '1',
      },
    };
  }
}
```

## B-3. Route Registration

```typescript
// backend/src/routes/forms.routes.ts (MODIFIED — add list route)

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { FormListController } from '../controllers/FormListController';
import { MetadataController } from '../controllers/MetadataController';

export function buildFormsRouter(
  formListController: FormListController,
  metadataController: MetadataController
): Router {
  const router = Router();

  router.use(authMiddleware);

  // NEW: Mobile form list endpoint
  router.get('/', (req, res, next) =>
    formListController.listForms(req, res, next)
  );

  // EXISTING: Form metadata endpoint
  router.get(
    '/:formCode/metadata',
    validateFormCodeParam,   // guard: /^[a-z0-9\-]{1,100}$/
    (req, res, next) => metadataController.getMetadata(req, res, next)
  );

  // ... existing routes

  return router;
}
```

## B-4. X-Client-Platform Audit Channel Header

```typescript
// backend/src/middleware/requestLogger.ts (MODIFIED)

export function buildRequestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.headers['x-correlation-id'] as string
      ?? randomUUID();
    const clientPlatform =
      (req.headers['x-client-platform'] as string) ?? 'web';

    req.correlationId = correlationId;
    req.clientPlatform = clientPlatform as 'web' | 'mobile';

    logger.info({
      correlationId,
      method: req.method,
      path: req.path,
      clientPlatform,
      // NOTE: Authorization header is intentionally NOT logged
    });

    next();
  };
}
```

```typescript
// backend/src/services/CrmAuditService.ts (MODIFIED — add channel)

async writeAuditEntry(
  eventType: AuditEventType,
  context: AuditContext
): Promise<void> {
  const entry = {
    qdb_event_type: eventType,
    qdb_form_definition_id: context.formDefinitionId,
    qdb_form_definition_name: context.formDefinitionName,
    qdb_user_aad_object_id: context.userOid,
    qdb_user_display_name: context.userDisplayName,
    qdb_event_timestamp: new Date().toISOString(),
    qdb_affected_record_id: context.affectedRecordId ?? null,
    qdb_changed_data_json: context.changedDataJson ?? null,
    qdb_channel: context.clientPlatform ?? 'web',   // NEW FIELD
  };

  await this.dataverseClient.post('qdb_form_audit_logs', entry);
}
```

## B-5. Dataverse Schema Addition

```
Table: qdb_form_audit_log
New column: qdb_channel
  Type: Choice (Option Set)
  Options:
    web    (value: 100000000, label: "Web Portal")
    mobile (value: 100000001, label: "Mobile App")
  Default value: web (100000000)
  Required: false (backward compatible — existing records have null,
            handled as "web" in display views)
```

This is an additive change. Existing audit log records are unaffected.
The Dataverse solution update adds the column and its choice options.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[MOBILE AGENT] — Expo App + Native Field Components
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## M-1. Shared Package — FormListItem Type Addition

```typescript
// shared/src/types/api.ts (MODIFIED — add FormListItem)

export interface FormListItem {
  formId: string;
  formCode: string;
  displayName: string;
  description: string;
  requiresDesktop: boolean;
  hasDraft: boolean;
  version: number;
}
```

## M-2. appConfig.ts — Environment Validation

```typescript
// mobile/src/config/appConfig.ts

import { z } from 'zod';
import Constants from 'expo-constants';

const MobileAppConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  msalClientId: z.string().uuid(),
  backendAppClientId: z.string().uuid(),
  azureAdTenantId: z.string().uuid(),
  webPortalUrl: z.string().url(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type MobileAppConfig = z.infer<typeof MobileAppConfigSchema>;

function loadAppConfig(): MobileAppConfig {
  const extra = Constants.expoConfig?.extra ?? {};
  const result = MobileAppConfigSchema.safeParse({
    apiBaseUrl: extra.apiBaseUrl,
    msalClientId: extra.msalClientId,
    backendAppClientId: extra.backendAppClientId,
    azureAdTenantId: extra.azureAdTenantId,
    webPortalUrl: extra.webPortalUrl,
    logLevel: extra.logLevel,
  });

  if (!result.success) {
    throw new Error(
      `Invalid app configuration: ${result.error.message}`
    );
  }

  return result.data;
}

export const appConfig = loadAppConfig();
```

## M-2b. Mobile Structured Logger

```typescript
// mobile/src/logger.ts
// W-05 fix: structured logger for mobile (no console.log in production)
// Uses react-native-logs pattern; falls back to no-op in production builds.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function buildLogger() {
  function log(level: LogLevel, entry: Omit<LogEntry, 'level'>): void {
    if (__DEV__) {
      // In development only — never in production builds
      const formatted = JSON.stringify({ level, ...entry, timestamp: new Date().toISOString() });
      // eslint-disable-next-line no-console -- development-only structured output
      console.log(formatted);
    }
    // Production: integrate with Sentry/Crashlytics breadcrumbs here (Phase 2)
  }

  return {
    debug: (entry: Omit<LogEntry, 'level'>) => log('debug', entry),
    info:  (entry: Omit<LogEntry, 'level'>) => log('info', entry),
    warn:  (entry: Omit<LogEntry, 'level'>) => log('warn', entry),
    error: (entry: Omit<LogEntry, 'level'>) => log('error', entry),
  };
}

export const logger = buildLogger();
```

## M-3. MSAL Authentication Provider

```typescript
// mobile/src/auth/MsalProvider.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  PublicClientApplication,
  AccountInfo,
  AuthenticationResult,
} from '@azure/msal-react-native';
import * as SecureStore from 'expo-secure-store';
import { appConfig } from '../config/appConfig';

const TOKEN_CACHE_KEY = 'qdb_msal_cache';

const msalConfig = {
  auth: {
    clientId: appConfig.msalClientId,
    authority: `https://login.microsoftonline.com/${appConfig.azureAdTenantId}`,
    redirectUri: 'msauth://com.qdb.formengine/callback',
  },
  cache: {
    cachePlugin: {
      async beforeCacheAccess(cacheContext: { tokenCache: { deserialize: (s: string) => void } }) {
        const serialised = await SecureStore.getItemAsync(TOKEN_CACHE_KEY);
        if (serialised) {
          cacheContext.tokenCache.deserialize(serialised);
        }
      },
      async afterCacheAccess(cacheContext: { cacheHasChanged: boolean; tokenCache: { serialize: () => string } }) {
        if (cacheContext.cacheHasChanged) {
          await SecureStore.setItemAsync(
            TOKEN_CACHE_KEY,
            cacheContext.tokenCache.serialize()
          );
        }
      },
    },
  },
};

interface MsalContextValue {
  account: AccountInfo | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  acquireToken: () => Promise<string>;
  isLoading: boolean;
}

const MsalContext = createContext<MsalContextValue | null>(null);

export function MsalProvider({ children }: { children: React.ReactNode }) {
  const [msalInstance] = useState(
    () => new PublicClientApplication(msalConfig)
  );
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeMsal();
  }, []);

  async function initializeMsal(): Promise<void> {
    await msalInstance.initialize();
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      setAccount(accounts[0]);
    }
    setIsLoading(false);
  }

  async function signIn(): Promise<void> {
    const result: AuthenticationResult = await msalInstance.acquireToken({
      scopes: [`api://${appConfig.backendAppClientId}/access_as_user`],
    });
    setAccount(result.account);
  }

  async function signOut(): Promise<void> {
    if (account) {
      await msalInstance.signOut({ account });
      await SecureStore.deleteItemAsync(TOKEN_CACHE_KEY);
      setAccount(null);
    }
  }

  // CR-07 fix: useCallback ensures acquireToken reference is stable
  // so useFormMetadata's useEffect does not re-fire on every render.
  const acquireToken = useCallback(async (): Promise<string> => {
    if (!account) throw new Error('Not authenticated');
    const result = await msalInstance.acquireTokenSilent({
      scopes: [`api://${appConfig.backendAppClientId}/access_as_user`],
      account,
    });
    return result.accessToken;
  }, [account, msalInstance]);

  return (
    <MsalContext.Provider value={{ account, signIn, signOut, acquireToken, isLoading }}>
      {children}
    </MsalContext.Provider>
  );
}

export function useMsal(): MsalContextValue {
  const context = useContext(MsalContext);
  if (!context) throw new Error('useMsal must be used within MsalProvider');
  return context;
}
```

## M-4. API Client (Bearer Token + Platform Header)

```typescript
// mobile/src/services/apiClient.ts

import { appConfig } from '../config/appConfig';

const CLIENT_PLATFORM_HEADER = 'mobile';

export async function apiGet<T>(
  path: string,
  accessToken: string
): Promise<T> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: buildHeaders(accessToken),
  });
  return handleResponse<T>(response);
}

export async function apiPost<TBody, TResponse>(
  path: string,
  body: TBody,
  accessToken: string
): Promise<TResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body),
  });
  return handleResponse<TResponse>(response);
}

export async function apiDelete(
  path: string,
  accessToken: string
): Promise<void> {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(accessToken),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Client-Platform': CLIENT_PLATFORM_HEADER,
    Accept: 'application/json',
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }
  const json = await response.json();
  return json.data as T;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(`API error ${statusCode}: ${message}`);
  }
}
```

## M-5. useFormMetadata Hook

```typescript
// mobile/src/hooks/useFormMetadata.ts

import { useState, useEffect } from 'react';
import { FormDefinition } from '@qdb/form-engine-shared';
import { apiGet } from '../services/apiClient';
import { useMsal } from '../auth/MsalProvider';

type MetadataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; formDefinition: FormDefinition };

export function useFormMetadata(formCode: string): MetadataState {
  const { acquireToken } = useMsal();
  const [state, setState] = useState<MetadataState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function fetchMetadata(): Promise<void> {
      try {
        const token = await acquireToken();
        const formDefinition = await apiGet<FormDefinition>(
          `/api/forms/${encodeURIComponent(formCode)}/metadata`,
          token
        );
        if (!cancelled) {
          setState({ status: 'success', formDefinition });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load form',
          });
        }
      }
    }

    fetchMetadata();
    return () => { cancelled = true; };
  }, [formCode, acquireToken]);

  return state;
}
```

## M-5b. useSubmission Hook

```typescript
// mobile/src/hooks/useSubmission.ts
// CR-05 fix: submitForm is a command only (no return value).
// lastReferenceNumber is state that callers observe via useEffect.

import { useState, useCallback } from 'react';
import { submissionService } from '../services/submissionService';
import { useMsal } from '../auth/MsalProvider';
import { logger } from '../logger';

interface SubmissionState {
  isSubmitting: boolean;
  submissionError: string | null;
  lastReferenceNumber: string | null;
}

interface UseSubmissionResult extends SubmissionState {
  submitForm: (values: Record<string, unknown>) => Promise<void>;
  resetSubmission: () => void;
}

export function useSubmission(
  formCode: string,
  draftId: string | undefined,
  hiddenFields: Set<string>
): UseSubmissionResult {
  const { acquireToken } = useMsal();
  const [state, setState] = useState<SubmissionState>({
    isSubmitting: false,
    submissionError: null,
    lastReferenceNumber: null,
  });

  const submitForm = useCallback(
    async (values: Record<string, unknown>): Promise<void> => {
      setState({ isSubmitting: true, submissionError: null, lastReferenceNumber: null });
      const cleanedValues = removeHiddenFields(values, hiddenFields);
      try {
        const token = await acquireToken();
        const referenceNumber = await submissionService.submit(
          formCode,
          cleanedValues,
          draftId,
          token
        );
        setState({ isSubmitting: false, submissionError: null, lastReferenceNumber: referenceNumber });
      } catch (error) {
        logger.error({ error, context: { formCode, operation: 'submitForm' } });
        setState({
          isSubmitting: false,
          submissionError: 'Submission failed. Please try again.',
          lastReferenceNumber: null,
        });
      }
    },
    [formCode, draftId, hiddenFields, acquireToken]
  );

  const resetSubmission = useCallback(() => {
    setState({ isSubmitting: false, submissionError: null, lastReferenceNumber: null });
  }, []);

  return { ...state, submitForm, resetSubmission };
}

function removeHiddenFields(
  values: Record<string, unknown>,
  hiddenFields: Set<string>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !hiddenFields.has(key))
  );
}
```

## M-6. MobileDynamicFormRenderer

```typescript
// mobile/src/components/form/MobileDynamicFormRenderer.tsx

import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormDefinition } from '@qdb/form-engine-shared';
import { ValidationEngine } from '@qdb/form-engine-shared';
import { useRuleEngine } from '../../hooks/useRuleEngine';
import { MobileFormTabBar } from './MobileFormTabBar';
import { useSubmission } from '../../hooks/useSubmission';
import { FormErrorBanner } from '../ui/FormErrorBanner';
import { SubmitButton } from '../ui/SubmitButton';
import { SaveDraftButton } from '../ui/SaveDraftButton';

interface MobileDynamicFormRendererProps {
  formDefinition: FormDefinition;
  initialValues?: Record<string, unknown>;
  draftId?: string;
  onSubmitSuccess: (referenceNumber: string) => void;
}

export function MobileDynamicFormRenderer({
  formDefinition,
  initialValues,
  draftId,
  onSubmitSuccess,
}: MobileDynamicFormRendererProps): JSX.Element {
  const validationSchema = ValidationEngine.buildZodSchema(
    formDefinition.tabs.flatMap((t) =>
      t.sections.flatMap((s) => s.fields)
    )
  );

  const { control, handleSubmit, watch, resetField, formState } = useForm({
    resolver: zodResolver(validationSchema),
    defaultValues: initialValues ?? {},
    mode: 'onBlur',
  });

  const ruleResult = useRuleEngine(
    formDefinition.tabs.flatMap((t) =>
      t.sections.flatMap((s) =>
        s.fields.flatMap((f) => f.businessRules)
      )
    ),
    watch
  );

  const { submitForm, isSubmitting, submissionError, lastReferenceNumber } =
    useSubmission(formDefinition.formCode, draftId, ruleResult.hiddenFields);

  // CR-05 fix: CQS — submitForm is a command. We observe lastReferenceNumber
  // as state rather than reading a return value from the command function.
  useEffect(() => {
    if (lastReferenceNumber) {
      onSubmitSuccess(lastReferenceNumber);
    }
  }, [lastReferenceNumber, onSubmitSuccess]);

  // onSubmit is a command: calls submitForm and does nothing else.
  const onSubmit = useCallback(
    (values: Record<string, unknown>): void => {
      void submitForm(values);
    },
    [submitForm]
  );

  return (
    <View style={styles.container}>
      {submissionError && (
        <FormErrorBanner message={submissionError} />
      )}
      <MobileFormTabBar
        formDefinition={formDefinition}
        control={control}
        ruleResult={ruleResult}
        resetField={resetField}
        formState={formState}
      />
      <View style={styles.actionRow}>
        <SaveDraftButton
          formCode={formDefinition.formCode}
          draftId={draftId}
          getValues={() => watch()}
        />
        <SubmitButton
          onPress={handleSubmit(onSubmit)}
          isLoading={isSubmitting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});
```

## M-7. NativeDateField

```typescript
// mobile/src/components/fields/NativeDateField.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  StyleSheet,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { NativeFieldProps } from './NativeFieldProps';

export function NativeDateField({
  definition,
  value,
  onChange,
  onBlur,
  isRequired,
  isReadonly,
}: NativeFieldProps): JSX.Element {
  const [isPickerVisible, setPickerVisible] = useState(false);
  const selectedDate = value ? new Date(value as string) : new Date();

  function handleDateChange(
    event: DateTimePickerEvent,
    date?: Date
  ): void {
    if (Platform.OS === 'android') {
      setPickerVisible(false);
      if (event.type === 'set' && date) {
        onChange(date.toISOString().split('T')[0]);
        onBlur();
      }
    } else if (date) {
      onChange(date.toISOString().split('T')[0]);
    }
  }

  function handleIosConfirm(): void {
    setPickerVisible(false);
    onBlur();
  }

  const displayValue = value
    ? new Date(value as string).toLocaleDateString('en-QA')
    : definition.placeholder || 'Select date';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {definition.displayLabel}
        {isRequired && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.input, isReadonly && styles.readonly]}
        onPress={() => !isReadonly && setPickerVisible(true)}
        accessible
        accessibilityLabel={`${definition.displayLabel}, ${displayValue}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to open date picker"
      >
        <Text style={[styles.valueText, !value && styles.placeholder]}>
          {displayValue}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal
          visible={isPickerVisible}
          transparent
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setPickerVisible(false)}>
                  <Text style={styles.cancelButton}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleIosConfirm}>
                  <Text style={styles.doneButton}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
              />
            </View>
          </View>
        </Modal>
      ) : (
        isPickerVisible && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="calendar"
            onChange={handleDateChange}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  required: { color: '#c00' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  readonly: { backgroundColor: '#f0f0f0', opacity: 0.7 },
  valueText: { fontSize: 16, color: '#222' },
  placeholder: { color: '#aaa' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cancelButton: { fontSize: 16, color: '#666' },
  doneButton: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
});
```

## M-8. NativeDropdownField

```typescript
// mobile/src/components/fields/NativeDropdownField.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  ActionSheetIOS,
  Platform,
  StyleSheet,
} from 'react-native';
import { NativeFieldProps } from './NativeFieldProps';
import { OptionValue } from '@qdb/form-engine-shared';

export function NativeDropdownField({
  definition,
  value,
  onChange,
  onBlur,
  isRequired,
  isReadonly,
}: NativeFieldProps): JSX.Element {
  const [isModalVisible, setModalVisible] = useState(false);
  const activeOptions = definition.optionValues.filter((o) => o.isActive);

  const selectedLabel =
    activeOptions.find((o) => o.value === value)?.label ?? '';
  const displayValue = selectedLabel || definition.placeholder || 'Select...';

  function handleOpenPicker(): void {
    if (isReadonly) return;

    if (Platform.OS === 'ios') {
      const optionLabels = ['Cancel', ...activeOptions.map((o) => o.label)];
      ActionSheetIOS.showActionSheetWithOptions(
        { options: optionLabels, cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex > 0) {
            onChange(activeOptions[buttonIndex - 1].value);
            onBlur();
          }
        }
      );
    } else {
      setModalVisible(true);
    }
  }

  function handleAndroidSelect(option: OptionValue): void {
    onChange(option.value);
    onBlur();
    setModalVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {definition.displayLabel}
        {isRequired && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.trigger, isReadonly && styles.readonly]}
        onPress={handleOpenPicker}
        accessible
        accessibilityLabel={`${definition.displayLabel}, ${displayValue}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to open selector"
      >
        <Text style={[styles.triggerText, !selectedLabel && styles.placeholder]}>
          {displayValue}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      {Platform.OS === 'android' && (
        <Modal
          visible={isModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.androidOverlay}
            onPress={() => setModalVisible(false)}
          >
            <View style={styles.androidSheet}>
              <Text style={styles.sheetTitle}>
                {definition.displayLabel}
              </Text>
              <FlatList
                data={activeOptions}
                keyExtractor={(item) => item.optionId}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.optionRow,
                      item.value === value && styles.optionSelected,
                    ]}
                    onPress={() => handleAndroidSelect(item)}
                    accessible
                    accessibilityRole="menuitem"
                    accessibilityLabel={item.label}
                  >
                    <Text style={styles.optionLabel}>{item.label}</Text>
                    {item.value === value && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  required: { color: '#c00' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  readonly: { backgroundColor: '#f0f0f0', opacity: 0.7 },
  triggerText: { fontSize: 16, color: '#222', flex: 1 },
  placeholder: { color: '#aaa' },
  chevron: { fontSize: 20, color: '#999', marginLeft: 8 },
  androidOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  androidSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingBottom: 20,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  optionSelected: { backgroundColor: '#f0f7ff' },
  optionLabel: { fontSize: 16, color: '#222', flex: 1 },
  checkmark: { fontSize: 18, color: '#007AFF' },
});
```

## M-8b. fileService

```typescript
// mobile/src/services/fileService.ts
// W-03 fix: multipart upload using React Native FormData (uri-based, not Blob)

import { appConfig } from '../config/appConfig';
import { FileUploadResult } from '@qdb/form-engine-shared';
import { ApiError } from './apiClient';
import { logger } from '../logger';

interface FilePayload {
  uri: string;
  fileName: string;
  mimeType: string;
}

export async function uploadFile(
  file: FilePayload,
  fieldKey: string,
  accessToken: string
): Promise<FileUploadResult> {
  const formData = buildFormData(file, fieldKey);
  const response = await fetch(`${appConfig.apiBaseUrl}/api/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Client-Platform': 'mobile',
      // NOTE: Do NOT set Content-Type manually — fetch sets multipart boundary automatically
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }

  const json = await response.json();
  return json.data as FileUploadResult;
}

function buildFormData(file: FilePayload, fieldKey: string): FormData {
  const formData = new FormData();
  // React Native FormData accepts { uri, type, name } objects — not Blob
  formData.append('file', { uri: file.uri, type: file.mimeType, name: file.fileName } as unknown as Blob);
  formData.append('fieldKey', fieldKey);
  return formData;
}
```

## M-8c. useRuleEngine Hook

```typescript
// mobile/src/hooks/useRuleEngine.ts
// W-02 fix: missing implementation from architecture Section 7.2

import { useState, useEffect, useMemo } from 'react';
import { RuleEngine, BusinessRule, RuleEvaluationResult } from '@qdb/form-engine-shared';

const RULE_EVALUATION_DEBOUNCE_MS = 50;

export function useRuleEngine(
  businessRules: BusinessRule[],
  watch: () => Record<string, unknown>
): RuleEvaluationResult {
  const ruleEngine = useMemo(
    () => new RuleEngine(businessRules),
    // businessRules array reference changes only when form metadata changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(businessRules)]
  );

  const [result, setResult] = useState<RuleEvaluationResult>(
    RuleEvaluationResult.empty()
  );

  const formValues = watch();

  useEffect(() => {
    const timer = setTimeout(() => {
      evaluateRules(ruleEngine, formValues, setResult);
    }, RULE_EVALUATION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formValues), ruleEngine]);

  return result;
}

async function evaluateRules(
  ruleEngine: RuleEngine,
  facts: Record<string, unknown>,
  onResult: (result: RuleEvaluationResult) => void
): Promise<void> {
  const evaluated = await ruleEngine.evaluate(facts);
  onResult(evaluated);
}
```

## M-8d. NativeDateTimeField

```typescript
// mobile/src/components/fields/NativeDateTimeField.tsx
// W-01 fix: missing datetime field implementation (architecture Section 9.1)

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  StyleSheet,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { NativeFieldProps } from './NativeFieldProps';

type AndroidPickerStep = 'date' | 'time' | 'idle';

export function NativeDateTimeField({
  definition,
  value,
  onChange,
  onBlur,
  isRequired,
  isReadonly,
}: NativeFieldProps): JSX.Element {
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [androidStep, setAndroidStep] = useState<AndroidPickerStep>('idle');
  const [pendingDate, setPendingDate] = useState<Date>(new Date());
  const selectedDateTime = value ? new Date(value as string) : new Date();

  function handleIosChange(_event: DateTimePickerEvent, date?: Date): void {
    if (date) onChange(date.toISOString());
  }

  function handleAndroidDateChange(_event: DateTimePickerEvent, date?: Date): void {
    if (!date) { setAndroidStep('idle'); return; }
    setPendingDate(date);
    setAndroidStep('time');
  }

  function handleAndroidTimeChange(_event: DateTimePickerEvent, date?: Date): void {
    setAndroidStep('idle');
    if (!date) return;
    const combined = new Date(pendingDate);
    combined.setHours(date.getHours(), date.getMinutes(), 0, 0);
    onChange(combined.toISOString());
    onBlur();
  }

  const displayValue = value
    ? new Date(value as string).toLocaleString('en-QA')
    : definition.placeholder || 'Select date and time';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {definition.displayLabel}
        {isRequired && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.input, isReadonly && styles.readonly]}
        onPress={() => {
          if (isReadonly) return;
          if (Platform.OS === 'ios') setPickerVisible(true);
          else setAndroidStep('date');
        }}
        accessible
        accessibilityLabel={`${definition.displayLabel}, ${displayValue}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to open date and time picker"
      >
        <Text style={[styles.valueText, !value && styles.placeholder]}>
          {displayValue}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' && (
        <Modal visible={isPickerVisible} transparent animationType="slide">
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.header}>
                <TouchableOpacity onPress={() => setPickerVisible(false)}>
                  <Text style={styles.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPickerVisible(false); onBlur(); }}>
                  <Text style={styles.doneBtn}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={selectedDateTime}
                mode="datetime"
                display="inline"
                onChange={handleIosChange}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && androidStep === 'date' && (
        <DateTimePicker
          value={selectedDateTime}
          mode="date"
          display="calendar"
          onChange={handleAndroidDateChange}
        />
      )}
      {Platform.OS === 'android' && androidStep === 'time' && (
        <DateTimePicker
          value={pendingDate}
          mode="time"
          display="clock"
          onChange={handleAndroidTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  required: { color: '#c00' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 12, backgroundColor: '#fafafa',
  },
  readonly: { backgroundColor: '#f0f0f0', opacity: 0.7 },
  valueText: { fontSize: 16, color: '#222' },
  placeholder: { color: '#aaa' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 34 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  cancelBtn: { fontSize: 16, color: '#666' },
  doneBtn: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
});
```

## M-9. NativeFileUploadField

```typescript
// mobile/src/components/fields/NativeFileUploadField.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { NativeFieldProps } from './NativeFieldProps';
import { uploadFile } from '../../services/fileService';
import { useMsal } from '../../auth/MsalProvider';
import { logger } from '../../logger';

interface UploadedFile {
  uploadId: string;
  fileName: string;
  fileSizeBytes: number;
}

// CR-06 fix: type guard instead of type assertion
function isUploadedFile(v: unknown): v is UploadedFile {
  return (
    typeof v === 'object' &&
    v !== null &&
    'uploadId' in v &&
    'fileName' in v &&
    'fileSizeBytes' in v
  );
}

export function NativeFileUploadField({
  definition,
  value,
  onChange,
  onBlur,
  isRequired,
  isReadonly,
}: NativeFieldProps): JSX.Element {
  const { acquireToken } = useMsal();
  const [isUploading, setUploading] = useState(false);
  const uploadedFile = isUploadedFile(value) ? value : null;
  const uploadConfig = definition.documentUploadConfig!;
  const maxBytes = uploadConfig.maxFileSizeMb * 1024 * 1024;

  function buildActionSheetOptions(): string[] {
    const options: string[] = ['Cancel'];
    const mimes = uploadConfig.allowedMimeTypes;
    if (mimes.some((m) => m.startsWith('image/'))) {
      options.push('Take Photo', 'Choose from Gallery');
    }
    options.push('Choose File');
    return options;
  }

  // CR-08 fix: validateFileSize is a single-responsibility guard
  function validateFileSize(fileSize: number): boolean {
    if (fileSize > maxBytes) {
      Alert.alert('File too large', `Maximum file size is ${uploadConfig.maxFileSizeMb}MB.`);
      return false;
    }
    return true;
  }

  // CR-08 fix: performUpload is a single-responsibility command (token + service call)
  async function performUpload(
    uri: string,
    fileName: string,
    mimeType: string
  ): Promise<UploadedFile> {
    const token = await acquireToken();
    return uploadFile({ uri, fileName, mimeType }, definition.fieldKey, token);
  }

  // CR-08 fix: orchestrator — validate, upload, update state
  // CR-01 fix: catch (error) with structured logging
  async function handleFileSelected(
    uri: string,
    fileName: string,
    mimeType: string,
    fileSize: number
  ): Promise<void> {
    if (!validateFileSize(fileSize)) return;
    setUploading(true);
    try {
      const result = await performUpload(uri, fileName, mimeType);
      onChange(result);
      onBlur();
    } catch (error) {
      logger.error({ error, context: { fieldKey: definition.fieldKey, operation: 'handleFileSelected' } });
      Alert.alert('Upload failed', 'Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  async function launchCamera(): Promise<void> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission required', 'Please enable camera access in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await handleFileSelected(asset.uri, asset.fileName ?? 'photo.jpg', asset.mimeType ?? 'image/jpeg', asset.fileSize ?? 0);
    }
  }

  async function launchGallery(): Promise<void> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library permission required', 'Please enable photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await handleFileSelected(asset.uri, asset.fileName ?? 'image.jpg', asset.mimeType ?? 'image/jpeg', asset.fileSize ?? 0);
    }
  }

  async function launchDocumentPicker(): Promise<void> {
    const result = await DocumentPicker.getDocumentAsync({ type: uploadConfig.allowedMimeTypes, copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await handleFileSelected(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream', asset.size ?? 0);
    }
  }

  // CR-03 fix: extracted into two platform-specific functions
  function openIosActionSheet(options: string[]): void {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 0 },
      async (index) => {
        if (index === 0) return;
        const label = options[index];
        if (label === 'Take Photo') await launchCamera();
        else if (label === 'Choose from Gallery') await launchGallery();
        else if (label === 'Choose File') await launchDocumentPicker();
      }
    );
  }

  function openAndroidUploadMenu(): void {
    // TODO(MAI-MOBILE-001): replace Alert with bottom-sheet on Android in Phase 2
    Alert.alert('Upload document', undefined, [
      { text: 'Take Photo', onPress: () => void launchCamera() },
      { text: 'Choose from Gallery', onPress: () => void launchGallery() },
      { text: 'Choose File', onPress: () => void launchDocumentPicker() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // CR-03 fix: openActionSheet is now a clean two-branch platform switch
  function openActionSheet(): void {
    if (isReadonly || isUploading) return;
    const options = buildActionSheetOptions();
    if (Platform.OS === 'ios') openIosActionSheet(options);
    else openAndroidUploadMenu();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {definition.displayLabel}
        {isRequired && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.uploadButton, isReadonly && styles.readonly]}
        onPress={openActionSheet}
        disabled={isUploading}
        accessible
        accessibilityLabel={
          uploadedFile
            ? `${definition.displayLabel}: ${uploadedFile.fileName}. Double tap to replace.`
            : `${definition.displayLabel}: No file selected. Double tap to upload.`
        }
        accessibilityRole="button"
      >
        {isUploading ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <Text style={styles.uploadButtonText}>
            {uploadedFile ? `Replace: ${uploadedFile.fileName}` : 'Upload document'}
          </Text>
        )}
      </TouchableOpacity>
      {uploadedFile && (
        <Text style={styles.fileName} numberOfLines={1}>
          {uploadedFile.fileName}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  required: { color: '#c00' },
  uploadButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#f5f9ff',
  },
  readonly: { opacity: 0.5 },
  uploadButtonText: { fontSize: 15, color: '#007AFF', fontWeight: '500' },
  fileName: { fontSize: 13, color: '#555', marginTop: 6 },
});
```

## M-10. ValidationMessage with Haptics

```typescript
// mobile/src/components/ui/ValidationMessage.tsx

import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

interface ValidationMessageProps {
  message: string;
}

export function ValidationMessage({ message }: ValidationMessageProps): JSX.Element | null {
  const previousMessage = useRef<string>('');

  useEffect(() => {
    if (message && message !== previousMessage.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    previousMessage.current = message;
  }, [message]);

  if (!message) return null;

  return (
    <Text
      style={styles.errorText}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  errorText: {
    fontSize: 12,
    color: '#c00',
    marginTop: 4,
    marginLeft: 2,
  },
});
```

## M-11. GridUnavailableField

```typescript
// mobile/src/components/fields/GridUnavailableField.tsx

import React from 'react';
import { View, Text, TouchableOpacity, Linking, Alert, StyleSheet } from 'react-native';
import { NativeFieldProps } from './NativeFieldProps';
import { appConfig } from '../../config/appConfig';

export function GridUnavailableField({
  definition,
}: NativeFieldProps): JSX.Element {
  const webUrl = `${appConfig.webPortalUrl}/form/${definition.fieldKey}`;

  // CR-10 fix: surface feedback when browser cannot be opened
  async function openWebPortal(): Promise<void> {
    const canOpen = await Linking.canOpenURL(webUrl);
    if (canOpen) {
      await Linking.openURL(webUrl);
    } else {
      Alert.alert(
        'Cannot open browser',
        `Please open this link manually:\n${webUrl}`
      );
    }
  }

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${definition.displayLabel}: This section must be completed on the web portal`}
    >
      <Text style={styles.title}>{definition.displayLabel}</Text>
      <Text style={styles.notice}>
        This section requires the QDB web portal to complete.
        Save your draft and open the form in your browser to fill in this section.
      </Text>
      <TouchableOpacity
        style={styles.linkButton}
        onPress={openWebPortal}
        accessibilityRole="link"
        accessibilityLabel="Open in browser"
      >
        <Text style={styles.linkText}>Open in browser</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#f0a500',
    borderRadius: 8,
    backgroundColor: '#fffbf0',
    padding: 16,
    marginBottom: 16,
  },
  title: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  notice: { fontSize: 13, color: '#555', lineHeight: 20, marginBottom: 10 },
  linkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f0a500',
    borderRadius: 6,
  },
  linkText: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
```

## M-12. Form List Screen

```typescript
// mobile/app/(app)/forms/index.tsx

import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFormList } from '../../../src/hooks/useFormList';
import { FormListItem } from '@qdb/form-engine-shared';
import { LoadingScreen } from '../../../src/components/ui/LoadingScreen';
import { ErrorScreen } from '../../../src/components/ui/ErrorScreen';

export default function FormsScreen(): JSX.Element {
  const router = useRouter();
  const { forms, isLoading, error, refresh, isRefreshing } = useFormList();

  if (isLoading) return <LoadingScreen message="Loading your forms..." />;
  if (error) return <ErrorScreen message={error} onRetry={refresh} />;

  function handleFormPress(item: FormListItem): void {
    router.push(`/forms/${item.formCode}`);
  }

  function renderFormItem({ item }: { item: FormListItem }): JSX.Element {
    return (
      <TouchableOpacity
        style={styles.formCard}
        onPress={() => handleFormPress(item)}
        accessible
        accessibilityLabel={buildAccessibilityLabel(item)}
        accessibilityRole="button"
        accessibilityHint="Double tap to open this form"
      >
        <View style={styles.cardHeader}>
          <Text style={styles.formName} numberOfLines={2}>
            {item.displayName}
          </Text>
          <View style={styles.badges}>
            {item.hasDraft && (
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>In progress</Text>
              </View>
            )}
            {item.requiresDesktop && (
              <View style={styles.desktopBadge}>
                <Text style={styles.desktopBadgeText}>Desktop required</Text>
              </View>
            )}
          </View>
        </View>
        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  function buildAccessibilityLabel(item: FormListItem): string {
    const parts = [item.displayName];
    if (item.hasDraft) parts.push('Draft in progress');
    if (item.requiresDesktop) parts.push('Requires desktop to complete');
    return parts.join('. ');
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={forms}
        keyExtractor={(item) => item.formId}
        renderItem={renderFormItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No forms available.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  list: { padding: 16, gap: 12 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  formName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    flex: 1,
    marginRight: 8,
  },
  badges: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  draftBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  draftBadgeText: { fontSize: 11, color: '#2e7d32', fontWeight: '600' },
  desktopBadge: {
    backgroundColor: '#fff3e0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  desktopBadgeText: { fontSize: 11, color: '#e65100', fontWeight: '600' },
  description: { fontSize: 13, color: '#666', lineHeight: 18 },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 15,
    marginTop: 40,
  },
});
```

## M-13. package.json

```json
{
  "name": "qdb-forms-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "test": "jest --watchAll=false",
    "test:e2e": "detox test --configuration ios.sim.debug",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@azure/msal-react-native": "^0.0.1",
    "@hookform/resolvers": "^3.3.4",
    "@qdb/form-engine-shared": "workspace:*",
    "@react-native-community/datetimepicker": "^7.6.2",
    "@react-navigation/bottom-tabs": "^6.5.11",
    "@react-navigation/native": "^6.1.9",
    "expo": "~51.0.0",
    "expo-document-picker": "~11.10.1",
    "expo-haptics": "~12.8.1",
    "expo-image-picker": "~15.0.7",
    "expo-router": "~3.5.23",
    "expo-secure-store": "~13.0.2",
    "react": "18.2.0",
    "react-hook-form": "^7.51.0",
    "react-native": "0.74.5",
    "react-native-safe-area-context": "4.10.5",
    "react-native-screens": "3.31.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@testing-library/react-native": "^12.4.0",
    "@types/react": "~18.2.45",
    "detox": "^20.18.0",
    "jest": "^29.7.0",
    "jest-expo": "~51.0.3",
    "typescript": "^5.3.3"
  }
}
```

═══════════════════════════════════════════════════════════════════
END OF TECHNICAL BUILD
Dynamic Form Engine — Mobile Rendering Extension
═══════════════════════════════════════════════════════════════════
