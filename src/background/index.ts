import { VERSION } from '@/shared/constants';
import {
  DEFAULT_SETTINGS,
  getProfile,
  getSettings,
  learnField,
  logApplication,
  saveProfile,
} from '@/shared/storage';
import type {
  ExtensionMessage,
  JobApplication,
  MessageType,
  PortalName,
  UserProfile,
} from '@/shared/types';
import { detectPortal, generateId } from '@/shared/utils';

const MESSAGE_TYPES: MessageType[] = [
  'GET_PROFILE',
  'SAVE_PROFILE',
  'LOG_APPLICATION',
  'LEARN_FIELD',
  'GET_SETTINGS',
  'PING',
  'PORTAL_DETECTED',
  'APPLICATION_COMPLETE',
  'FORM_STATE_CHANGED',
];

const PORTAL_BADGE_ABBREVIATIONS: Record<Exclude<PortalName, 'generic'>, string> =
  {
    linkedin: 'LI',
    naukri: 'NK',
    wellfound: 'WF',
    instahyre: 'IH',
    greenhouse: 'GH',
    lever: 'LV',
    workday: 'WD',
  };

function assertRuntimeValid(): void {
  if (!chrome.runtime?.id) {
    throw new Error('Extension context invalidated');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUserProfile(payload: unknown): payload is UserProfile {
  if (!isRecord(payload)) {
    return false;
  }

  return isRecord(payload.personal) && isRecord(payload.professional);
}

function isJobApplication(payload: unknown): payload is JobApplication {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.id === 'string' &&
    typeof payload.company === 'string' &&
    typeof payload.role === 'string' &&
    typeof payload.portal === 'string' &&
    typeof payload.url === 'string' &&
    typeof payload.appliedAt === 'number' &&
    typeof payload.status === 'string'
  );
}

function validateMessage(message: unknown): message is ExtensionMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  if (!MESSAGE_TYPES.includes(message.type as MessageType)) {
    return false;
  }

  switch (message.type) {
    case 'GET_PROFILE':
    case 'GET_SETTINGS':
    case 'PING':
      return true;
    case 'SAVE_PROFILE':
      return isUserProfile(message.payload);
    case 'LOG_APPLICATION':
      return isJobApplication(message.payload);
    case 'LEARN_FIELD':
      return (
        typeof message.labelHash === 'string' &&
        typeof message.profileKey === 'string' &&
        (message.normalizedLabel === undefined ||
          typeof message.normalizedLabel === 'string') &&
        (message.site === undefined || typeof message.site === 'string')
      );
    case 'PORTAL_DETECTED':
      return typeof message.portal === 'string';
    case 'APPLICATION_COMPLETE':
      return (
        isRecord(message.payload) &&
        typeof message.payload.company === 'string' &&
        typeof message.payload.role === 'string' &&
        typeof message.payload.portal === 'string' &&
        typeof message.payload.url === 'string'
      );
    case 'FORM_STATE_CHANGED':
      return (
        isRecord(message.payload) &&
        typeof message.payload.state === 'string' &&
        typeof message.payload.pageNumber === 'number' &&
        typeof message.payload.totalFilled === 'number' &&
        Array.isArray(message.payload.totalUnknown) &&
        Array.isArray(message.payload.errors)
      );
    default:
      return false;
  }
}

async function initializeStorage(): Promise<void> {
  assertRuntimeValid();
  await chrome.storage.local.set({
    profile: null,
    coverLetters: [],
    applications: [],
    learnedFields: {},
    settings: DEFAULT_SETTINGS,
  });
}

async function runMigration(): Promise<void> {
  console.log(`migration v${VERSION} complete`);
}

async function openPopupOnInstall(): Promise<void> {
  assertRuntimeValid();

  try {
    await chrome.action.openPopup();
  } catch (error) {
    console.warn('[JobAutofill Background] Unable to open popup on install:', error);
  }
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  assertRuntimeValid();

  switch (message.type) {
    case 'GET_PROFILE':
      return getProfile();
    case 'SAVE_PROFILE':
      await saveProfile(message.payload);
      return { success: true };
    case 'LOG_APPLICATION':
      await logApplication(message.payload);
      return { success: true };
    case 'LEARN_FIELD':
      await learnField(
        message.labelHash,
        message.profileKey,
        message.normalizedLabel ?? '',
        message.site,
      );
      return { success: true };
    case 'GET_SETTINGS':
      return getSettings();
    case 'PING':
      return { alive: true };
    case 'PORTAL_DETECTED': {
      if (sender.tab?.id !== undefined) {
        await setPortalBadge(sender.tab.id, message.portal);
      }
      return { success: true };
    }
    case 'APPLICATION_COMPLETE': {
      const application: JobApplication = {
        id: generateId(),
        company: message.payload.company,
        role: message.payload.role,
        portal: message.payload.portal,
        url: message.payload.url,
        appliedAt: Date.now(),
        status: 'applied',
        notes: '',
      };
      await logApplication(application);
      return { success: true };
    }
    case 'FORM_STATE_CHANGED':
      return { success: true };
    default: {
      const exhaustiveCheck: never = message;
      throw new Error(`Unhandled message type: ${String(exhaustiveCheck)}`);
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

async function setPortalBadge(
  tabId: number,
  portal: PortalName,
): Promise<void> {
  assertRuntimeValid();

  if (portal === 'generic') {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  await chrome.action.setBadgeText({
    tabId,
    text: PORTAL_BADGE_ABBREVIATIONS[portal],
  });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3B82F6' });
}

async function notifyPortalDetected(
  tabId: number,
  portal: PortalName,
): Promise<void> {
  assertRuntimeValid();

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'PORTAL_DETECTED',
      portal,
    });
  } catch {
    // Content script may not be ready yet on first load.
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    try {
      assertRuntimeValid();

      if (details.reason === 'install') {
        await initializeStorage();
        await openPopupOnInstall();
        return;
      }

      if (details.reason === 'update') {
        await runMigration();
      }
    } catch (error) {
      console.error('[JobAutofill Background] onInstalled failed:', error);
    }
  })();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      assertRuntimeValid();

      if (!validateMessage(message)) {
        sendResponse({
          success: false,
          error: 'Invalid message',
        });
        return;
      }

      const response = await handleMessage(message, _sender);
      sendResponse(response);
    } catch (error) {
      sendResponse({
        success: false,
        error: getErrorMessage(error),
      });
    }
  })();

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    try {
      assertRuntimeValid();

      if (changeInfo.status !== 'complete' || !tab.url) {
        return;
      }

      const portal = detectPortal(tab.url);
      await setPortalBadge(tabId, portal);

      if (portal === 'generic') {
        return;
      }

      if (tab.id === undefined) {
        return;
      }

      await notifyPortalDetected(tab.id, portal);
    } catch (error) {
      console.error('[JobAutofill Background] onUpdated failed:', error);
    }
  })();
});
