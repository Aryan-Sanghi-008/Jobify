import { chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppSettings, UserProfile } from '../../../src/shared/types';
import { E2E_DEFAULT_SETTINGS } from './test-profile';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist');
const FIXTURE_BASE_URL = 'http://localhost:4173';

export interface StorageSeed {
  profile?: UserProfile | null;
  coverLetters?: unknown[];
  applications?: unknown[];
  learnedFields?: Record<string, unknown>;
  settings?: Partial<AppSettings>;
}

export async function launchExtensionContext(): Promise<BrowserContext> {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Extension build not found at ${EXTENSION_PATH}. Run npm run build first.`,
    );
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobify-e2e-'));

  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
}

export async function getExtensionId(context: BrowserContext): Promise<string> {
  let serviceWorker = context.serviceWorkers()[0];

  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  }

  const match = serviceWorker.url().match(/chrome-extension:\/\/([^/]+)/);
  if (!match?.[1]) {
    throw new Error(`Could not parse extension id from ${serviceWorker.url()}`);
  }

  return match[1];
}

export async function getServiceWorker(context: BrowserContext) {
  const worker = context.serviceWorkers()[0];
  if (worker) {
    return worker;
  }

  return context.waitForEvent('serviceworker', { timeout: 15_000 });
}

async function waitForFreshInstallInit(
  worker: Awaited<ReturnType<typeof getServiceWorker>>,
): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const initialized = await worker.evaluate(async () => {
      const data = await chrome.storage.local.get(['settings']);
      return Boolean(data.settings);
    });

    if (initialized) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Extension storage did not initialize before seeding');
}

export async function seedExtensionStorage(
  context: BrowserContext,
  seed: StorageSeed = {},
): Promise<void> {
  const worker = await getServiceWorker(context);

  // Fresh Playwright profiles trigger chrome.runtime.onInstalled → initializeStorage(),
  // which resets storage. Seed only after that handler has finished.
  await waitForFreshInstallInit(worker);

  const payload = {
    profile: seed.profile ?? null,
    coverLetters: seed.coverLetters ?? [],
    applications: seed.applications ?? [],
    learnedFields: seed.learnedFields ?? {},
    defaultSettings: E2E_DEFAULT_SETTINGS,
    settings: seed.settings ?? {},
  };

  const expectedEmail = payload.profile?.personal?.email?.trim() ?? '';

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await worker.evaluate(async (data) => {
      await chrome.storage.local.set({
        profile: data.profile ?? null,
        coverLetters: data.coverLetters ?? [],
        applications: data.applications ?? [],
        learnedFields: data.learnedFields ?? {},
        settings: {
          ...data.defaultSettings,
          ...data.settings,
        },
        lastFillResult: null,
      });
    }, payload);

    const storedEmail = await worker.evaluate(async () => {
      const data = await chrome.storage.local.get(['profile']);
      const profile = data.profile as { personal?: { email?: string } } | null | undefined;
      return profile?.personal?.email?.trim() ?? '';
    });

    if (storedEmail === expectedEmail) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(
    `Failed to seed extension storage (expected profile email "${expectedEmail}")`,
  );
}

export async function openPopup(context: BrowserContext): Promise<Page> {
  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await popup.waitForLoadState('domcontentloaded');
  await waitForPopupReady(popup);
  return popup;
}

export async function waitForPopupReady(popup: Page): Promise<void> {
  await popup.getByRole('button', { name: 'Profile' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await popup.locator('#profile-email').waitFor({
    state: 'visible',
    timeout: 30_000,
  });
}

export async function openFixturePage(
  context: BrowserContext,
  fixturePath: string,
): Promise<Page> {
  const page = await context.newPage();
  const url = `${FIXTURE_BASE_URL}/${fixturePath.replace(/^\//, '')}`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

async function isContentScriptReady(
  context: BrowserContext,
  tabId: number,
): Promise<boolean> {
  const worker = await getServiceWorker(context);

  return worker.evaluate(async (id) => {
    try {
      const response = await chrome.tabs.sendMessage(id, { type: 'GET_PAGE_INFO' });
      // Any object response means the content-script listener is registered.
      // GET_PAGE_INFO may return { success: false, error } when session storage
      // is unavailable in the Playwright Chromium profile.
      return Boolean(response && typeof response === 'object');
    } catch {
      return false;
    }
  }, tabId);
}

export async function ensureContentScript(
  context: BrowserContext,
  tabId: number,
  timeoutMs = 20_000,
): Promise<void> {
  const worker = await getServiceWorker(context);

  if (await isContentScriptReady(context, tabId)) {
    return;
  }

  await worker.evaluate(async (id) => {
    const manifest = chrome.runtime.getManifest() as {
      content_scripts?: Array<{ js?: string[] }>;
    };
    const files = manifest.content_scripts?.[0]?.js ?? [];

    if (files.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId: id },
        files,
      });
    }
  }, tabId);

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isContentScriptReady(context, tabId)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Content script did not respond on tab ${tabId}`);
}

export async function sendTabMessage<T>(
  context: BrowserContext,
  tabId: number,
  message: unknown,
): Promise<T> {
  const worker = await getServiceWorker(context);

  return worker.evaluate(
    async ({ id, payload }) => {
      return chrome.tabs.sendMessage(id, payload);
    },
    { id: tabId, payload: message },
  ) as Promise<T>;
}

export async function triggerAutofill(
  context: BrowserContext,
  tabId: number,
): Promise<void> {
  await ensureContentScript(context, tabId);
  await sendTabMessage(context, tabId, { type: 'TRIGGER_AUTOFILL' });
}

export async function waitForInputValue(
  page: Page,
  selector: string,
  expected: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await page.locator(selector).inputValue();
    if (value === expected) {
      return;
    }

    await page.waitForTimeout(250);
  }

  const actual = await page.locator(selector).inputValue();
  throw new Error(
    `Expected ${selector} to equal "${expected}", got "${actual}" after ${timeoutMs}ms`,
  );
}

export async function getTabId(
  context: BrowserContext,
  targetPage: Page,
): Promise<number> {
  const worker = await getServiceWorker(context);

  const tabId = await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const normalized = url.replace(/\.html$/, '');
    const tab = tabs.find((entry) => {
      const entryUrl = entry.url ?? '';
      return entryUrl === url || entryUrl.replace(/\.html$/, '') === normalized;
    });
    return tab?.id ?? null;
  }, targetPage.url());

  if (tabId === null) {
    throw new Error(`Could not find tab id for ${targetPage.url()}`);
  }

  return tabId;
}

export async function closeExtensionContext(
  context: BrowserContext,
): Promise<void> {
  await context.close();
}
