// Stub for src/auth/tokenService.ts — no auth token is needed inside CRM (Xrm.WebApi uses
// the host session), so this keeps MSAL out of the web-resource bundle.
export async function acquireBearerToken(): Promise<string> {
  return '';
}
