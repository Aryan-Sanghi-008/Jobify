# Changelog

All notable changes to Jobify are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-06-06

### Added

- Profile management with personal, professional, education, experience, and skills sections
- Weighted profile completion ring (0–100 score) with visual progress indicator
- Resume PDF import to auto-populate profile fields
- One-click autofill for job application forms from saved profile
- Portal-specific adapters: LinkedIn, Naukri, Wellfound, Instahyre, Greenhouse, Lever, Workday
- Generic form autofill with label matching and fuzzy field detection
- Learned field mappings persisted per site for custom form labels
- Multipage form state machine with auto-navigation and pause-before-submit option
- Orange highlight for unknown fields requiring manual input
- Cover letter templates with `{{company_name}}`, `{{job_title}}`, and `{{your_name}}` placeholders
- Application tracker with status, notes, filters, and open-job-url action
- CSV export for application history
- Four-step first-run onboarding flow
- Keyboard shortcuts: Alt+Shift+F (autofill), Alt+Shift+T (open tracker)
- Context menu actions: auto-fill page, log application, use selection as company name
- JSON backup and restore with merge or replace modes
- Settings: theme (system/light/dark), pause before submit, highlight unknown fields, debug mode
- Inline privacy policy and MIT license note in Settings About section
- Portal badge on extension icon (e.g. LI, NK, WF) when a supported job site is detected
- Application-logged desktop notifications
- Chrome Web Store compliance docs (`docs/store-listing.md`, `docs/permissions-audit.md`)
- Vitest unit test suite (177 tests)
- Playwright E2E tests against local HTML fixtures (popup, autofill, multipage flows)

### Changed

- Popup UX polish: always-visible autofill button with five states, 600px scroll layout, keyboard accessibility
- PDF.js worker uses stable `chrome.runtime.getURL` path for production builds

### Fixed

- Background content-script readiness check now uses `GET_PAGE_INFO` instead of invalid `PING` to tab (avoids redundant re-injection on every shortcut/context-menu autofill)
- Vitest no longer loads Playwright E2E spec files during `npm test`
