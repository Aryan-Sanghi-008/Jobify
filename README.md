# Jobify

Jobify is a Chrome extension that auto-fills job application forms from your saved profile, cover letter templates, and learned field mappings. All data stays on your device — no accounts, no servers, no telemetry.

## Supported portals

| Portal | Status | Notes |
| ------ | ------ | ----- |
| LinkedIn | Partial | Easy Apply modal selectors, multipage navigation, job context extraction |
| Naukri | Partial | Apply flow helpers, CTC fields, cover note, resume selection |
| Wellfound | Partial | “Why interested” field, portal-tuned selectors |
| Instahyre | Partial | Cover message field, portal-tuned selectors |
| Greenhouse | Full | Dedicated ATS adapter, resume/cover letter overrides, custom fields |
| Lever | Full | Dedicated ATS adapter, known field overrides |
| Workday | Full | Dedicated ATS adapter, multipage wizard (My Information, Experience, Questions) |
| Any other site | Generic | Label matching, learned fields, and community mappings on standard form fields |

**Status key:** **Full** = dedicated portal/ATS module with tailored field handling. **Partial** = portal-specific selectors and helpers plus generic autofill. **Generic** = standard scanner and matcher only.

## Installation

### Chrome Web Store

> **Coming soon:** [Jobify on the Chrome Web Store](https://chrome.google.com/webstore) *(link placeholder — update before launch)*

### From source

**Requirements:** Node.js 20+, Google Chrome 120+

```bash
git clone https://github.com/your-org/jobify.git
cd jobify
npm install
npm run build
```

Load the unpacked extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

After code changes, run `npm run build` again and click **Reload** on the extension card.

### Production build size

A production build (`npm run build`) produces a `dist/` folder of approximately **2.5 MB** (under the 5 MB target). The largest asset is `pdf.worker.min.mjs` (~1.3 MB) for resume PDF parsing in the Profile tab. The worker is bundled from `public/pdf.worker.min.mjs`, declared in `manifest.json` under `web_accessible_resources`, and loaded via `chrome.runtime.getURL('pdf.worker.min.mjs')` in `src/popup/utils/resumeParser.ts`.

## How to use

1. **Complete onboarding** — Open the Jobify popup and follow the setup wizard.
2. **Fill your profile** — Go to the **Profile** tab and add at least your email (required). Upload a resume PDF to auto-extract details, or enter fields manually.
   <!-- screenshot: Profile tab with email and resume upload -->
3. **Create a cover letter template** (optional) — Open **Letters**, create a template with placeholders like `{{company_name}}`.
   <!-- screenshot: Cover Letters tab with template editor -->
4. **Navigate to a job application** — Open any job listing or application form in Chrome.
5. **Auto-fill** — Click **Auto-fill this page** in the popup, press **Alt+Shift+F**, or right-click and choose **Auto-fill page**.
   <!-- screenshot: Popup autofill button on a job form -->
6. **Handle unknown fields** — Orange-highlighted fields need your input. Enter values in the popup, optionally save them as learned mappings, then click **Fill all above + continue**.
7. **Log applications** — Applications are logged automatically on success, or manually via the context menu / tracker. Review them in **Tracker**.
8. **Discover jobs** (optional) — Set a desired role in **Settings → Job Preferences**, then browse matching listings in **Discover**.

### Keyboard shortcuts

| Shortcut | Action |
| -------- | ------ |
| Alt+Shift+F | Auto-fill current page |
| Alt+Shift+T | Open application tracker |

Customize shortcuts at `chrome://extensions/shortcuts`.

## Profile setup guide

Your profile powers all autofill. Minimum requirement: **email** in Profile → Personal.

Recommended sections:

- **Personal** — Name, phone, LinkedIn, location, work authorization
- **Professional** — Current role, years of experience, notice period, current/expected CTC (India)
- **Education & experience** — First entries are used for matching; add more in the profile editor
- **Skills** — Used in cover letter `{{top_skills}}` and matching
- **Resume** — Upload a PDF (max 5 MB); parsing runs locally via PDF.js

Use **Settings → Export my data** to back up your profile and applications as JSON.

## Cover letter templates

Create reusable templates in the **Letters** tab. When a cover letter field is detected during autofill, Jobify inserts the selected template (or an AI-generated letter if configured in Settings).

### Variable reference

| Variable | Source | Example |
| -------- | ------ | ------- |
| `{{company_name}}` | Page context / job listing | Acme Corp |
| `{{job_title}}` | Page context / job listing | Software Engineer |
| `{{your_name}}` | Profile → full name | Jane Doe |
| `{{your_email}}` | Profile → email | jane@example.com |
| `{{your_phone}}` | Profile → phone | +91 98765 43210 |
| `{{current_role}}` | Profile → current title | Senior Developer |
| `{{years_exp}}` | Profile → total years | 5 |
| `{{top_skills}}` | Profile → first 3 skills | React, TypeScript, Node.js |
| `{{notice_period}}` | Profile → notice period | 30 days |
| `{{linkedin}}` | Profile → LinkedIn URL | https://linkedin.com/in/jane |
| `{{today_date}}` | Generated at fill time | June 5, 2026 |

Variables are case-insensitive. Missing values appear as `[VARIABLE_NAME]` in preview so you can spot gaps before applying.

**AI cover letters (optional):** Add an Anthropic or OpenAI API key in **Settings → AI Integration**. Generation runs directly against your provider; keys are stored locally only.

## FAQ

### Is my data safe?

Yes. Jobify stores your profile, applications, cover letters, learned fields, and settings in **Chrome local storage on your device only**. There is no Jobify backend, no accounts, and no built-in analytics. Optional features (AI cover letters, Discover job feeds, community field mappings) call third-party APIs only when you configure them.

### Does it work on company websites?

Yes. Jobify runs on any page with form fields (`<all_urls>` content script). Dedicated adapters improve coverage on LinkedIn, Naukri, Wellfound, Instahyre, Greenhouse, Lever, and Workday. Other career sites use generic label matching, learned fields, and community mappings.

### Can it submit applications automatically?

**No.** Jobify fills form fields but does **not** click Submit or Apply for you (unless you have **Pause before submit** disabled and explicitly continue through multipage flows yourself). Review every application before submitting.

### What if a field isn't filled?

Unknown fields are highlighted in **orange**. Enter the value in the popup, optionally teach the extension the mapping (**Save to profile** / learned field), and use **Fill this field** or **Fill all above + continue**. Enable **Debug mode** in Settings and copy a diagnostic report when filing bugs.

## Development

```bash
npm install          # Install dependencies
npm run dev          # Watch build → dist/
npm test             # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright + Chromium)
npm run type-check   # TypeScript
npm run build        # Production build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for portal modules, field mappings, and PR guidelines.

### Chrome Web Store compliance

- [docs/store-listing.md](docs/store-listing.md) — Listing copy
- [docs/permissions-audit.md](docs/permissions-audit.md) — Permission justifications

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for how to add portals, field labels, and tests.

## Release v0.1.0

When ready to tag the first release:

```bash
git add -A
git commit -m "Prepare v0.1.0 release"
git tag -a v0.1.0 -m "Jobify v0.1.0 — initial public release"
git push origin main
git push origin v0.1.0
```

Create a GitHub Release from the `v0.1.0` tag and attach the `dist/` zip (or publish to the Chrome Web Store from the same build).

## License

MIT — see [LICENSE](LICENSE).
