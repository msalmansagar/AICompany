import { ForbiddenError } from '../utils/errors.js';
import type { FormDefinition } from '@qdb/shared';
import type { JwtPayload } from '../utils/correlation.js';
import { config } from '../config/env.js';

// Throws ForbiddenError if the form requires an access group and the
// authenticated user is not a member of that group.
// JWT groups claim is populated when "groupMembershipClaims": "All" is set
// in the Azure AD app registration manifest.
export function assertFormAccess(form: FormDefinition, user: JwtPayload): void {
  if (!form.accessGroupId) return;

  // Dev bypass: SKIP_AUTH disables auth entirely, so group checks are also skipped.
  if (config.SKIP_AUTH && config.NODE_ENV !== 'production') return;

  const userGroups = (user['groups'] as string[] | undefined) ?? [];
  if (!userGroups.includes(form.accessGroupId)) {
    throw new ForbiddenError(`You do not have permission to access form '${form.formCode}'`);
  }
}
