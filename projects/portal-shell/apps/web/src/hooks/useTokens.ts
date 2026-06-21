'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  clientGet,
  clientPost,
  clientPatch,
  clientDelete,
} from '../lib/api-client';

// ---------------------------------------------------------------------------
// Domain types — reflect the API response shapes from Section 9 of arch doc
// ---------------------------------------------------------------------------

export interface TokenDefinitionSummary {
  id: string;
  name: string;
  slug: string;
  tokenType: number;
  description: string | null;
  defaultValue: string | null;
  isActive: boolean;
  createdOn: string;
  modifiedOn: string;
}

export interface TokenValueSummary {
  id: string;
  definitionId: string;
  definitionSlug: string;
  level: number;
  renderTarget: string | null;
  category: number | null;
  componentSlug: string | null;
  serviceSlug: string | null;
  locale: string | null;
  value: string;
  publishedOn: string | null;
  publishedBy: string | null;
  isActive: boolean;
  createdOn: string;
  modifiedOn: string;
}

export interface PaginatedMeta {
  total: number;
  top: number;
  skip: number;
}

export interface TokenDefinitionListResponse {
  data: TokenDefinitionSummary[];
  meta: PaginatedMeta;
}

export interface TokenValueListResponse {
  data: TokenValueSummary[];
  meta: PaginatedMeta;
}

// ---------------------------------------------------------------------------
// Request payload types
// ---------------------------------------------------------------------------

export interface TokenDefinitionListParams {
  activeOnly?: boolean;
  tokenType?: number;
  top?: number;
  skip?: number;
}

export interface TokenValueListParams {
  slug?: string;
  level?: number;
  service?: string;
  activeOnly?: boolean;
  top?: number;
  skip?: number;
}

export interface TokenDefinitionCreatePayload {
  name: string;
  slug: string;
  tokenType: number;
  description?: string;
  defaultValue?: string;
}

export interface TokenDefinitionPatchPayload {
  name?: string;
  description?: string;
  defaultValue?: string;
}

export interface TokenValueCreatePayload {
  definitionSlug: string;
  level: number;
  renderTarget?: 'portal' | 'admin' | 'mobile';
  category?: number;
  componentSlug?: string;
  serviceSlug?: string;
  locale?: 'ar' | 'en';
  value: string;
}

export interface TokenPreviewParams {
  renderTarget?: 'portal' | 'admin' | 'mobile';
  locale?: 'ar' | 'en';
  service?: string;
  category?: string;
  componentSlug?: string;
}

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

const tokenKeys = {
  all: ['tokens'] as const,
  definitions: (params: TokenDefinitionListParams) =>
    ['tokens', 'definitions', params] as const,
  values: (params: TokenValueListParams) =>
    ['tokens', 'values', params] as const,
  preview: (params: TokenPreviewParams) =>
    ['tokens', 'preview', params] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSearchParams(
  raw: Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(raw)) {
    if (val !== undefined) params.set(key, String(val));
  }
  return params;
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useTokenDefinitions(params: TokenDefinitionListParams = {}) {
  return useQuery({
    queryKey: tokenKeys.definitions(params),
    queryFn: () => {
      const searchParams = buildSearchParams({
        activeOnly: params.activeOnly,
        tokenType: params.tokenType,
        top: params.top,
        skip: params.skip,
      });
      return clientGet<TokenDefinitionListResponse>(
        `/api/admin/tokens/definitions?${searchParams.toString()}`,
      );
    },
  });
}

export function useTokenValues(params: TokenValueListParams = {}) {
  return useQuery({
    queryKey: tokenKeys.values(params),
    queryFn: () => {
      const searchParams = buildSearchParams({
        slug: params.slug,
        level: params.level,
        service: params.service,
        activeOnly: params.activeOnly,
        top: params.top,
        skip: params.skip,
      });
      return clientGet<TokenValueListResponse>(
        `/api/admin/tokens/values?${searchParams.toString()}`,
      );
    },
  });
}

export function useTokenPreview(params: TokenPreviewParams = {}) {
  return useQuery({
    queryKey: tokenKeys.preview(params),
    queryFn: () => {
      const searchParams = buildSearchParams({
        renderTarget: params.renderTarget,
        locale: params.locale,
        service: params.service,
        category: params.category,
        componentSlug: params.componentSlug,
      });
      return clientGet<{ data: Record<string, string> }>(
        `/api/admin/tokens/preview?${searchParams.toString()}`,
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateTokenDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TokenDefinitionCreatePayload) =>
      clientPost<{ data: TokenDefinitionSummary }>(
        '/api/admin/tokens/definitions',
        payload,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'definitions'] });
    },
  });
}

export function useUpdateTokenDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slug, patch }: { slug: string; patch: TokenDefinitionPatchPayload }) =>
      clientPatch<void>(`/api/admin/tokens/definitions/${slug}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'definitions'] });
    },
  });
}

export function useDeactivateTokenDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slug: string) =>
      clientDelete(`/api/admin/tokens/definitions/${slug}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'definitions'] });
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'values'] });
    },
  });
}

export function useCreateTokenValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TokenValueCreatePayload) =>
      clientPost<{ data: TokenValueSummary }>('/api/admin/tokens/values', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'values'] });
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'preview'] });
    },
  });
}

export function useDeactivateTokenValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      clientDelete(`/api/admin/tokens/values/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'values'] });
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'preview'] });
    },
  });
}

export function usePublishTokens() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clientPost<void>('/api/admin/tokens/publish', {}),
    onSuccess: () => {
      // Invalidate preview — live state has changed
      void queryClient.invalidateQueries({ queryKey: ['tokens', 'preview'] });
    },
  });
}
