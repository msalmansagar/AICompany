'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientGet, clientPost, clientPatch, clientDelete } from '../lib/api-client';
import type { CmsContent, CmsSummary, CmsRevision } from '@portal/types';

// ---------------------------------------------------------------------------
// Query key factories — ensure consistent cache invalidation
// ---------------------------------------------------------------------------

const cmsKeys = {
  all: ['cms'] as const,
  public: (params: { type?: string; tag?: string; page: number }) =>
    ['cms', 'public', params] as const,
  detail: (slug: string) => ['cms', 'detail', slug] as const,
  adminList: (params: { type?: string; status?: string; page: number }) =>
    ['cms', 'admin', 'list', params] as const,
  adminById: (id: string) => ['cms', 'admin', id] as const,
  revisions: (contentId: string) => ['cms', 'admin', 'revisions', contentId] as const,
};

// ---------------------------------------------------------------------------
// Public hooks — used in portal (news, announcements, pages)
// ---------------------------------------------------------------------------

export interface CmsPublicListResponse {
  items: CmsSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export function useCmsContent(type?: string, tag?: string, page = 1) {
  const params = { type, tag, page };

  return useQuery({
    queryKey: cmsKeys.public(params),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (type) searchParams.set('type', type);
      if (tag) searchParams.set('tag', tag);
      searchParams.set('page', String(page));
      return clientGet<CmsPublicListResponse>(`/api/cms?${searchParams.toString()}`);
    },
  });
}

export function useCmsDetail(slug: string) {
  return useQuery({
    queryKey: cmsKeys.detail(slug),
    queryFn: () => clientGet<CmsContent>(`/api/cms/${slug}`),
    enabled: slug.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Admin hooks — used in admin CMS screens
// ---------------------------------------------------------------------------

export interface CmsAdminListParams {
  type?: string;
  status?: string;
  page?: number;
}

export function useAdminCmsContent(params: CmsAdminListParams = {}) {
  const normalised = { type: params.type, status: params.status, page: params.page ?? 1 };

  return useQuery({
    queryKey: cmsKeys.adminList(normalised),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (normalised.type) searchParams.set('type', normalised.type);
      if (normalised.status) searchParams.set('status', normalised.status);
      searchParams.set('page', String(normalised.page));
      return clientGet<CmsPublicListResponse>(`/api/admin/cms?${searchParams.toString()}`);
    },
  });
}

export function useAdminCmsById(id: string) {
  return useQuery({
    queryKey: cmsKeys.adminById(id),
    queryFn: () => clientGet<CmsContent>(`/api/admin/cms/${id}`),
    enabled: id.length > 0,
  });
}

export interface CmsCreatePayload {
  slug: string;
  title: string;
  titleAr: string;
  contentType: string;
  bodyHtml: string;
  bodyHtmlAr: string;
  excerpt: string;
  excerptAr: string;
  coverImageUrl: string | null;
  authorName: string;
  tags: string[];
  metaDescription: string;
}

export function useCreateCmsContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CmsCreatePayload) =>
      clientPost<CmsContent>('/api/admin/cms', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cms', 'admin', 'list'] });
    },
  });
}

export interface CmsUpdatePayload extends Partial<CmsCreatePayload> {}

export function useUpdateCmsContent(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CmsUpdatePayload) =>
      clientPatch<CmsContent>(`/api/admin/cms/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cms', 'admin', 'list'] });
      void queryClient.invalidateQueries({ queryKey: cmsKeys.adminById(id) });
    },
  });
}

export function usePublishCmsContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      clientPost<CmsContent>(`/api/admin/cms/${id}/publish`, {}),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['cms', 'admin', 'list'] });
      void queryClient.invalidateQueries({ queryKey: cmsKeys.adminById(id) });
    },
  });
}

export function useUnpublishCmsContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      clientPost<CmsContent>(`/api/admin/cms/${id}/unpublish`, {}),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['cms', 'admin', 'list'] });
      void queryClient.invalidateQueries({ queryKey: cmsKeys.adminById(id) });
    },
  });
}

export function useDeleteCmsContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clientDelete(`/api/admin/cms/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cms', 'admin', 'list'] });
    },
  });
}

export function useCmsRevisions(contentId: string) {
  return useQuery({
    queryKey: cmsKeys.revisions(contentId),
    queryFn: () => clientGet<{ items: CmsRevision[] }>(`/api/admin/cms/${contentId}/revisions`),
    enabled: contentId.length > 0,
  });
}
