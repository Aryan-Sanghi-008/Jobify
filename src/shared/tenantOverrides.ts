export interface TenantRepeatableConfig {
  addButtonStrategy: 'section-scoped' | 'dom-order';
  dateWidget: 'spinbutton' | 'text' | 'dropdown' | 'auto';
  bulkEnsureEntries: boolean;
}

const DEFAULT_CONFIG: TenantRepeatableConfig = {
  addButtonStrategy: 'section-scoped',
  dateWidget: 'auto',
  bulkEnsureEntries: false,
};

const HOSTNAME_OVERRIDES: Record<string, Partial<TenantRepeatableConfig>> = {
  'boards.greenhouse.io': {
    bulkEnsureEntries: true,
  },
  'jobs.lever.co': {
    bulkEnsureEntries: true,
  },
};

/**
 * Returns repeatable-section config for the current hostname with optional overrides.
 */
export function getTenantRepeatableConfig(
  hostname: string = typeof window !== 'undefined'
    ? (window.location.hostname ?? '')
    : '',
): TenantRepeatableConfig {
  const normalized = (hostname ?? '').toLowerCase();

  for (const [host, override] of Object.entries(HOSTNAME_OVERRIDES)) {
    if (normalized === host || normalized.endsWith(`.${host}`)) {
      return { ...DEFAULT_CONFIG, ...override };
    }
  }

  return { ...DEFAULT_CONFIG };
}

export { DEFAULT_CONFIG, HOSTNAME_OVERRIDES };
