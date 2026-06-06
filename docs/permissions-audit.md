# Permission Audit — Jobify

Reference for Chrome Web Store review. `manifest.json` is strict JSON and cannot contain comments; this document explains every declared permission.

## Extension permissions

### `storage`

**Why:** Persist the user profile, application tracker, cover letter templates, learned field mappings, settings, and selector health data.

**Used in:** `src/shared/storage.ts`, `src/shared/backup.ts`, `src/shared/selectorHealth.ts`, content script settings sync.

### `activeTab`

**Why:** Grant temporary access to the active tab when the user invokes the extension (popup click, keyboard shortcut, or context menu). Works with user-gesture flows without requiring the user to grant per-site access at install time.

**Used in:** Implicit with popup autofill, `chrome.commands`, and context menu handlers.

### `scripting`

**Why:** Inject the content script when `chrome.tabs.sendMessage` fails because the script has not yet loaded on the page.

**Used in:** `src/background/index.ts` (autofill fallback), `src/popup/hooks/useExtension.ts` (popup-triggered inject).

### `tabs`

**Why:** Query the active tab, send messages to content scripts, open job URLs from the tracker, set portal badges, and listen for tab updates.

**Used in:** `src/background/index.ts`, `src/popup/hooks/useExtension.ts`, `src/popup/pages/Tracker.tsx`, `src/shared/logger.ts`.

### `notifications`

**Why:** Show a brief system notification when an application is logged automatically or manually.

**Used in:** `src/background/index.ts` (`showApplicationLoggedNotification`, shortcut feedback).

### `contextMenus`

**Why:** Right-click actions: auto-fill page, log application, use selection as company name.

**Used in:** `src/background/index.ts` (`setupContextMenus`, `chrome.contextMenus.onClicked`).

## Host permissions

### `https://*/*`

**Why:** Job application forms run on many HTTPS career sites (LinkedIn, Naukri, Wellfound, Instahyre, Greenhouse, Lever, Workday, and others). The extension must read form fields and fill them on whichever site the user visits.

### `http://*/*`

**Why:** A small number of application forms still use HTTP. Also used by local E2E test fixtures (`http://localhost:4173`). Consider removing before a narrow-permission store submission if HTTP support is not required.

## Content scripts

### `matches: ["<all_urls>"]`

**Why:** Generic autofill must work on any page with an application form, not only a fixed list of domains. Portal-specific logic (LinkedIn, Naukri, etc.) runs inside the content script after detecting the site.

## Permissions removed

**None.** Every declared permission is used by shipping features. Removing `notifications` or `contextMenus` would require removing those features.

## Related files

- Source manifest: [`manifest.json`](../manifest.json)
- Store listing copy: [`store-listing.md`](./store-listing.md)
