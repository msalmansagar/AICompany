'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientGet, clientPost, clientPatch, clientDelete } from '../lib/api-client';
import type {
  ComponentDefinitionDetail,
  ComponentDefinitionListResponse,
  ComponentVersionDetail,
  ComponentVersionListResponse,
} from '@portal/types';

// ---------------------------------------------------------------------------
// Query key factories — ensure consistent cache invalidation
// ---------------------------------------------------------------------------

export interface ComponentListParams {
  category?: number;
  top: number;
  skip: number;
}

export interface ComponentVersionListParams {
  top: number;
  skip: number;
}

const componentKeys = {
  all: ['components'] as const,
  list: (params: ComponentListParams) =>
    ['components', 'list', params] as const,
  detail: (id: string) => ['components', 'detail', id] as const,
  versions: (definitionId: string, params: ComponentVersionListParams) =>
    ['components', 'versions', definitionId, params] as const,
  version: (definitionId: string, versionId: string) =>
    ['components', 'versions', definitionId, versionId] as const,
};

// ---------------------------------------------------------------------------
// Definition queries
// ---------------------------------------------------------------------------

export function useComponentDefinitions(params: ComponentListParams) {
  return useQuery({
    queryKey: componentKeys.list(params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (params.category !== undefined) {
        searchParams.set('category', String(params.category));
      }
      searchParams.set('top', String(params.top));
      searchParams.set('skip', String(params.skip));
      return clientGet<ComponentDefinitionListResponse>(
        `/api/admin/components?${searchParams.toString()}`
      );
    },
  });
}

export function useComponentDefinition(id: string) {
  return useQuery({
    queryKey: componentKeys.detail(id),
    queryFn: () =>
      clientGet<ComponentDefinitionDetail>(`/api/admin/components/${id}`),
    enabled: id.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Version queries
// ---------------------------------------------------------------------------

export function useComponentVersions(
  definitionId: string,
  params: ComponentVersionListParams
) {
  return useQuery({
    queryKey: componentKeys.versions(definitionId, params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set('top', String(params.top));
      searchParams.set('skip', String(params.skip));
      return clientGet<ComponentVersionListResponse>(
        `/api/admin/components/${definitionId}/versions?${searchParams.toString()}`
      );
    },
    enabled: definitionId.length > 0,
  });
}

export function useComponentVersion(definitionId: string, versionId: string) {
  return useQuery({
    queryKey: componentKeys.version(definitionId, versionId),
    queryFn: () =>
      clientGet<ComponentVersionDetail>(
        `/api/admin/components/${definitionId}/versions/${versionId}`
      ),
    enabled: definitionId.length > 0 && versionId.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Definition mutation payloads
// ---------------------------------------------------------------------------

export interface CreateDefinitionPayload {
  name: string;
  displayName: string;
  displayNameAr: string | null;
  category: number;
  renderTargets: string[];
  descriptionEn: string | null;
  descriptionAr: string | null;
}

export interface PatchDefinitionPayload {
  id: string;
  body: Partial<Omit<CreateDefinitionPayload, 'name'>>;
}

// ---------------------------------------------------------------------------
// Definition mutations
// ---------------------------------------------------------------------------

export function useCreateDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateDefinitionPayload) =>
      clientPost<ComponentDefinitionDetail>('/api/admin/components', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: componentKeys.all });
    },
  });
}

export function usePatchDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: PatchDefinitionPayload) =>
      clientPatch<ComponentDefinitionDetail>(`/api/admin/components/${id}`, body),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: componentKeys.all });
      void queryClient.invalidateQueries({ queryKey: componentKeys.detail(id) });
    },
  });
}

export function useDeactivateDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      clientDelete(`/api/admin/components/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: componentKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Version mutation payloads
// ---------------------------------------------------------------------------

export interface CreateVersionPayload {
  definitionId: string;
  body: {
    versionNumber: string;
    changeLog: string | null;
    propsSchema: string | null;
  };
}

export interface PatchVersionPayload {
  definitionId: string;
  versionId: string;
  body: {
    changeLog?: string | null;
    propsSchema?: string | null;
  };
}

export interface SetLatestVersionPayload {
  definitionId: string;
  versionId: string;
}

// ---------------------------------------------------------------------------
// Version mutations
// ---------------------------------------------------------------------------

export function useCreateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ definitionId, body }: CreateVersionPayload) =>
      clientPost<ComponentVersionDetail>(
        `/api/admin/components/${definitionId}/versions`,
        body
      ),
    onSuccess: (_data, { definitionId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['components', 'versions', definitionId],
      });
    },
  });
}

export function usePatchVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ definitionId, versionId, body }: PatchVersionPayload) =>
      clientPatch<ComponentVersionDetail>(
        `/api/admin/components/${definitionId}/versions/${versionId}`,
        body
      ),
    onSuccess: (_data, { definitionId, versionId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['components', 'versions', definitionId],
      });
      void queryClient.invalidateQueries({
        queryKey: componentKeys.version(definitionId, versionId),
      });
    },
  });
}

export function useDeactivateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ definitionId, versionId }: SetLatestVersionPayload) =>
      clientDelete(
        `/api/admin/components/${definitionId}/versions/${versionId}`
      ),
    onSuccess: (_data, { definitionId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['components', 'versions', definitionId],
      });
    },
  });
}

export function useSetLatestVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ definitionId, versionId }: SetLatestVersionPayload) =>
      clientPost<ComponentVersionDetail>(
        `/api/admin/components/${definitionId}/versions/${versionId}/set-latest`,
        {}
      ),
    onSuccess: (_data, { definitionId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['components', 'versions', definitionId],
      });
      void queryClient.invalidateQueries({
        queryKey: componentKeys.detail(definitionId),
      });
    },
  });
}
