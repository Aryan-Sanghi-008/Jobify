import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  closeExtensionContext,
  launchExtensionContext,
  openPopup,
  seedExtensionStorage,
  waitForPopupReady,
} from './helpers/extension';
import { E2E_TEST_PROFILE } from './helpers/test-profile';

const STARTER_COVER_LETTER = `Dear Hiring Team at {{company_name}},

I'm excited to apply for the {{job_title}} position. With my background and passion for building great products, I believe I would be a strong fit for your team.

Thank you for your consideration.

Sincerely,
{{your_name}}`;

let context: BrowserContext;
let popup: Page;

test.beforeEach(async () => {
  context = await launchExtensionContext();
  await seedExtensionStorage(context, {
    settings: { onboardingComplete: true },
  });
  popup = await openPopup(context);
});

test.afterEach(async () => {
  await closeExtensionContext(context);
});

test('shows all five navigation tabs', async () => {
  await expect(popup.getByRole('button', { name: 'Profile' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Letters' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Tracker' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Discover' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('fills profile fields and persists after reload', async () => {
  await popup.locator('#profile-email').fill('e2e@test.com');
  await popup.locator('#profile-full-name').fill('E2E User');
  await popup.locator('#profile-phone').fill('+91 99999 00000');
  await popup.locator('#profile-phone').blur();

  await expect(popup.getByText('Saved').first()).toBeVisible();

  await popup.reload();
  await popup.waitForLoadState('domcontentloaded');
  await popup.locator('#profile-email').waitFor({ state: 'visible' });

  await expect(popup.locator('#profile-email')).toHaveValue('e2e@test.com');
  await expect(popup.locator('#profile-full-name')).toHaveValue('E2E User');
  await expect(popup.locator('#profile-phone')).toHaveValue('+91 99999 00000');
});

test('creates a cover letter template', async () => {
  await seedExtensionStorage(context, {
    profile: E2E_TEST_PROFILE,
  });
  await popup.reload();
  await popup.waitForLoadState('domcontentloaded');
  await waitForPopupReady(popup);

  await popup.getByRole('button', { name: 'Letters' }).click();
  await popup
    .getByRole('button', { name: 'Create your first template' })
    .click();

  await popup.getByPlaceholder('Frontend roles').fill('E2E Default');
  await popup.locator('textarea').first().fill(STARTER_COVER_LETTER);
  await popup.getByRole('button', { name: 'Save Template' }).click();

  await expect(popup.getByText('Saved').first()).toBeVisible();
  await expect(popup.getByText('E2E Default')).toBeVisible();
});

test('shows empty state on application tracker', async () => {
  await seedExtensionStorage(context, {
    profile: E2E_TEST_PROFILE,
    applications: [],
  });
  await popup.reload();
  await popup.waitForLoadState('domcontentloaded');
  await waitForPopupReady(popup);

  await popup.getByRole('button', { name: 'Tracker' }).click();

  await expect(popup.getByText(/No applications yet/)).toBeVisible();
});
