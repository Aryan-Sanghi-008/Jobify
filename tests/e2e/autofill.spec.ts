import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  closeExtensionContext,
  getTabId,
  launchExtensionContext,
  openFixturePage,
  seedExtensionStorage,
  triggerAutofill,
  waitForInputValue,
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
      highlightUnknownFields: true,
    },
  });
  page = await openFixturePage(context, 'simple-form.html');
});

test.afterEach(async () => {
  await closeExtensionContext(context);
});

test('fills standard application fields from profile', async () => {
  const fixturePage = context.pages().find((p) => p.url().includes('simple-form.html')) ?? page;

  await triggerAutofill(context, await getTabId(context, fixturePage));

  await waitForInputValue(fixturePage, '#fullName', E2E_TEST_PROFILE.personal.fullName);
  await waitForInputValue(fixturePage, '#email', E2E_TEST_PROFILE.personal.email);
  await waitForInputValue(fixturePage, '#phone', E2E_TEST_PROFILE.personal.phone);
  await waitForInputValue(
    fixturePage,
    '#linkedin',
    E2E_TEST_PROFILE.personal.linkedinUrl,
  );
  await waitForInputValue(fixturePage, '#currentCtc', '12 LPA');
  await waitForInputValue(
    fixturePage,
    '#noticePeriod',
    String(E2E_TEST_PROFILE.professional.noticePeriod),
  );
});

test('highlights unknown fields in orange', async () => {
  const fixturePage = context.pages().find((p) => p.url().includes('simple-form.html')) ?? page;

  await triggerAutofill(context, await getTabId(context, fixturePage));

  await waitForInputValue(fixturePage, '#email', E2E_TEST_PROFILE.personal.email);

  const inlineStyle = await fixturePage
    .locator('#favoriteColor')
    .evaluate((element) => element.style.cssText);

  expect(inlineStyle).toContain('outline');
  expect(inlineStyle).toMatch(/f97316|rgb\(249,\s*115,\s*22\)/i);
});
