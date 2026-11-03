// Turns an Arabic TTF into the script web resource the PDF exporter loads on demand.
//
// The font ships as base64 inside a .js file rather than as a raw .ttf because Dataverse web
// resource types cover script, style and a handful of image formats — there is no generic binary
// type — and jsPDF's addFileToVFS wants base64 anyway, so nothing is lost in the round trip.
//
// Reproducible: prints the SHA-256 of the source TTF so the committed artefact can be checked
// against the upstream release without trusting this script's output.
//
// Usage: node build-arabic-font.mjs <source.ttf>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../prototype/vendor/amiri-arabic-font.js');
const POSTSCRIPT_NAME = 'Amiri-Regular.ttf';
const FONT_FAMILY = 'Amiri';

const source = process.argv[2];
if (!source) throw new Error('Usage: node build-arabic-font.mjs <source.ttf>');

const ttf = readFileSync(source);
if (ttf.toString('hex', 0, 4) !== '00010000') {
  throw new Error(`${source} is not a TrueType font — a download that returned an error page looks exactly like this.`);
}

const sha256 = createHash('sha256').update(ttf).digest('hex');
const base64 = ttf.toString('base64');

const contents = `/* ${FONT_FAMILY} Regular, SIL Open Font License 1.1 — see Amiri-OFL.txt beside this file.
   Source: https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf
   SHA-256 of the .ttf this was built from: ${sha256}
   Regenerate with: node scripts/build-arabic-font.mjs <Amiri-Regular.ttf>

   Chosen over Noto Naskh Arabic and Scheherazade New because it is the only one of the three that
   carries BOTH Latin and the Arabic presentation forms. jsPDF substitutes presentation forms itself
   (processArabic) rather than shaping through GSUB, so a font without U+FE70-FEFF renders Arabic as
   nothing, and a font without Latin blanks every English word in a bilingual report. Both failures
   are silent. DO NOT swap this font without re-checking those two ranges. */
window.QdbReportEngineArabicFont = {
  postScriptName: ${JSON.stringify(POSTSCRIPT_NAME)},
  family: ${JSON.stringify(FONT_FAMILY)},
  base64: "${base64}"
};
`;

writeFileSync(OUTPUT, contents);
console.log(`ttf     : ${source}`);
console.log(`sha256  : ${sha256}`);
console.log(`ttf size: ${(ttf.length / 1024).toFixed(0)} KB`);
console.log(`written : ${OUTPUT} (${(contents.length / 1024).toFixed(0)} KB)`);
