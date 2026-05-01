import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "audit-results");

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromIssueCounts(high, medium, low) {
  return clampScore(100 - high * 25 - medium * 12 - low * 5);
}

function carbonEstimate(transferBytes) {
  const transferMb = transferBytes / (1024 * 1024);
  const gramsCo2 = transferMb * 0.7;
  const carbonScore = clampScore(100 - gramsCo2 * 12);
  return { gramsCo2, carbonScore };
}

function sanitizeArtifactName(value) {
  return value.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").toLowerCase();
}

function makeFix(issue) {
  if (issue.ruleId === "image-lazy-load") {
    return {
      language: "html",
      framework: "agnostic",
      before: '<img src="/hero.jpg" alt="Product hero">',
      after:
        '<img src="/hero.webp" alt="Product hero" width="1200" height="630" loading="lazy" decoding="async" srcset="/hero-640.webp 640w, /hero-1200.webp 1200w" sizes="(max-width: 768px) 100vw, 1200px">',
    };
  }

  if (issue.ruleId === "missing-meta-description") {
    return {
      language: "html",
      framework: "nextjs",
      before: "<Head>{/* missing description */}</Head>",
      after:
        '<Head><meta name="description" content="Concise page summary targeting primary search intent." /></Head>',
    };
  }

  if (issue.ruleId === "render-blocking-script") {
    return {
      language: "html",
      framework: "react",
      before: '<script src="/bundle.js"></script>',
      after: '<script src="/bundle.js" defer></script>',
    };
  }

  return {
    language: "javascript",
    framework: "agnostic",
    before: "// TODO: current implementation",
    after: `// Suggested fix for ${issue.ruleId}\n// ${issue.description}`,
  };
}

