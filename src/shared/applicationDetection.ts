import type { PortalName } from '@/shared/types';

const APPLICATION_PATH_PATTERNS = [
  /\/apply\b/i,
  /\/application\b/i,
  /\/jobs?\//i,
  /\/careers?\//i,
  /\/position\//i,
  /\/posting\//i,
  /\/openings?\//i,
  /\/opportunit(?:y|ies)\//i,
  /\/vacanc(?:y|ies)\//i,
  /\/requisition\//i,
  /\/role\//i,
];

const APPLICATION_HOST_PATTERNS = [
  /myworkdayjobs\.com/i,
  /greenhouse\.io/i,
  /lever\.co/i,
  /comeet\.co/i,
  /comeet\.com/i,
  /smartrecruiters\.com/i,
  /ashbyhq\.com/i,
  /workable\.com/i,
  /breezy\.hr/i,
  /jobvite\.com/i,
  /icims\.com/i,
  /taleo\.net/i,
  /recruitee\.com/i,
  /teamtailor\.com/i,
  /jazz\.co/i,
  /applytojob\.com/i,
  /pinpoint\.dev/i,
  /bamboohr\.com\/careers/i,
];

const EMBED_APPLICATION_PATH_PATTERNS = [
  /\/apply\b/i,
  /\/application\b/i,
  /\/jobs?\//i,
  /\/posting\//i,
];

export interface EmbedHostConfig {
  host: RegExp;
  portal: PortalName;
  priority: number;
}

export const EMBED_ATS_HOSTS: EmbedHostConfig[] = [
  { host: /comeet\.co/i, portal: 'comeet', priority: 100 },
  { host: /comeet\.com/i, portal: 'comeet', priority: 100 },
  { host: /greenhouse\.io/i, portal: 'greenhouse', priority: 90 },
  { host: /lever\.co/i, portal: 'lever', priority: 90 },
  { host: /myworkdayjobs\.com/i, portal: 'workday', priority: 85 },
  { host: /smartrecruiters\.com/i, portal: 'generic', priority: 70 },
  { host: /ashbyhq\.com/i, portal: 'generic', priority: 70 },
  { host: /workable\.com/i, portal: 'generic', priority: 65 },
  { host: /icims\.com/i, portal: 'generic', priority: 60 },
  { host: /jobvite\.com/i, portal: 'generic', priority: 60 },
  { host: /recruitee\.com/i, portal: 'generic', priority: 55 },
  { host: /teamtailor\.com/i, portal: 'generic', priority: 55 },
];

const PORTAL_HOST_PATTERNS: Array<{ pattern: RegExp; portal: PortalName }> = [
  { pattern: /linkedin\.com/i, portal: 'linkedin' },
  { pattern: /naukri\.com/i, portal: 'naukri' },
  { pattern: /wellfound\.com|angel\.co/i, portal: 'wellfound' },
  { pattern: /instahyre\.com/i, portal: 'instahyre' },
  { pattern: /greenhouse\.io/i, portal: 'greenhouse' },
  { pattern: /lever\.co/i, portal: 'lever' },
  { pattern: /myworkdayjobs\.com|workday\.com/i, portal: 'workday' },
  { pattern: /comeet\.co|comeet\.com/i, portal: 'comeet' },
];

const APPLICATION_PAGE_TEXT_PATTERNS = [
  /fields marked with \* are mandatory/i,
  /attach resume/i,
  /submit application/i,
  /apply for this (job|position|role)/i,
];

function isRestrictedBrowserUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  );
}

function normalizeUrl(url: string): string {
  return url.toLowerCase();
}

/** Whether a URL likely hosts a job application form. */
export function isLikelyApplicationUrl(url: string): boolean {
  if (!url || isRestrictedBrowserUrl(url)) {
    return false;
  }

  const normalized = normalizeUrl(url);
  return (
    APPLICATION_PATH_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    APPLICATION_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

/** Detect portal from a URL, including embedded ATS hosts. */
export function detectPortalFromUrl(url: string): PortalName {
  const normalized = normalizeUrl(url);

  for (const { pattern, portal } of PORTAL_HOST_PATTERNS) {
    if (pattern.test(normalized)) {
      return portal;
    }
  }

  return 'generic';
}

/** Whether an iframe src URL belongs to a known application embed. */
export function isKnownApplicationEmbedUrl(url: string): boolean {
  if (!url || isRestrictedBrowserUrl(url)) {
    return false;
  }

  const normalized = normalizeUrl(url);
  const hostMatch = EMBED_ATS_HOSTS.some((entry) => entry.host.test(normalized));
  if (!hostMatch) {
    return false;
  }

  return EMBED_APPLICATION_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Priority score for embed host tie-breaking (higher wins). */
export function getEmbedHostPriority(url: string): number {
  const normalized = normalizeUrl(url);

  for (const entry of EMBED_ATS_HOSTS) {
    if (entry.host.test(normalized)) {
      return entry.priority;
    }
  }

  return 0;
}

/** Portal implied by an embed iframe URL. */
export function detectPortalFromEmbedUrl(url: string): PortalName {
  const normalized = normalizeUrl(url);

  for (const entry of EMBED_ATS_HOSTS) {
    if (entry.host.test(normalized)) {
      return entry.portal;
    }
  }

  return 'generic';
}

function countRenderableInputs(root: ParentNode): number {
  if (typeof document === 'undefined') {
    return 0;
  }

  try {
    return root.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
    ).length;
  } catch {
    return 0;
  }
}

function hasVisibleApplicationIframe(doc: ParentNode): boolean {
  if (!(doc instanceof Document)) {
    return false;
  }

  for (const iframe of doc.querySelectorAll('iframe')) {
    const src = iframe.getAttribute('src') ?? '';
    if (!src || !isKnownApplicationEmbedUrl(src)) {
      continue;
    }

    const rect = iframe.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return true;
    }
  }

  return false;
}

/** DOM heuristics for career pages that host embedded application forms. */
export function hasApplicationPageHeuristics(doc: ParentNode = document): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const text =
    doc instanceof Document
      ? doc.body?.innerText || doc.body?.textContent || ''
      : (doc.textContent ?? '');

  if (APPLICATION_PAGE_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (hasVisibleApplicationIframe(doc)) {
    return true;
  }

  if (countRenderableInputs(doc) >= 3) {
    return true;
  }

  return false;
}

export {
  APPLICATION_HOST_PATTERNS,
  APPLICATION_PATH_PATTERNS,
  EMBED_APPLICATION_PATH_PATTERNS,
};
