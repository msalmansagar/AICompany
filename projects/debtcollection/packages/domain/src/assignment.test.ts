import { describe, expect, it } from 'vitest';
import {
  AssignmentError,
  AssignmentMethodSchema,
  UnavailableSmartAssignment,
  resolveAssignmentConfiguration,
  type AssignmentConfiguration,
} from './assignment.js';

const asOf = '2026-07-01T00:00:00.000Z';

function configuration(overrides: Partial<AssignmentConfiguration> = {}): AssignmentConfiguration {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Default', method: 'RoundRobin', priority: 10, effective: {}, isActive: true, ...overrides,
  };
}

describe('assignment methods', () => {
  it('is exactly the provisioned choice, not a superset', () => {
    expect(AssignmentMethodSchema.options).toEqual(['RoundRobin', 'Load', 'Territory', 'SmartAssignment', 'Manual']);
  });

  it('rejects a method the organisation does not offer', () => {
    expect(() => AssignmentMethodSchema.parse('Queue')).toThrow();
  });
});

describe('resolving the assignment configuration', () => {
  it('returns the only active, effective configuration', () => {
    const only = configuration();
    expect(resolveAssignmentConfiguration([only, configuration({ id: '22222222-2222-4222-8222-222222222222', isActive: false })], asOf)).toBe(only);
  });

  it('prefers the lowest priority', () => {
    const winner = configuration({ priority: 1 });
    expect(resolveAssignmentConfiguration([configuration({ id: '33333333-3333-4333-8333-333333333333', priority: 9 }), winner], asOf)).toBe(winner);
  });

  it('refuses when nothing is active and effective', () => {
    expect(() => resolveAssignmentConfiguration([configuration({ effective: { effectiveTo: '2026-01-01' } })], asOf))
      .toThrow(expect.objectContaining({ kind: 'NoneApplicable' }) as never);
  });

  it('refuses a priority tie rather than choosing', () => {
    const a = configuration({ priority: 5 });
    const b = configuration({ id: '44444444-4444-4444-8444-444444444444', priority: 5 });
    expect(() => resolveAssignmentConfiguration([a, b], asOf))
      .toThrow(expect.objectContaining({ kind: 'Conflict' }) as never);
  });
});

describe('Smart Assignment (KI-09)', () => {
  it('refuses to route, and says exactly what is missing', async () => {
    const engine = new UnavailableSmartAssignment();
    await expect(engine.assign({
      case: { facilityNumber: '1', sourceSystem: 'HL', organizationCode: 'HL' },
      configuration: configuration({ method: 'SmartAssignment', name: 'Smart' }),
    })).rejects.toThrow(/Smart Assignment.*contract has not been supplied \(KI-09\)/s);
  });

  it('fails as Unavailable, distinct from a configuration problem', async () => {
    await expect(new UnavailableSmartAssignment().assign({
      case: { facilityNumber: '1', sourceSystem: 'HL', organizationCode: 'HL' },
      configuration: configuration({ method: 'SmartAssignment' }),
    })).rejects.toMatchObject({ name: 'AssignmentError', kind: 'Unavailable' });
  });

  it('invents no routing: the error is the only outcome', async () => {
    const result = await new UnavailableSmartAssignment()
      .assign({ case: { facilityNumber: '1', sourceSystem: 'HL', organizationCode: 'HL' }, configuration: configuration({ method: 'SmartAssignment' }) })
      .then(() => 'routed', (e: unknown) => (e instanceof AssignmentError ? 'refused' : 'other'));
    expect(result).toBe('refused');
  });
});
