// All API path constants — all calls go through src/lib/api.ts which prepends EXPO_PUBLIC_API_URL

export const ApiRoutes = {
  // Auth
  authLogin: '/api/auth/login',
  authRegister: '/api/auth/register',
  authLogout: '/api/auth/logout',
  authRefresh: '/api/auth/refresh',
  authForgotPassword: '/api/auth/forgot-password',
  authResetPassword: '/api/auth/reset-password',
  authMe: '/api/auth/me',

  // Navigation
  nav: '/api/nav',

  // Services
  services: '/api/services',
  serviceByCode: (code: string) => `/api/services/${code}` as const,

  // Requests
  requests: '/api/requests',
  requestById: (id: string) => `/api/requests/${id}` as const,

  // Notifications
  notifications: '/api/notifications',
  notificationMarkRead: (id: string) => `/api/notifications/${id}/read` as const,
  notificationsMarkAllRead: '/api/notifications/read-all',

  // CMS
  cms: (type: string) => `/api/cms?type=${type}` as const,

  // Push token registration
  pushToken: '/api/users/push-token',
} as const;
