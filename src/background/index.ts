import { VERSION } from '@/shared/constants';
import {
  assertRuntimeValid,
  validateMessage,
  validateProfile,
} from '@/shared/security';
import {
  DEFAULT_SETTINGS,
  getProfile,
  getSettings,
  hasRecentApplication,
  learnField,
  logApplication,
  saveProfile,
} from '@/shared/storage';
import type { ExtensionMessage, JobApplication, PortalName } from '@/shared/types';
import { detectPortal, generateId } from '@/shared/utils';

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

async function showApplicationLoggedNotification(
  company: string,
  role: string,
): Promise<void> {
  try {
    await chrome.notifications.create(`app-logged-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.svg'),
      title: 'Application logged!',
      message: `${company} - ${role}`,
    });
  } catch (error) {
    console.warn(
      '[JobAutofill Background] Failed to show application notification:',
      error,
    );
  }
}

async function submitApplicationLog(
  app: JobApplication,
): Promise<{ logged: boolean }> {
  if (await hasRecentApplication(app.company, app.role)) {
    return { logged: false };
  }

  await logApplication(app);
  await showApplicationLoggedNotification(app.company, app.role);
  return { logged: true };
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  assertRuntimeValid();

  switch (message.type) {
    case 'GET_PROFILE':
      return getProfile();
    case 'SAVE_PROFILE': {
      const validation = validateProfile(message.payload);
      if (!validation.valid) {
        throw new Error('Invalid profile data');
      }

      await saveProfile(message.payload);
      return { success: true };
    }
    case 'LOG_APPLICATION': {
      const result = await submitApplicationLog(message.payload);
      return { success: true, ...result };
    }
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
      const result = await submitApplicationLog(application);
      return { success: true, ...result };
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
