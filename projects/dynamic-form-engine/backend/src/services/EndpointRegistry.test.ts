import { describe, it, expect } from 'vitest';
import { EndpointRegistry } from './EndpointRegistry.js';

const VALID = JSON.stringify([
  { endpointKey: 'hr-employees', targetUrl: 'https://hr.example.com/api/employees', authHeaderName: 'X-Api-Key', authHeaderValue: 'secret', timeoutMs: 4000 },
  { endpointKey: 'inactive-one', targetUrl: 'https://x.example.com/api', isActive: false },
]);

describe('EndpointRegistry', () => {
  it('resolves_an_active_key_to_its_endpoint', () => {
    const registry = new EndpointRegistry(VALID);
    const endpoint = registry.resolve('hr-employees');
    expect(endpoint?.targetUrl).toBe('https://hr.example.com/api/employees');
    expect(endpoint?.timeoutMs).toBe(4000);
  });

  it('returns_null_for_unknown_key', () => {
    const registry = new EndpointRegistry(VALID);
    expect(registry.resolve('does-not-exist')).toBeNull();
  });

  it('returns_null_for_inactive_key', () => {
    const registry = new EndpointRegistry(VALID);
    expect(registry.resolve('inactive-one')).toBeNull();
  });

  it('activeKeys_excludes_inactive_entries', () => {
    const registry = new EndpointRegistry(VALID);
    expect(registry.activeKeys()).toEqual(['hr-employees']);
  });

  it('defaults_timeout_to_5000_when_absent', () => {
    const registry = new EndpointRegistry(JSON.stringify([{ endpointKey: 'k', targetUrl: 'https://a.example.com' }]));
    expect(registry.resolve('k')?.timeoutMs).toBe(5000);
  });

  it('rejects_non_https_targets_leaving_registry_empty', () => {
    const registry = new EndpointRegistry(JSON.stringify([{ endpointKey: 'k', targetUrl: 'http://insecure.example.com' }]));
    expect(registry.resolve('k')).toBeNull();
    expect(registry.activeKeys()).toEqual([]);
  });

  it('tolerates_invalid_json_as_empty_registry', () => {
    const registry = new EndpointRegistry('{ not json');
    expect(registry.activeKeys()).toEqual([]);
  });
});
