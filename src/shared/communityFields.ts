import Fuse from 'fuse.js';
import { FIELD_LABEL_MAP, GITHUB_URL } from '@/shared/constants';
import { getUniqueLearnedEntries } from '@/shared/storage';
import type {
  CommunityFieldEntry,
  CommunityFieldsMap,
  LearnedField,
  PortalName,
  ProfileMatchKey,
} from '@/shared/types';
import { detectPortal, hashString, normalizeLabel } from '@/shared/utils';

const COMMUNITY_FUSE_THRESHOLD = 0.35;
const PORTAL_NAMES: PortalName[] = [
  'linkedin',
  'naukri',
  'wellfound',
  'instahyre',
  'greenhouse',
  'lever',
  'workday',
  'comeet',
  'generic',
];

export interface CommunityContributionEntry {
  label: string;
  profileKey: ProfileMatchKey;
  portals: PortalName[];
}

export interface CommunityMatchResult {
  profileKey: ProfileMatchKey;
  confidence: number;
}

interface CommunityFuseEntry {
  label: string;
  profileKey: ProfileMatchKey;
  votes: number;
  portals: PortalName[];
}

let cachedCommunityFieldsVersion: string | null = null;
let cachedCommunityFuse: Fuse<CommunityFuseEntry> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPortalName(value: unknown): value is PortalName {
  return typeof value === 'string' && PORTAL_NAMES.includes(value as PortalName);
}

export function isProfileMatchKey(key: string): key is ProfileMatchKey {
  return key === 'resumeFile' || key in FIELD_LABEL_MAP;
}

function communityConfidence(votes: number): number {
  return Math.min(0.95, 0.75 + Math.min(votes * 0.01, 0.2));
}

function computeCommunityFieldsVersion(map: CommunityFieldsMap): string {
  const serialized = Object.entries(map)
    .map(
      ([hash, entry]) =>
        `${hash}:${entry.profileKey}:${entry.labels.join(',')}:${entry.portals.join(',')}:${entry.votes}`,
    )
    .sort()
    .join('|');

  return hashString(serialized);
}

function portalMatches(entry: CommunityFieldEntry, portal: PortalName): boolean {
  if (entry.portals.length === 0) {
    return true;
  }

  return entry.portals.includes(portal);
}

function sitesToPortals(sites: string[]): PortalName[] {
  const portals = new Set<PortalName>();

  for (const site of sites) {
    const url = site.includes('://') ? site : `https://${site}`;
    const portal = detectPortal(url);
    if (portal !== 'generic') {
      portals.add(portal);
    }
  }

  return Array.from(portals);
}

export function parseCommunityFields(raw: unknown): CommunityFieldsMap {
  if (!isRecord(raw)) {
    throw new Error('Community fields payload must be an object');
  }

  const parsed: CommunityFieldsMap = {};

  for (const [fieldHash, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      continue;
    }

    if (typeof value.profileKey !== 'string' || !isProfileMatchKey(value.profileKey)) {
      continue;
    }

    if (!Array.isArray(value.labels)) {
      continue;
    }

    const labels = value.labels
      .filter((label): label is string => typeof label === 'string')
      .map((label) => normalizeLabel(label))
      .filter(Boolean);

    if (labels.length === 0) {
      continue;
    }

    const portals = Array.isArray(value.portals)
      ? value.portals.filter(isPortalName)
      : [];

    const votes = typeof value.votes === 'number' && value.votes >= 0 ? value.votes : 0;

    parsed[fieldHash] = {
      profileKey: value.profileKey,
      labels,
      portals,
      votes,
    };
  }

  return parsed;
}

export async function fetchCommunityFields(url: string): Promise<CommunityFieldsMap> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch {
    throw new Error('Network error while fetching community fields');
  }

  if (!response.ok) {
    throw new Error(`Community fields fetch failed (${response.status})`);
  }

  const raw: unknown = await response.json();
  return parseCommunityFields(raw);
}

export function buildCommunityFuseIndex(
  map: CommunityFieldsMap,
): Fuse<CommunityFuseEntry> {
  const entries: CommunityFuseEntry[] = [];

  for (const entry of Object.values(map)) {
    if (!isProfileMatchKey(entry.profileKey)) {
      continue;
    }

    for (const label of entry.labels) {
      if (!label) {
        continue;
      }

      entries.push({
        label,
        profileKey: entry.profileKey,
        votes: entry.votes,
        portals: entry.portals,
      });
    }
  }

  return new Fuse(entries, {
    keys: ['label'],
    threshold: COMMUNITY_FUSE_THRESHOLD,
    includeScore: true,
    ignoreLocation: true,
  });
}

