import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  closeExtensionContext,
  getTabId,
  launchExtensionContext,
  openFixturePage,
  seedExtensionStorage,
  triggerAutofill,
} from './helpers/extension';
import { E2E_TEST_PROFILE } from './helpers/test-profile';

let context: BrowserContext;
let page: Page;

test.beforeEach(async () => {
  context = await launchExtensionContext();
  await seedExtensionStorage(context, {
    profile: E2E_TEST_PROFILE,
    settings: {
      pauseBeforeSubmit: false,
      highlightUnknownFields: false,
    },
  });
  page = await openFixturePage(context, 'multipage/page1.html');
});

test.afterEach(async () => {
  await closeExtensionContext(context);
});

test('navigates and fills all three application pages', async () => {
  test.setTimeout(90_000);
  const fixturePage = context.pages().find((p) => p.url().includes('page1')) ?? page;
  const tabId = await getTabId(context, fixturePage);

  await triggerAutofill(context, tabId);
  await fixturePage.waitForURL(/page2/, { timeout: 30_000 });

  // SPA pushState keeps the same document; re-trigger fills the next visible step.
  await triggerAutofill(context, tabId);
  await fixturePage.waitForURL(/page3/, { timeout: 30_000 });

  await expect(
    fixturePage.getByRole('heading', { name: 'Review your application' }),
  ).toBeVisible();
  await expect(fixturePage.locator('#confirmation')).toContainText('review your details');
});
