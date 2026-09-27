import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPORT_DEFINITIONS, definitionByCode } from '@dcp/domain';
import { SCOPE_PARAMETERS } from '../reporting/ReportingService.js';

/**
 * The provisioned definitions in `reporting/definitions` and the catalogue in the domain are two
 * statements of one contract; these tests hold them together, and hold every file to what the
 * Engine was proven to do: an optional narrowing is a runtime-prompt filter bound to a declared
 * parameter, never an `@token` and never an IsNull prompt (which the Engine applies regardless).
 */

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'reporting', 'definitions');

interface Column { alias: string; aggregate?: string; groupOrder?: number }
interface Spec {
  code: string; version: number; grain: string; mode: 'generated' | 'fetchxml' | 'multi'; fetchXml?: string;
  datasets?: { name: string; fetchXml: string; columns: Column[] }[];
  columns: Column[];
  filters: { name: string; field: string; operator: string; value?: string; runtimePrompt?: boolean }[];
  parameters: { name: string; type: string }[];
}

const specs: Spec[] = readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Spec);

describe('the provisioned reporting definitions', () => {
  it('exist', () => {
    expect(specs.length).toBe(15);
  });

  it.each(specs.map(s => [s.code, s] as const))('%s is in the catalogue with the same grain', (_code, spec) => {
    const entry = definitionByCode(spec.code);
    expect(entry?.grain).toBe(spec.grain);
  });

  it.each(specs.map(s => [s.code, s] as const))('%s honours exactly the scope dimensions the catalogue promises', (_code, spec) => {
    const promised = (definitionByCode(spec.code)?.dimensions ?? []).map(dimension => SCOPE_PARAMETERS[dimension]).sort();
    const scopeParameterNames = new Set(Object.values(SCOPE_PARAMETERS));
    const honoured = spec.parameters.map(p => p.name).filter(name => scopeParameterNames.has(name)).sort();
    expect(honoured).toEqual(promised);
  });

  it('sends the source system as the same text everywhere, so one scope value fits every definition', () => {
    const sourceSystemFilters = specs.flatMap(s => s.filters.filter(f => f.runtimePrompt && f.value === 'SourceSystem'));
    expect(sourceSystemFilters.map(f => f.field)).toEqual(sourceSystemFilters.map(() => 'qdb_facilitysourcesystem'));
    expect(specs.flatMap(s => s.parameters.filter(p => p.name === 'SourceSystem')).every(p => p.type === 'Text')).toBe(true);
  });

  it.each(specs.map(s => [s.code, s] as const))('%s binds every runtime-prompt filter to a declared parameter, and no parameter is idle', (_code, spec) => {
    const prompts = spec.filters.filter(f => f.runtimePrompt).map(f => f.value);
    const parameters = spec.parameters.map(p => p.name);
    expect(prompts.filter(p => !parameters.includes(p ?? ''))).toEqual([]);
    expect(parameters.filter(p => !prompts.includes(p))).toEqual([]);
  });

  it.each(specs.map(s => [s.code, s] as const))('%s uses no IsNull runtime prompt and no @token', (_code, spec) => {
    expect(spec.filters.filter(f => f.runtimePrompt && f.operator === 'IsNull')).toEqual([]);
    expect(spec.fetchXml ?? '').not.toMatch(/@\w+/);
  });

  it.each(specs.map(s => [s.code, s] as const))('%s has unique column aliases that an authored fetch also names', (_code, spec) => {
    const authored = spec.mode === 'multi' ? (spec.datasets ?? []) : spec.mode === 'fetchxml' ? [{ fetchXml: spec.fetchXml ?? '', columns: spec.columns }] : [];
    const aliases = spec.columns.map(c => c.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const dataset of authored) {
      for (const column of dataset.columns) expect(dataset.fetchXml).toContain(`alias="${column.alias}"`);
      expect(dataset.columns.every(c => (c.aggregate ?? 'None') === 'None')).toBe(true);
    }
  });

  it('gives a multi-dataset definition a named dataset per count and no top-level columns', () => {
    const multi = specs.filter(s => s.mode === 'multi');
    expect(multi.map(s => s.code)).toEqual(['DCP-RPT-014']);
    const names = multi[0]?.datasets?.map(d => d.name) ?? [];
    expect([new Set(names).size, multi[0]?.columns]).toEqual([names.length, []]);
  });

  it.each(specs.filter(s => s.mode === 'generated').map(s => [s.code, s] as const))('%s in generated mode has exactly one set of group columns and at least one measure', (_code, spec) => {
    const measures = spec.columns.filter(c => c.aggregate && c.aggregate !== 'None');
    const groups = spec.columns.filter(c => !c.aggregate || c.aggregate === 'None');
    expect(measures.length).toBeGreaterThan(0);
    expect(groups.every(g => g.groupOrder !== undefined)).toBe(true);
  });

  it('never says exposure and never calls a case an account', () => {
    const text = JSON.stringify(specs).toLowerCase();
    expect([/\bexposure\b/.test(text), /\baccounts? in collection\b/.test(text)]).toEqual([false, false]);
  });

  it('gives every catalogue report a file, or marks it deferred', () => {
    const reports = REPORT_DEFINITIONS.filter(d => d.kind === 'report' && d.status !== 'deferred');
    const missing = reports.filter(d => !specs.some(s => s.code === d.code)).map(d => d.code);
    expect(missing).toEqual([]);
  });
});
