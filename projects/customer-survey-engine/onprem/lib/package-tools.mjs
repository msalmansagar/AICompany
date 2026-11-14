/**
 * Shared steps of the on-prem package builders: extract a solution zip, apply named transforms,
 * repack it the way CRM's own exports are packed, and hash files. Offline; touches no organisation.
 *
 * @module survey-onprem/package-tools
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TAR = 'C:/Windows/System32/tar.exe';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sha256OfFile = (file) => sha256(readFileSync(file));

export function extract(zip, workDir) {
  execFileSync(TAR, ['-xf', zip, '-C', workDir]);
}

/**
 * Applies [name, why, transform] entries to one file in order. Answers what each changed and the
 * extra details a transform reports (removed step ids, dropped shells).
 */
export function applyTransforms(file, transforms) {
  let text = readFileSync(file, 'utf8');
  const applied = [];
  const details = {};
  for (const [name, why, transform] of transforms) {
    const { text: next, removed, added, ...extra } = transform(text);
    text = next;
    Object.assign(details, extra);
    applied.push({ name, why, removed, ...(added === undefined ? {} : { added }), ...(extra.dropped ? { dropped: extra.dropped } : {}) });
    console.log(`  ${String(removed + (added ?? 0)).padStart(4)} × ${name}`);
  }
  writeFileSync(file, text);
  return { applied, details };
}

/** Files only, forward slashes: CRM's own exports carry no directory entries. */
function packageFiles(workDir, entries) {
  const files = [];
  const walk = (relative) => {
    if (!statSync(join(workDir, relative)).isDirectory()) { files.push(relative.replace(/\\/g, '/')); return; }
    readdirSync(join(workDir, relative)).forEach((child) => walk(`${relative}/${child}`));
  };
  entries.filter((entry) => existsSync(join(workDir, entry))).forEach(walk);
  return files;
}

/** Repacks the named top-level entries into zip; answers the zip's entry list. */
export function repack(workDir, zip, entries) {
  rmSync(zip, { force: true });
  execFileSync(TAR, ['-a', '-cf', zip, '-C', workDir, '--no-recursion', ...packageFiles(workDir, entries)]);
  const listed = execFileSync(TAR, ['-tf', zip], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  if (listed.some((entry) => entry.includes('\\'))) throw new Error(`${zip} has backslash entry names`);
  return listed;
}
