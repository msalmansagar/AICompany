// Shared loader for the browser-side suites.
//
// It exists because hand-maintained dependency lists are how this suite rotted: the harnesses named
// the helpers they needed, the engine grew new ones, and the tests went quiet instead of loud. Three
// separate helpers (designFontLookup, plural, and the whole engine file moving) broke them that way.
//
// So nothing is named here that can be discovered. The engine is loaded, the shipped code is run,
// and whatever it turns out to need is lifted from the engine until it stops asking. A name the
// engine does not define is a genuine failure and is re-thrown, not stubbed — a stub would answer
// for code the browser never runs, which is the failure this whole condition exists to prevent.
//
// Deliberately not named test-*.mjs, so run-all.mjs does not try to run it as a suite.
import { readFileSync } from 'node:fs';

/** Lifts a top-level declaration, whether `function x(){}` or `const x = …`. */
export function liftDeclaration(source, name) {
  const declared = source.search(new RegExp('^function ' + name + '\\s*\\(', 'm'));
  if (declared >= 0) {
    let depth = 0;
    for (let j = source.indexOf('{', source.indexOf('(', declared)); j < source.length; j++) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}' && --depth === 0) return source.slice(declared, j + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
  }

  const bound = source.search(new RegExp('^(const|let) ' + name + '\\s*=', 'm'));
  if (bound < 0) throw new Error(`${name} is not defined in the engine — renamed, or genuinely missing`);
  let depth = 0;
  for (let j = bound; j < source.length; j++) {
    const c = source[j];
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return source.slice(bound, j + 1);
  }
  throw new Error(`could not find the end of ${name}`);
}

/**
 * Builds an API from the engine, resolving its dependencies by running it.
 *
 * @param options.enginePath  the shipped engine to read
 * @param options.section     [startMarker, endMarker] to include wholesale, or null
 * @param options.exports     names the suite wants back
 * @param options.seed        declarations to lift up front
 * @param options.globals     ambient values the engine reads, as an object
 * @param options.smoke       called with the built api; should exercise it enough to surface
 *                            missing references. Throwing a ReferenceError drives the next lift.
 */
export function loadEngine(options) {
  const source = readFileSync(options.enginePath, 'utf8');
  const section = options.section
    ? source.slice(source.indexOf(options.section[0]), source.indexOf(options.section[1]))
    : '';
  const globals = options.globals || {};
  const names = [...(options.seed || [])];

  for (let attempt = 0; attempt < 30; attempt++) {
    const api = new Function(...Object.keys(globals), `
      ${names.map(n => liftDeclaration(source, n)).join('\n')}
      ${section}
      return { ${options.exports.join(', ')} };
    `)(...Object.values(globals));

    try {
      if (options.smoke) options.smoke(api);
      return { api, source, lifted: names };
    } catch (error) {
      const missing = /(\w+) is not defined/.exec(error.message);
      // Not a missing reference, or one we already lifted and still cannot satisfy: real failure.
      if (!missing || names.includes(missing[1])) throw error;
      names.push(missing[1]);
    }
  }
  throw new Error('dependency chain did not settle after 30 lifts');
}