async function runModeAudit({ page, url, mode, outputDir }) {
  const issues = [];
  const responses = [];
  let totalTransferSize = 0;

  page.on("response", async (response) => {
    try {
      const headers = response.headers();
      const contentLength = Number(headers["content-length"] || 0);
      totalTransferSize += Number.isFinite(contentLength) ? contentLength : 0;
      responses.push({
        url: response.url(),
        status: response.status(),
        contentType: headers["content-type"] || "",
        contentLength,
      });
    } catch {
      // Ignore non-critical response parsing errors.
    }
  });

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);

  const screenshotPath = path.join(outputDir, `${mode}-screenshot.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const evalData = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const timing = nav
      ? {
          ttfb: nav.responseStart - nav.requestStart,
          fcpApprox: nav.responseEnd - nav.startTime,
          domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
          loadEvent: nav.loadEventEnd - nav.startTime,
        }
      : null;

    const images = Array.from(document.querySelectorAll("img")).map((img) => ({
      src: img.currentSrc || img.src,
      loading: img.getAttribute("loading"),
      width: img.getAttribute("width"),
      height: img.getAttribute("height"),
    }));

    const hasMetaDescription = !!document.querySelector('meta[name="description"]');
    const hasCanonical = !!document.querySelector('link[rel="canonical"]');
    const lang = document.documentElement.lang || "";
    const title = document.title || "";
    const insecureRequests = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.startsWith("http://")).length;
    const resourceTransferBytes = performance
      .getEntriesByType("resource")
      .reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0);
    const navigationTransferBytes = nav ? nav.transferSize || nav.encodedBodySize || 0 : 0;
    const scriptsInHeadWithoutDefer = Array.from(
      document.querySelectorAll("head script[src]:not([defer]):not([async])")
    ).length;

    return {
      timing,
      images,
      hasMetaDescription,
      hasCanonical,
      hasLang: Boolean(lang),
      hasTitle: Boolean(title.trim()),
      insecureRequests,
      transferBytes: resourceTransferBytes + navigationTransferBytes,
      scriptsInHeadWithoutDefer,
    };
  });

  totalTransferSize = Math.max(totalTransferSize, evalData.transferBytes);

  if (!evalData.hasMetaDescription) {
    issues.push({
      id: `${mode}-seo-meta-description`,
      ruleId: "missing-meta-description",
      category: "seo",
      severity: "medium",
      description: "Missing meta description affects click-through from search results.",
      priority: 2,
    });
  }

  if (!evalData.hasCanonical) {
    issues.push({
      id: `${mode}-seo-canonical`,
      ruleId: "missing-canonical",
      category: "seo",
      severity: "low",
      description: "Canonical link is missing; duplicate URLs may split ranking signals.",
      priority: 4,
    });
  }

  if (!evalData.hasLang) {
    issues.push({
      id: `${mode}-a11y-lang`,
      ruleId: "missing-html-lang",
      category: "accessibility",
      severity: "high",
      description: "Missing lang attribute on html element.",
      priority: 1,
    });
  }

  if (!evalData.hasTitle) {
    issues.push({
      id: `${mode}-seo-title`,
      ruleId: "missing-title",
      category: "seo",
      severity: "high",
      description: "Title tag is missing or empty.",
      priority: 1,
    });
  }

  for (const img of evalData.images) {
    if (img.src && !img.loading) {
      issues.push({
        id: `${mode}-perf-img-lazy-${img.src}`,
        ruleId: "image-lazy-load",
        category: "performance",
        severity: "medium",
        description: "Image missing lazy-loading attribute.",
        priority: 2,
      });
      break;
    }
  }

  if (evalData.scriptsInHeadWithoutDefer > 0) {
    issues.push({
      id: `${mode}-perf-render-blocking-script`,
      ruleId: "render-blocking-script",
      category: "performance",
      severity: "high",
      description: "Script tags in head without async/defer can block rendering.",
      priority: 1,
    });
  }

  if (evalData.insecureRequests > 0 || url.startsWith("http://")) {
    issues.push({
      id: `${mode}-sec-insecure`,
      ruleId: "insecure-transport",
      category: "security",
      severity: "high",
      description: "Insecure HTTP resources detected. Enforce HTTPS and HSTS.",
      priority: 1,
    });
  }

  const categoryIssues = (category) => issues.filter((issue) => issue.category === category);
  const scoreForCategory = (category) => {
    const list = categoryIssues(category);
    const high = list.filter((i) => i.severity === "high").length;
    const medium = list.filter((i) => i.severity === "medium").length;
    const low = list.filter((i) => i.severity === "low").length;
    return scoreFromIssueCounts(high, medium, low);
  };

  const performance = scoreForCategory("performance");
  const seo = scoreForCategory("seo");
  const accessibility = scoreForCategory("accessibility");
  const security = scoreForCategory("security");
  const { gramsCo2, carbonScore } = carbonEstimate(totalTransferSize);

  if (carbonScore < 90) {
    issues.push({
      id: `${mode}-carbon-transfer`,
      ruleId: "high-transfer-carbon",
      category: "carbon",
      severity: carbonScore < 70 ? "high" : "medium",
      description: `Estimated page transfer emits ${gramsCo2.toFixed(3)}g CO2 per load.`,
      priority: carbonScore < 70 ? 1 : 3,
    });
  }

  const report = {
    url,
    mode,
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    artifacts: {
      screenshotPath,
      videoPath: null,
    },
    metrics: {
      timing: evalData.timing,
      transferBytes: totalTransferSize,
      responseCount: responses.length,
      estimatedCo2gPerLoad: Number(gramsCo2.toFixed(3)),
    },
    scores: {
      performance,
      seo,
      accessibility,
      security,
      carbon: carbonScore,
      overall: clampScore((performance + seo + accessibility + security + carbonScore) / 5),
    },
    prioritizedIssues: issues
      .sort((a, b) => a.priority - b.priority)
      .map((issue) => ({
        ...issue,
        aiFix: makeFix(issue),
      })),
  };

  return report;
}

export async function runUnifiedAudit({ url, outputDir = DEFAULT_OUTPUT_DIR }) {
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("URL must use http or https");
  }
  const runId = `${sanitizeArtifactName(parsedUrl.hostname)}-${Date.now()}`;
  const runOutputDir = path.join(outputDir, runId);
  await fs.mkdir(runOutputDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: await resolveChromiumExecutablePath(),
  });

  const executeMode = async (mode) => {
    const context = await browser.newContext({
      ...(mode === "mobile" ? devices["iPhone 13"] : {}),
      recordVideo: {
        dir: runOutputDir,
        size: mode === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      },
    });
    const page = await context.newPage();
    const report = await runModeAudit({ page, url, mode, outputDir: runOutputDir });
    const video = page.video();
    await context.close();
    const videoPath = video ? await video.path() : null;
    report.artifacts.videoPath = videoPath;
    return report;
  };

  try {
    const [desktop, mobile] = await Promise.all([executeMode("desktop"), executeMode("mobile")]);

    const combined = {
      url,
      generatedAt: new Date().toISOString(),
      reports: { desktop, mobile },
      aggregate: {
        performance: clampScore((desktop.scores.performance + mobile.scores.performance) / 2),
        seo: clampScore((desktop.scores.seo + mobile.scores.seo) / 2),
        accessibility: clampScore((desktop.scores.accessibility + mobile.scores.accessibility) / 2),
        security: clampScore((desktop.scores.security + mobile.scores.security) / 2),
        carbon: clampScore((desktop.scores.carbon + mobile.scores.carbon) / 2),
        overall: clampScore((desktop.scores.overall + mobile.scores.overall) / 2),
      },
      topIssues: [...desktop.prioritizedIssues, ...mobile.prioritizedIssues]
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 15),
    };

    const reportPath = path.join(runOutputDir, "unified-report.json");
    await fs.writeFile(reportPath, JSON.stringify(combined, null, 2), "utf8");
    return { report: combined, reportPath };
  } finally {
    await browser.close();
  }
}

async function resolveChromiumExecutablePath() {
  const candidates = [
    path.resolve(
      process.cwd(),
      "node_modules/playwright-core/.local-browsers/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    ),
    path.resolve(
      process.cwd(),
      "node_modules/playwright-core/.local-browsers/chromium-1217/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    ),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Candidate not available in current environment.
    }
  }

  return undefined;
}
