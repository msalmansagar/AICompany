// Stub for src/auth/msalConfig.ts — MSAL is not used inside CRM (the host provides the
// session). Present only so any stray import resolves without bundling MSAL.
export const msalInstance = {
  loginPopup: async () => undefined,
  getAllAccounts: () => [],
};
export const loginRequest = { scopes: [] as string[] };
