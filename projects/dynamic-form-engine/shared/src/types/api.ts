export interface ApiResponse<T> {
  data: T;
  meta?: ResponseMeta;
}

export interface ResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface FormListItem {
  formId: string;
  formCode: string;
  displayName: string;
  description: string;
  requiresDesktop: boolean;
  hasDraft: boolean;
  version: number;
}
