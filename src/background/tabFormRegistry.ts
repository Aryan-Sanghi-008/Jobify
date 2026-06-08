import {
  detectPortalFromEmbedUrl,
  detectPortalFromUrl,
  getEmbedHostPriority,
  isKnownApplicationEmbedUrl,
  isLikelyApplicationUrl,
} from '@/shared/applicationDetection';
import type { PageInfoResponse, PortalName } from '@/shared/types';

export interface FormContextEntry {
  frameId: number;
  url: string;
  portal: PortalName;
  fieldCount: number;
  isTopFrame: boolean;
  updatedAt: number;
}

function pickBestFrame(
  frames: FormContextEntry[],
): FormContextEntry | null {
  if (frames.length === 0) {
    return null;
  }

  return [...frames].sort((left, right) => {
    if (right.fieldCount !== left.fieldCount) {
      return right.fieldCount - left.fieldCount;
    }

    const rightPriority = getEmbedHostPriority(right.url);
    const leftPriority = getEmbedHostPriority(left.url);
    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    if (left.isTopFrame !== right.isTopFrame) {
      return left.isTopFrame ? 1 : -1;
    }

    return right.updatedAt - left.updatedAt;
  })[0];
}

export class TabFormRegistry {
  private readonly framesByTab = new Map<number, Map<number, FormContextEntry>>();
  private readonly activeFrameByTab = new Map<number, number>();

  register(
    tabId: number,
    frameId: number,
    entry: Omit<FormContextEntry, 'frameId' | 'updatedAt'>,
  ): void {
    const frames = this.framesByTab.get(tabId) ?? new Map<number, FormContextEntry>();
    frames.set(frameId, {
      ...entry,
      frameId,
      updatedAt: Date.now(),
    });
    this.framesByTab.set(tabId, frames);
    this.recomputeActiveFrame(tabId);
  }

  removeTab(tabId: number): void {
    this.framesByTab.delete(tabId);
    this.activeFrameByTab.delete(tabId);
  }

  getFrames(tabId: number): FormContextEntry[] {
    const frames = this.framesByTab.get(tabId);
    if (!frames) {
      return [];
    }

    return Array.from(frames.values());
  }

  getActiveFrameId(tabId: number): number {
    return this.activeFrameByTab.get(tabId) ?? 0;
  }

  private recomputeActiveFrame(tabId: number): void {
    const best = pickBestFrame(this.getFrames(tabId));
    if (best) {
      this.activeFrameByTab.set(tabId, best.frameId);
    }
  }

  aggregatePageInfo(tabId: number, tabUrl: string): PageInfoResponse | null {
    const frames = this.getFrames(tabId);
    const best = pickBestFrame(frames);
    const tabPortal = detectPortalFromUrl(tabUrl);
    const tabLooksLikeApplication = isLikelyApplicationUrl(tabUrl);

    const embedFrame = frames.find((frame) => isKnownApplicationEmbedUrl(frame.url));

    const fieldCount = best?.fieldCount ?? 0;
    const hasApplicationForm =
      fieldCount > 0 ||
      tabPortal !== 'generic' ||
      tabLooksLikeApplication ||
      embedFrame !== undefined;

    if (!hasApplicationForm) {
      return null;
    }

    const portal =
      best && best.fieldCount > 0
        ? best.portal
        : embedFrame
          ? detectPortalFromEmbedUrl(embedFrame.url)
          : tabPortal;

    const activeFrameId = best?.frameId ?? embedFrame?.frameId ?? 0;
    this.activeFrameByTab.set(tabId, activeFrameId);

    return {
      company: '',
      jobTitle: '',
      portal,
      hasApplicationForm: true,
      formFieldCount: fieldCount,
      formFrameId: activeFrameId,
      formFrameUrl: best?.url ?? embedFrame?.url,
    };
  }
}

export const tabFormRegistry = new TabFormRegistry();