function getCommunityFuseIndex(map: CommunityFieldsMap): Fuse<CommunityFuseEntry> {
  const version = computeCommunityFieldsVersion(map);

  if (cachedCommunityFuse && cachedCommunityFieldsVersion === version) {
    return cachedCommunityFuse;
  }

  cachedCommunityFieldsVersion = version;
  cachedCommunityFuse = buildCommunityFuseIndex(map);
  return cachedCommunityFuse;
}

export function invalidateCommunityFieldsCache(): void {
  cachedCommunityFieldsVersion = null;
  cachedCommunityFuse = null;
}

function resolveCommunityExact(
  normalizedLabel: string,
  map: CommunityFieldsMap,
  portal: PortalName,
): CommunityMatchResult | undefined {
  const labelHash = hashString(normalizedLabel);
  const directEntry = map[labelHash];

  if (directEntry && portalMatches(directEntry, portal)) {
    if (isProfileMatchKey(directEntry.profileKey)) {
      return {
        profileKey: directEntry.profileKey,
        confidence: communityConfidence(directEntry.votes),
      };
    }
  }

  for (const entry of Object.values(map)) {
    if (!portalMatches(entry, portal) || !isProfileMatchKey(entry.profileKey)) {
      continue;
    }

    if (entry.labels.includes(normalizedLabel)) {
      return {
        profileKey: entry.profileKey,
        confidence: communityConfidence(entry.votes),
      };
    }
  }

  return undefined;
}

function resolveCommunityFuzzy(
  normalizedLabel: string,
  fuse: Fuse<CommunityFuseEntry>,
  portal: PortalName,
): CommunityMatchResult | undefined {
  const results = fuse.search(normalizedLabel);
  const best = results.find((result) => portalMatches(
    { profileKey: result.item.profileKey, labels: [], portals: result.item.portals, votes: result.item.votes },
    portal,
  ));

  if (!best || (best.score ?? 1) > COMMUNITY_FUSE_THRESHOLD) {
    return undefined;
  }

  return {
    profileKey: best.item.profileKey,
    confidence: communityConfidence(best.item.votes) * (1 - (best.score ?? 0)),
  };
}

export function resolveCommunityMatch(
  normalizedLabel: string,
  map: CommunityFieldsMap,
  portal: PortalName,
): CommunityMatchResult | undefined {
  if (Object.keys(map).length === 0) {
    return undefined;
  }

  const exact = resolveCommunityExact(normalizedLabel, map, portal);
  if (exact) {
    return exact;
  }

  const fuse = getCommunityFuseIndex(map);
  return resolveCommunityFuzzy(normalizedLabel, fuse, portal);
}

export function exportContributionEntries(
  learnedFields: Record<string, LearnedField>,
): CommunityContributionEntry[] {
  const entries: CommunityContributionEntry[] = [];
  const seen = new Set<string>();

  for (const field of getUniqueLearnedEntries(learnedFields)) {
    if (!isProfileMatchKey(field.value)) {
      continue;
    }

    const label = field.normalizedLabel.trim();
    if (!label) {
      continue;
    }

    const dedupeKey = `${label}:${field.value}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    entries.push({
      label,
      profileKey: field.value,
      portals: sitesToPortals(field.sites),
    });
  }

  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

export function buildContributionIssueUrl(
  entries: CommunityContributionEntry[],
): string {
  const title = encodeURIComponent('Community field mapping contribution');
  const lines = [
    '## Community field contribution',
    '',
    '| Label | Profile key | Portals seen |',
    '|-------|-------------|--------------|',
  ];

  for (const entry of entries) {
    const portals =
      entry.portals.length > 0 ? entry.portals.join(', ') : 'all';
    lines.push(`| ${entry.label} | ${entry.profileKey} | ${portals} |`);
  }

  lines.push('', '<!-- Maintainer: merge into community-fields.json -->');

  const body = encodeURIComponent(lines.join('\n'));
  return `${GITHUB_URL}/issues/new?title=${title}&body=${body}`;
}
