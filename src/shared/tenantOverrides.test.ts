import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  getTenantRepeatableConfig,
  HOSTNAME_OVERRIDES,
} from '@/shared/tenantOverrides';

describe('tenantOverrides', () => {
  it('returns default config for unknown hostnames', () => {
    expect(getTenantRepeatableConfig('careers.example.com')).toEqual(DEFAULT_CONFIG);
  });

  it('merges hostname overrides for Greenhouse', () => {
    expect(getTenantRepeatableConfig('boards.greenhouse.io')).toEqual({
      ...DEFAULT_CONFIG,
      bulkEnsureEntries: true,
    });
  });

  it('merges hostname overrides for Lever subdomains', () => {
    expect(getTenantRepeatableConfig('jobs.lever.co')).toEqual({
      ...DEFAULT_CONFIG,
      bulkEnsureEntries: true,
    });
  });

  it('handles empty hostname safely', () => {
    expect(getTenantRepeatableConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('exposes optional hostname override registry', () => {
    expect(HOSTNAME_OVERRIDES['boards.greenhouse.io']?.bulkEnsureEntries).toBe(
      true,
    );
  });
});
