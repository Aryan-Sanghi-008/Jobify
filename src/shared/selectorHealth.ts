import type { PortalName } from './types';

export type SelectorHealthStorage = Partial<
  Record<PortalName, Record<string, number>>
>;

const STORAGE_KEY = 'selectorHealth';

const TRACKED_PORTALS: PortalName[] = [
  'linkedin',
  'naukri',
  'wellfound',
  'instahyre',
  'greenhouse',
  'lever',
  'workday',
];

export async function reportSelectorFailure(
  portal: PortalName,
  selectorKey: string,
): Promise<void> {
  if (portal === 'generic' || !TRACKED_PORTALS.includes(portal)) {
    return;
  }

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const health = (result[STORAGE_KEY] as SelectorHealthStorage | undefined) ?? {};
    const portalFailures = { ...(health[portal] ?? {}) };

    portalFailures[selectorKey] = (portalFailures[selectorKey] ?? 0) + 1;

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...health,
        [portal]: portalFailures,
      },
    });
  } catch (error) {
    console.error('[JobAutofill SelectorHealth] reportSelectorFailure', error);
  }
}

export async function getSelectorHealth(): Promise<
  { portal: PortalName; failures: Record<string, number> }[]
> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const health = (result[STORAGE_KEY] as SelectorHealthStorage | undefined) ?? {};

    return Object.entries(health)
      .map(([portal, failures]) => ({
        portal: portal as PortalName,
        failures: failures ?? {},
      }))
      .filter((entry) => Object.keys(entry.failures).length > 0)
      .sort((left, right) => left.portal.localeCompare(right.portal));
  } catch (error) {
    console.error('[JobAutofill SelectorHealth] getSelectorHealth', error);
    return [];
  }
}
