import { VERSION } from '@/shared/constants';
import { Logger } from '@/shared/logger';
import {
  assertRuntimeValid,
  sanitizeString,
  validateMessage,
  validateProfile,
} from '@/shared/security';
import {
  DEFAULT_SETTINGS,
  getProfile,
  getSettings,
  hasRecentApplication,
  saveSettings,
  learnField,
  logApplication,
  saveProfile,
} from '@/shared/storage';
import type {
  ExtensionMessage,
  JobApplication,
  PageInfoResponse,
  PortalName,
  TriggerAutofillResponse,
} from '@/shared/types';
import { detectPortal, generateId } from '@/shared/utils';

const MESSAGE_TIMEOUT_MS = 5000;

const CONTEXT_MENU_URL_PATTERNS = [
  'https://www.linkedin.com/*',
  'https://www.naukri.com/*',
  'https://wellfound.com/*',
  'https://www.instahyre.com/*',
  'https://*.greenhouse.io/*',
  'https://*.lever.co/*',
  'https://*.myworkdayjobs.com/*',
];

const CONTEXT_MENU_IDS = {
  autofillPage: 'autofill-page',
  logApplication: 'log-application',
  useAsCompanyName: 'use-as-company-name',
} as const;

interface TabPageContext {
  company?: string;
  jobTitle?: string;
}

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
    lastFillResult: null,
  });
}

async function runMigration(): Promise<void> {
  const stored = await chrome.storage.local.get('settings');
  const settings = stored.settings as Record<string, unknown> | undefined;

  if (settings && !('onboardingComplete' in settings)) {
    await saveSettings({ onboardingComplete: true });
  }

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

function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Message timeout'));
    }, MESSAGE_TIMEOUT_MS);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response as T);
    });
  });
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function isAutofillableUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return (
    !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://') &&
    !url.startsWith('edge://') &&
    !url.startsWith('about:')
  );
}

async function isContentScriptReady(tabId: number): Promise<boolean> {
  try {
    const response = await sendTabMessage<unknown>(tabId, { type: 'GET_PAGE_INFO' });
    return Boolean(response && typeof response === 'object');
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  if (await isContentScriptReady(tabId)) {
    return;
  }

  const manifest = chrome.runtime.getManifest();
  const files = manifest.content_scripts?.[0]?.js;

  if (!files?.length) {
    throw new Error('Content script not configured');
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  });

  if (!(await isContentScriptReady(tabId))) {
    throw new Error('Content script did not respond after injection');
  }
}

