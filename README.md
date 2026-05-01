# PerfLens — Web Performance Auditor

> Real-time performance monitoring, Lighthouse-like scoring, and actionable optimization suggestions right in your browser.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Features

### Real-Time Performance Scoring
- **0-100 performance score** calculated from Core Web Vitals, weighted similarly to Lighthouse
- **Color-coded badge** on the browser toolbar instantly shows page health (green/yellow/orange/red)
- **Auto-audit** on every page load — no manual action required

### Core Web Vitals Monitoring
- **LCP** (Largest Contentful Paint) — loading performance
- **FID** (First Input Delay) — interactivity
- **CLS** (Cumulative Layout Shift) — visual stability
- **INP** (Interaction to Next Paint) — responsiveness
- **FCP** (First Contentful Paint) — perceived load speed
- **TTFB** (Time to First Byte) — server response time

### Comprehensive Audits
- **Image Optimization** — detects oversized images, missing lazy loading, missing dimensions, uncompressed transfers
- **Script Analysis** — finds render-blocking scripts, large bundles, missing async/defer
- **CSS Audit** — identifies render-blocking stylesheets, unused CSS estimation, large files
- **Cache Policy** — checks for missing or weak caching headers on static assets
- **Compression Check** — flags uncompressed text resources that could use gzip/Brotli
- **Accessibility Basics** — missing alt text, lang attribute, viewport meta, heading hierarchy, unlabeled forms

### Phase 1 URL Audit Engine
- Analyze any public `http` or `https` URL from the CLI, REST API, or extension popup
- Score **Performance**, **SEO**, **Accessibility**, **Security**, and **Carbon footprint** from 0-100
- Generate one unified desktop + mobile JSON report with prioritized issues
- Capture full-page screenshots and page-load videos for desktop and mobile runs
- Store report artifacts under `audit-results/<host>-<timestamp>/`

### Actionable Suggestions
- Prioritized by **estimated impact** (high / medium / low)
- Includes **implementation effort** estimate (high / medium / low)
- Includes **suggestion confidence** (high / medium / low) based on evidence quality
- Quick wins section for easy fixes
- Resource-specific recommendations with affected URLs

### Root Cause Story
- Auto-generated summary that explains likely bottlenecks behind the current score
- Highlights top issue categories to focus first for fastest gains

### Framework + Environment Detection
- Detects popular frameworks/libraries with confidence scoring (React, Vue, Angular, Svelte, Next.js, Nuxt, Gatsby, Remix, Astro, Solid, Qwik, Preact, Ember, Backbone, jQuery, Vanilla fallback)
- Shows detected framework badges in the popup header
- Always displays build status (`Prod build`, `Dev build`, `Build unknown`)
- Warns when auditing a dev/unknown environment and recommends running a production build for accurate results

### Historical Tracking
- **Performance over time** — SVG line chart showing score history
- **Trend analysis** — improving / declining / stable indicators
- **Per-URL history** — track each page individually
- **Export to JSON** for offline analysis

### Resource Breakdown
- Visual treemap of resource sizes by type
- Bar chart with percentage breakdown
- Largest resources list with load times
- Render-blocking resource identification

---

## Product Roadmap (Prioritized)

### MVP (Now)
- Root Cause Story — **Impact: High / Effort: Low** (implemented)
- Suggestion confidence scoring — **Impact: High / Effort: Medium** (implemented)
- Suggestion effort tagging — **Impact: Medium / Effort: Low** (implemented)
- Smarter quick-win ranking (impact + effort + confidence) — **Impact: Medium / Effort: Low**

### V2 (Next)
- Framework-aware deep rules (React/Next/Vue-specific anti-patterns) — **Impact: High / Effort: Medium**
- Third-party script ROI analyzer — **Impact: High / Effort: Medium-High**
- Performance regression guard with baseline snapshots — **Impact: High / Effort: High**
- What-if simulator for projected wins — **Impact: Medium-High / Effort: Medium**

### Advanced
- One-click patch preview for framework-specific fixes — **Impact: High / Effort: High**
- User journey performance maps across multi-step flows — **Impact: High / Effort: High**
- Energy/battery impact insights for CPU-heavy pages — **Impact: Medium-High / Effort: High**
- Competitive benchmark mode against selected sites — **Impact: Medium / Effort: High**

---

## Screenshots

> *Coming soon — screenshots of the popup, audit results, and options page.*

---

## Installation

### From Source (Development)

1. **Clone the repository**
   ```bash
   git clone 
   cd perflens
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `dist/` folder

5. **Development mode** (with file watching)
   ```bash
   npm run dev
   ```


### Platform Audit Mode (CLI/API/CI)

PerfLens now includes a platform-oriented audit stack in addition to the browser extension:

```bash
# Run a unified audit (desktop + mobile) with screenshots/video + JSON report
npm run audit -- https://example.com

