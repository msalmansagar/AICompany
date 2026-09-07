/**
 * Who may be offered as the owner of a human task.
 *
 * Excluding only disabled users is not enough. On org5869857f that leaves 699 accounts,
 * of which 200 are non-interactive service accounts — they cannot sign in, so they can
 * never open a task, and they made up 29% of the picker.
 *
 * `accessmode` is the discriminator that matters here; `isintegrationuser` excluded
 * nothing on that org, so it is not worth the extra clause.
 */

/** Access modes belonging to a person who can actually sign in and work a task. */
const INTERACTIVE_ACCESS_MODES = [
  0, // Read-Write — an ordinary licensed user
  1, // Administrative
] as const;

/** Which columns a name search looks in. The two adapters differ, so it is a parameter. */
export type UserSearchField = 'fullname' | 'domainname';

/**
 * The OData filter restricting a user lookup to people who can own a task.
 *
 * @param search optional search text, already escaped by the caller
 * @param searchFields which columns the search should look in
 * @returns the filter expression, without a leading `$filter=`
 */
export function buildUserLookupFilter(
  search?: string,
  searchFields: readonly UserSearchField[] = ['fullname']
): string {
  const modes = INTERACTIVE_ACCESS_MODES.map((mode) => `accessmode eq ${mode}`).join(' or ');
  const clauses = ['isdisabled eq false', `(${modes})`];
  if (search && searchFields.length > 0) {
    const matches = searchFields.map((field) => `contains(${field},'${search}')`).join(' or ');
    clauses.push(`(${matches})`);
  }
  return clauses.join(' and ');
}