async function showShortcutNotification(
  title: string,
  message: string,
): Promise<void> {
  try {
    await chrome.notifications.create(`shortcut-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.svg'),
      title,
      message,
    });
  } catch (error) {
    console.warn(
      '[JobAutofill Background] Failed to show shortcut notification:',
      error,
    );
  }
}

function formatAutofillNotification(
  response: TriggerAutofillResponse,
): { title: string; message: string } {
  if ('type' in response && response.type === 'PROFILE_INCOMPLETE') {
    return {
      title: 'Autofill blocked',
      message: 'Complete your profile email in Jobify first.',
    };
  }

  if ('type' in response && response.type === 'AUTOFILL_STARTED') {
    return {
      title: 'Autofill started',
      message: 'Filling the current page…',
    };
  }

  if ('errors' in response && response.errors.length > 0) {
    return {
      title: 'Autofill failed',
      message: response.errors[0],
    };
  }

  if ('filled' in response) {
    const unknownCount = response.unknown.length;
    return {
      title: 'Autofill complete',
      message: `Filled ${response.filled} fields · ${unknownCount} unknown`,
    };
  }

  return {
    title: 'Autofill',
    message: 'Triggered on the current page.',
  };
}

function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.autofillPage,
      title: 'Auto-fill this application',
      contexts: ['page'],
      documentUrlPatterns: CONTEXT_MENU_URL_PATTERNS,
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.logApplication,
      title: 'Log this application manually',
      contexts: ['page'],
      documentUrlPatterns: CONTEXT_MENU_URL_PATTERNS,
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.useAsCompanyName,
      title: "Use '%s' as company name",
      contexts: ['selection'],
    });
  });
}

async function setPageContextCompany(
  pageUrl: string,
  company: string,
): Promise<void> {
  const stored = await chrome.storage.session.get('pageContextByUrl');
  const map =
    (stored.pageContextByUrl as Record<string, TabPageContext> | undefined) ?? {};

  map[pageUrl] = {
    ...map[pageUrl],
    company: sanitizeString(company),
  };

  await chrome.storage.session.set({ pageContextByUrl: map });
}

async function triggerAutofillOnTab(tab?: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id) {
    await showShortcutNotification('Autofill failed', 'No active tab found.');
    return;
  }

  if (!isAutofillableUrl(tab.url)) {
    await showShortcutNotification(
      'Autofill failed',
      'This page cannot be auto-filled.',
    );
    return;
  }

  try {
    await ensureContentScript(tab.id);
    const response = await sendTabMessage<TriggerAutofillResponse>(tab.id, {
      type: 'TRIGGER_AUTOFILL',
    });
    const notification = formatAutofillNotification(response);
    await showShortcutNotification(notification.title, notification.message);
  } catch (error) {
    await showShortcutNotification('Autofill failed', getErrorMessage(error));
  }
}

async function handleTriggerAutofillCommand(): Promise<void> {
  const tab = await getActiveTab();
  await triggerAutofillOnTab(tab ?? undefined);
}

async function openManualLogPopup(tab?: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id || !tab.url) {
    await showShortcutNotification(
      'Log failed',
      'Could not read the current page.',
    );
    return;
  }

  try {
    await ensureContentScript(tab.id);

    let pageInfo: PageInfoResponse = {
      company: '',
      jobTitle: '',
      portal: detectPortal(tab.url),
    };

    try {
      pageInfo = await sendTabMessage<PageInfoResponse>(tab.id, {
        type: 'GET_PAGE_INFO',
      });
    } catch {
      // Fall back to portal detection only.
    }

    await chrome.storage.session.set({
      pendingManualLog: {
        tabId: tab.id,
        url: tab.url,
        portal: pageInfo.portal,
        company: pageInfo.company,
        role: pageInfo.jobTitle,
      },
    });

    await chrome.windows.create({
      url: chrome.runtime.getURL('popup/log-application.html'),
      type: 'popup',
      width: 380,
      height: 320,
    });
  } catch (error) {
    await showShortcutNotification('Log failed', getErrorMessage(error));
  }
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (info.menuItemId === CONTEXT_MENU_IDS.autofillPage) {
    await triggerAutofillOnTab(tab);
    return;
  }

  if (info.menuItemId === CONTEXT_MENU_IDS.logApplication) {
    await openManualLogPopup(tab);
    return;
  }

  if (info.menuItemId === CONTEXT_MENU_IDS.useAsCompanyName) {
    const company = info.selectionText?.trim() ?? '';
    const pageUrl = info.pageUrl ?? tab?.url;

    if (!company) {
      await showShortcutNotification(
        'Company name not set',
        'Select some text first.',
      );
      return;
    }

    if (!pageUrl) {
      await showShortcutNotification(
        'Company name not set',
        'Could not determine the current page.',
      );
      return;
    }

    await setPageContextCompany(pageUrl, company);
    await showShortcutNotification(
      'Company name set',
      `"${company}" will be used in cover letters on this page.`,
    );
  }
}

async function handleOpenTrackerCommand(): Promise<void> {
  await chrome.storage.session.set({ pendingPopupTab: 'tracker' });

  try {
    await chrome.action.openPopup();
  } catch (error) {
    console.warn('[JobAutofill Background] Unable to open popup for tracker:', error);
  }
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

setupContextMenus();
void Logger.refreshDebugMode();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') {
    return;
  }

  const nextSettings = changes.settings?.newValue as { debugMode?: boolean } | undefined;
  if (typeof nextSettings?.debugMode === 'boolean') {
    Logger.setDebugMode(nextSettings.debugMode);
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    try {
      assertRuntimeValid();
      await Logger.refreshDebugMode();

      setupContextMenus();

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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    try {
      assertRuntimeValid();
      await handleContextMenuClick(info, tab);
    } catch (error) {
      console.error('[JobAutofill Background] context menu failed:', error);
    }
  })();
});

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    try {
      assertRuntimeValid();

      if (command === 'trigger-autofill') {
        await handleTriggerAutofillCommand();
        return;
      }

      if (command === 'open-tracker') {
        await handleOpenTrackerCommand();
      }
    } catch (error) {
      console.error('[JobAutofill Background] onCommand failed:', error);
    }
  })();
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
