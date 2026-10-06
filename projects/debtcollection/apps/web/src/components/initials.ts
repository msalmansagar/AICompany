/**
 * Up to two initials for an avatar: the first letter of the first two words that start with a
 * letter (Arabic included), else the first two characters, else "?". The one rule for every avatar
 * in both workspaces — the shells, Customer 360 and the V2 lists (WP6 consolidated four copies).
 */
export function initialsOf(name: string): string {
  const letters = name.trim().split(/\s+/).filter(part => /^\p{L}/u.test(part)).map(part => part[0]);
  return (letters.slice(0, 2).join('') || name.trim().slice(0, 2)).toUpperCase() || '?';
}
