# AI Agent Prompt: PerfLens Landing Page

You are a senior product designer and frontend engineer creating a polished marketing landing page for **PerfLens - Web Performance Auditor**, a Chrome extension and platform audit workflow for developers preparing real web products for launch.

Build a beautiful, credible, modern landing page that communicates the full product context, not a shallow hero page. The landing page should feel like a serious developer tool: clean, sharp, trustworthy, visually rich, and designed for scanning. Avoid generic SaaS fluff. Use strong product UI mockups, audit cards, charts, score indicators, evidence artifacts, and browser-extension visual cues.

## Product Positioning

PerfLens helps developers inspect web performance while they are actually browsing and testing a product. It combines:

- Live Core Web Vitals monitoring
- A 0-100 Lighthouse-style performance score
- Browser badge health signals
- Resource breakdowns
- Accessibility and quality checks
- Framework and build-environment detection
- Per-URL performance history
- Root cause summaries
- Fix-first optimization suggestions
- Desktop and mobile launch evidence packs
- Screenshots, videos, category scores, prioritized issues, and JSON reports
- Local-first metric collection using browser APIs and `chrome.storage.local`

## Why PerfLens Is Better Than Lighthouse For Product Work

Be respectful to Lighthouse: it is excellent for standardized audits and baseline scoring. The marketing message should be that PerfLens is better for day-to-day product debugging, launch readiness, and turning findings into action.

Highlight these advantages:

- PerfLens works in live browser context instead of only as a separate one-time report.
- PerfLens can monitor pages as you browse and develop.
- PerfLens keeps per-URL history so teams can spot regressions over time.
- PerfLens adds framework and build-mode detection, helping teams avoid misleading audits from development builds.
- PerfLens prioritizes recommendations by impact, effort, and confidence.
- PerfLens gives root cause stories that explain what is probably hurting the page most.
- PerfLens produces launch evidence packs with screenshots, videos, JSON, category scores, resource data, prioritized issues, and readiness status.
- PerfLens is more actionable for founders, client projects, portfolios, and product teams preparing a release.

## Page Structure

Create these sections:

1. Hero section with the headline: **PerfLens sees what slows real product launches.**
2. Product UI mockup showing a performance score, Web Vitals, and prioritized findings.
3. Feature grid covering Web Vitals, resource breakdown, launch readiness, history, root cause story, and fix-first suggestions.
4. Workflow section: browse the product, read the signals, collect evidence, fix what matters.
5. Comparison section: Lighthouse baseline vs PerfLens action workflow.
6. Evidence section showing screenshots, videos, JSON reports, launch readiness, and desktop/mobile audit outputs.
7. Final CTA linking to the GitHub repo.

## Visual Direction

- Use a light, premium developer-tool interface.
- Use restrained color: white, near-black text, cool blue, cyan, green, amber, and subtle gray surfaces.
- Use crisp cards with border radius no larger than 8px.
- Use real interface-like graphics instead of abstract decoration.
- Use icons in CTAs and feature cards.
- Make the hero feel immersive and product-specific.
- Make all mobile layouts readable with no overlapping text.
- Do not use a generic gradient-only hero.
- Do not create a landing page that only talks about features without showing product context.

## Copy Tone

Confident, practical, and product-aware. The copy should sound like it was written by someone who understands frontend performance work. Avoid vague lines like "unlock insights" unless tied to specific evidence or workflow.

## Technical Requirements

- Build a responsive page.
- Keep accessibility basics: semantic sections, usable contrast, descriptive labels.
- Make the first viewport clearly show the PerfLens product and the value proposition.
- Include enough feature context that someone landing on the page understands what PerfLens does and why it exists.
