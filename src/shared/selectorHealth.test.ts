import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSelectorHealth, reportSelectorFailure } from '@/shared/selectorHealth';

let store: Record<string, unknown> = {};

describe('selectorHealth storage', () => {
  beforeEach(() => {
    store = {};

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => {
            if (key in store) {
              return { [key]: store[key] };
            }

            return {};
          }),
          set: vi.fn(async (data: Record<string, unknown>) => {
            Object.assign(store, data);
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records selector failures per portal and key', async () => {
    await reportSelectorFailure('wellfound', 'applyButton');
    await reportSelectorFailure('wellfound', 'applyButton');
    await reportSelectorFailure('wellfound', 'formContainer');

    const health = await getSelectorHealth();

    expect(health).toEqual([
      {
        portal: 'wellfound',
        failures: {
          applyButton: 2,
          formContainer: 1,
        },
      },
    ]);
  });

  it('ignores generic portal failures', async () => {
    await reportSelectorFailure('generic', 'applyButton');

    await expect(getSelectorHealth()).resolves.toEqual([]);
  });
});
