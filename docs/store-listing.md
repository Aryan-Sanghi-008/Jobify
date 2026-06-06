# Chrome Web Store Listing (Reference)

Copy these into the Chrome Web Store Developer Dashboard when submitting Jobify.

## Short description (132 characters max)

```
Auto-fill job applications on LinkedIn, Naukri, Wellfound, Instahyre and more. Save hours. Your data stays on your device.
```

(131 characters)

## Detailed description

**Jobify** is a Chrome extension that auto-fills job application forms using your saved profile, reusable cover letter templates, and an application tracker. Spend less time on repetitive data entry and more time applying to roles that matter.

### Supported sites

- **Job boards:** LinkedIn, Naukri, Wellfound, Instahyre
- **ATS platforms:** Greenhouse, Lever, Workday
- **Generic forms:** Any site with standard application fields

### Features

- **One-click autofill** — Fill name, email, phone, CTC, notice period, LinkedIn, and more from your profile
- **Cover letter templates** — Reusable templates with `{{company_name}}`, `{{job_title}}`, and `{{your_name}}` placeholders
- **Application tracker** — Log companies, roles, portals, and status locally
- **Learned fields** — Teach the extension custom field mappings it remembers per site
- **Multipage forms** — Navigates multi-step applications automatically
- **Backup and restore** — Export and import your data as JSON; export applications as CSV
- **Keyboard shortcuts** — Alt+Shift+F to autofill, Alt+Shift+T to open the tracker
- **Context menu** — Right-click to autofill, log an application, or use selected text as company name

### Privacy

All your data is stored **locally on your device** using Chrome's storage API. Jobify has **no servers**, **no accounts**, and **no analytics**. Nothing is sent to any external service.

For permission justifications, see [permissions-audit.md](./permissions-audit.md).

### Open source

Source code: https://github.com/your-org/jobify

Replace the URL above with your real repository before publishing.

## Privacy practices (dashboard answers)

| Question | Answer |
| -------- | ------ |
| Does the extension collect user data? | **No.** Profile, applications, cover letters, and settings are stored only in `chrome.storage.local` on the user's device. |
| Does the extension use remote code? | **No.** All JavaScript is bundled in the extension package. No `eval()`, no remotely hosted scripts. |
| Does the extension use a server? | **No.** There is no backend, telemetry, or third-party API for user data. |

## Homepage and support URLs (placeholders)

| Field | URL |
| ----- | --- |
| Homepage | https://github.com/your-org/jobify |
| Support / issues | https://github.com/your-org/jobify/issues |

## Store icon

Upload `store/icons/icon128.png` (128×128 PNG) in the developer dashboard. Extension runtime icons remain SVG in `public/icons/`.