# Start REST API
npm run audit:api
```

API request:

```bash
curl -X POST http://localhost:8787/api/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Output includes aggregate scores, desktop/mobile reports, artifact paths for screenshots and videos, and the top prioritized issues.

GitHub Actions CI support is available in `.github/workflows/audit.yml`.

---

## How It Works

PerfLens uses a multi-layer architecture:

1. **Content Script** — Injected into every page, collects performance data using the native [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API), `PerformanceObserver` for Web Vitals, and DOM inspection for audit checks. It also performs framework and runtime/build-status heuristics.

2. **Background Service Worker** — Orchestrates data collection, runs audit logic, manages Chrome badge updates, and persists results to `chrome.storage.local`.

3. **Popup UI** — React application providing an at-a-glance performance dashboard with tabs for overview, detailed audits, resource analysis, and historical trends. In phase 1 it can also call the local platform audit API for a full desktop + mobile URL audit.

4. **Options Page** — Configure monitoring behavior, thresholds, and data management.

5. **Platform Audit Engine** — Playwright-powered Node audit runner that loads a URL in desktop and mobile contexts, captures screenshots and videos, estimates transfer-based carbon impact, and emits a unified JSON report.

All metrics are collected from browser-native APIs with **zero external network requests** — your data stays local.

---

## Metrics Explained

| Metric | What It Measures | Good | Needs Work | Poor |
|--------|-----------------|------|------------|------|
| **LCP** | Time until the largest content element is visible | ≤ 2.5s | ≤ 4.0s | > 4.0s |
| **FID** | Delay between first user interaction and browser response | ≤ 100ms | ≤ 300ms | > 300ms |
| **CLS** | Total unexpected layout movement during page life | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| **INP** | Worst interaction latency during the page visit | ≤ 200ms | ≤ 500ms | > 500ms |
| **FCP** | Time until first content is painted on screen | ≤ 1.8s | ≤ 3.0s | > 3.0s |
| **TTFB** | Time from request to first byte of response | ≤ 800ms | ≤ 1800ms | > 1800ms |

Thresholds follow [Google's Web Vitals guidelines](https://web.dev/vitals/).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI Framework** | React 18 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 3 |
| **Build Tool** | Vite 6 |
| **Extension API** | Chrome Manifest V3 |
| **Charts** | Pure SVG (no dependencies) |
| **Storage** | chrome.storage.local |

---

## Project Structure

```
perflens/
├── public/
│   ├── manifest.json          # Chrome extension manifest
│   ├── popup.html             # Popup entry HTML
│   ├── options.html           # Options page entry HTML
│   └── icons/                 # Extension icons
├── src/
│   ├── background/
│   │   └── index.ts           # Service worker
│   ├── content/
│   │   ├── index.ts           # Content script
│   │   └── content.css        # Floating badge styles
│   ├── popup/
│   │   ├── App.tsx            # Popup React app
│   │   └── index.tsx          # Popup entry point
│   ├── options/
│   │   ├── App.tsx            # Options React app
│   │   └── index.tsx          # Options entry point
│   ├── components/
│   │   ├── ScoreGauge.tsx     # Animated score circle
│   │   ├── MetricsGrid.tsx    # Web Vitals grid
│   │   ├── AuditResults.tsx   # Audit findings accordion
│   │   ├── SuggestionsPanel.tsx # Prioritized suggestions
│   │   ├── HistoryChart.tsx   # Performance history chart
│   │   └── ResourceBreakdown.tsx # Resource analysis
│   ├── utils/
│   │   ├── types.ts           # TypeScript type definitions
│   │   ├── metrics-collector.ts # Performance API data collection
│   │   ├── auditor.ts         # Audit engine
│   │   └── storage.ts         # Chrome storage wrapper
│   └── styles/
│       └── globals.css        # Tailwind + custom styles
├── scripts/
│   ├── audit-engine.mjs       # Desktop/mobile platform audit engine
│   ├── audit-cli.mjs          # CLI wrapper for URL audits
│   ├── audit-api.mjs          # Local REST API used by the popup Platform button
│   ├── audit-ci.mjs           # CI threshold runner
│   └── launch-phase1.mjs      # Builds, starts API, and launches Chromium with extension
├── audit-results/             # Generated reports, screenshots, and videos
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with clear commit messages
4. Run the build to verify: `npm run build`
5. Test the extension in Chrome
6. Submit a pull request

### Guidelines

- Follow existing TypeScript and code style conventions
- Keep the extension lightweight — avoid heavy dependencies
- Test across different types of websites
- Ensure accessibility in all UI components

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <strong>PerfLens</strong> — See your web performance clearly.
</p>
