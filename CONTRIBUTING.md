# Contributing to Jobify

Thank you for helping improve Jobify. This guide covers adding portal support, field label mappings, testing expectations, and code style.

## Development setup

```bash
git clone https://github.com/your-org/jobify.git
cd jobify
npm install
npm run dev
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode).

## How to add a new portal module

Portal adapters live under `src/content/portals/` (job boards) or `src/content/ats/` (ATS platforms). Each module exposes a class with `isApplicable()` and a fill handler.

### Step-by-step

1. **Add URL patterns** in [`src/shared/constants.ts`](src/shared/constants.ts) under `PORTAL_URLS` and, if needed, `ATS_SELECTORS`.

2. **Register selectors** in [`src/shared/selectorRegistry.ts`](src/shared/selectorRegistry.ts) — apply button, form container, next/submit buttons, job title, company name, cover letter field.

3. **Create the portal file** — e.g. `src/content/portals/acme.ts`:

```ts
import { fillFields } from '@/content/filler';
import { matchFields } from '@/content/matcher';
import { scanPageFields } from '@/content/scanner';
import { PORTAL_URLS } from '@/shared/constants';
import { flattenProfile, getAutofillData } from '@/shared/storage';
import type { AppSettings, FillResult, UserProfile } from '@/shared/types';

function emptyFillResult(errors: string[] = []): FillResult {
  return { filled: 0, skipped: 0, unknown: [], errors };
}

export class AcmePortal {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.acme.some((pattern) => href.includes(pattern));
  }

  async handleApplication(
    profile: UserProfile,
    settings: AppSettings,
  ): Promise<FillResult> {
    const formRoot = document.querySelector('form#application');
    if (!(formRoot instanceof HTMLElement)) {
      return emptyFillResult(['Acme application form not found']);
    }

    const { learnedFields, communityFields } = await getAutofillData();
    const flatProfile = flattenProfile(profile);
    const fields = scanPageFields(formRoot);
    const matchedFields = matchFields(
      fields,
      profile,
      learnedFields,
      communityFields,
      'acme', // add to PortalName in types.ts first
    );

    return fillFields(matchedFields, flatProfile, settings);
  }
}
```

4. **Extend types** — Add `'acme'` to `PortalName` in [`src/shared/types.ts`](src/shared/types.ts) and label it in [`src/shared/portalLabels.ts`](src/shared/portalLabels.ts).

5. **Wire detection** — `detectPortal()` in [`src/shared/utils.ts`](src/shared/utils.ts) maps URLs to portal names (used for badges, analytics, and community field filtering).

6. **Add tests** — Portal-specific unit tests with jsdom fixtures where possible; E2E fixture HTML under `tests/fixtures/` if the flow is testable headlessly.

7. **Update docs** — Add the portal to the README supported-portals table.

Use existing modules as references:

- Job board: [`src/content/portals/naukri.ts`](src/content/portals/naukri.ts)
- ATS: [`src/content/ats/greenhouse.ts`](src/content/ats/greenhouse.ts)
- Multipage wizard: [`src/content/ats/workday.ts`](src/content/ats/workday.ts)

## How to add field label mappings

Built-in label → profile key mappings live in `FIELD_LABEL_MAP` in [`src/shared/constants.ts`](src/shared/constants.ts).

```ts
// Example: add variants for a profile key
expectedCTC: [
  'expected ctc',
  'expected salary',
  'salary expectation',
  'desired compensation', // add new variants here
],
```

Rules:

- Keys must match [`FlatProfile`](src/shared/types.ts) fields (or special matcher keys like `resumeFile`).
- Labels are normalized to lowercase before matching (`normalizeLabel()`).
- Prefer several short, common variants over one long phrase.
- Add a unit test in [`src/content/matcher.test.ts`](src/content/matcher.test.ts) if the label is non-obvious.

For site-specific mappings shared across users, contribute via **Settings → Community mappings** (GitHub issue workflow) rather than hardcoding one-off company forms.

## Testing requirements for PRs

Before opening a PR, run:

```bash
npm run type-check
npm test
npm run build
```

If your change touches popup flows, storage, or autofill:

```bash
npm run test:e2e
```

(E2E requires Chromium: `npx playwright install chromium`.)

**Expectations:**

- New pure logic → unit tests in `src/**/*.test.ts`
- Matcher / label changes → extend `matcher.test.ts`
- Storage schema changes → migration in `src/background/index.ts` `runMigration()` + `storage.test.ts`
- No decrease in existing test pass rate
- Manual smoke test on at least one affected portal in Chrome (load unpacked from `dist/`)

## Code style guide

- **TypeScript** — Strict types; avoid `any`. Prefer existing types from `src/shared/types.ts`.
- **Imports** — Use `@/` path alias (`@/shared/storage`, `@/content/matcher`).
- **React** — Functional components, hooks; lazy-load heavy popup tabs.
- **Storage** — All persistence through `src/shared/storage.ts`; sanitize via `src/shared/security.ts`.
- **Logging** — Use `Logger` from `src/shared/logger.ts`; never log emails, phone, CTC, or cover letter bodies.
- **Scope** — Smallest correct diff; match surrounding naming and patterns.
- **Comments** — Only for non-obvious business logic; code should be self-explanatory.
- **Manifest** — JSON has no comments; document permission changes in `docs/permissions-audit.md`.

## Reporting issues

Use the GitHub issue templates:

- **Bug report** — Include extension version, Chrome version, portal, and a diagnostic report from Settings → Developer → Copy diagnostic report.
- **Feature request** — Portal requests, field mapping requests, or new features.

## Questions

Open a [GitHub Discussion](https://github.com/your-org/jobify/discussions) or issue if anything is unclear.
