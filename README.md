# Jobify

Chrome extension (Manifest V3) that auto-fills job application forms using a saved profile, learned field mappings, and cover letter templates.

## Development Setup

### Prerequisites

- **Node.js 20+**
- **Google Chrome 120+** (for loading and testing the unpacked extension)

### Install

```bash
npm install
```

### Dev

Start a watch build that rebuilds the extension on file changes:

```bash
npm run dev
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder in this project

After code changes, click **Reload** on the extension card in `chrome://extensions` (or remove and re-load unpacked if needed).

### Test

```bash
npm test
```

For interactive test runs:

```bash
npm run test:watch
```

### Build

Production build (outputs to `dist/`):

```bash
npm run build
```

Type-check without emitting files:

```bash
npm run type-check
```
