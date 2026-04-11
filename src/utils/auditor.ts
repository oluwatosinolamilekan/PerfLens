import type { ResourceMetrics, ResourceInfo, AuditResult, AuditIssue, Suggestion } from './types';

function createAudit(
  id: string,
  title: string,
  category: string,
  issues: AuditIssue[],
  suggestions: string[]
): AuditResult {
  const score = issues.length === 0
    ? 100
    : Math.max(
        0,
        100 - issues.reduce((acc, i) => acc + (i.severity === 'high' ? 30 : i.severity === 'medium' ? 15 : 5), 0)
      );

  return {
    id,
    title,
    category,
    passed: issues.length === 0,
    score,
    issues,
    suggestions,
  };
}

export function auditImages(resources: ResourceMetrics): AuditResult {
  const issues: AuditIssue[] = [];
  const suggestions: string[] = [];
  const images = resources.resources.filter((r) => r.type === 'image');

  for (const img of images) {
    if (img.size > 200_000) {
      issues.push({
        severity: 'high',
        description: `Image is ${formatBytes(img.size)} — consider compressing or using modern formats (WebP/AVIF)`,
        resource: img.name,
        suggestion: 'Compress the image or convert to WebP/AVIF format',
      });
    } else if (img.size > 100_000) {
      issues.push({
        severity: 'medium',
        description: `Image is ${formatBytes(img.size)} — could be further optimized`,
        resource: img.name,
        suggestion: 'Consider compressing or resizing this image',
      });
    }

    if (!img.compressed && img.size > 10_000) {
      issues.push({
        severity: 'medium',
        description: 'Image is not compressed during transfer',
        resource: img.name,
        suggestion: 'Enable gzip/brotli compression on the server',
      });
    }
  }

  const imgElements = document.querySelectorAll('img');
  imgElements.forEach((el) => {
    if (!el.loading || el.loading !== 'lazy') {
      const rect = el.getBoundingClientRect();
      if (rect.top > window.innerHeight) {
        issues.push({
          severity: 'medium',
          description: 'Below-the-fold image missing lazy loading attribute',
          resource: el.src || el.currentSrc,
          suggestion: 'Add loading="lazy" to images below the fold',
        });
      }
    }

    if (!el.width && !el.height && !el.style.width && !el.style.height) {
      const src = el.src || el.currentSrc;
      if (src && el.naturalWidth > 0) {
        issues.push({
          severity: 'low',
          description: 'Image missing explicit width/height — may cause layout shift',
          resource: src,
          suggestion: 'Set explicit width and height attributes on the image element',
        });
      }
    }

    if (el.naturalWidth > 0 && el.clientWidth > 0) {
      const ratio = el.naturalWidth / el.clientWidth;
      if (ratio > 2.5) {
        issues.push({
          severity: 'medium',
          description: `Image is ${el.naturalWidth}×${el.naturalHeight}px but displayed at ${el.clientWidth}×${el.clientHeight}px — oversized by ${Math.round(ratio)}x`,
          resource: el.src || el.currentSrc,
          suggestion: 'Serve appropriately sized images using srcset or resize the source',
        });
      }
    }
  });

  if (issues.length > 0) {
    suggestions.push('Use modern image formats (WebP, AVIF) for better compression');
    suggestions.push('Add loading="lazy" to below-the-fold images');
    suggestions.push('Specify width and height on all images to prevent layout shifts');
  }

  return createAudit('images', 'Image Optimization', 'Images', issues, suggestions);
}

export function auditScripts(resources: ResourceMetrics): AuditResult {
  const issues: AuditIssue[] = [];
  const suggestions: string[] = [];
  const scripts = resources.resources.filter((r) => r.type === 'script');

  for (const script of scripts) {
    if (script.size > 250_000) {
      issues.push({
        severity: 'high',
        description: `Script bundle is ${formatBytes(script.size)} — consider code splitting`,
        resource: script.name,
        suggestion: 'Split large bundles using dynamic imports or code splitting',
      });
    } else if (script.size > 100_000) {
      issues.push({
        severity: 'medium',
        description: `Script is ${formatBytes(script.size)} — could benefit from splitting`,
        resource: script.name,
        suggestion: 'Consider splitting this script into smaller chunks',
      });
    }
  }

  const blockingScripts = resources.blocking.filter((r) => r.type === 'script');
  for (const script of blockingScripts) {
    issues.push({
      severity: 'high',
      description: 'Render-blocking script delays page rendering',
      resource: script.name,
      suggestion: 'Add async or defer attribute to non-critical scripts',
    });
  }

  const scriptElements = document.querySelectorAll('script[src]');
  scriptElements.forEach((el) => {
    const script = el as HTMLScriptElement;
    if (!script.async && !script.defer && script.src) {
      const isInHead = script.parentElement?.tagName === 'HEAD';
      if (isInHead) {
        issues.push({
          severity: 'medium',
          description: 'Script in <head> without async/defer may block rendering',
          resource: script.src,
          suggestion: 'Move script to end of body or add async/defer attribute',
        });
      }
    }
  });

  const totalScriptSize = scripts.reduce((sum, s) => sum + s.size, 0);
  if (totalScriptSize > 500_000) {
    suggestions.push(`Total JavaScript is ${formatBytes(totalScriptSize)} — audit for unused code`);
  }

  if (blockingScripts.length > 0) {
    suggestions.push('Eliminate render-blocking scripts by using async/defer');
  }

  if (scripts.length > 15) {
    suggestions.push(`${scripts.length} script requests — consider bundling to reduce HTTP requests`);
  }

  return createAudit('scripts', 'Script Optimization', 'Scripts', issues, suggestions);
}

export function auditStyles(resources: ResourceMetrics): AuditResult {
  const issues: AuditIssue[] = [];
  const suggestions: string[] = [];
  const stylesheets = resources.resources.filter((r) => r.type === 'stylesheet');

  for (const css of stylesheets) {
    if (css.size > 100_000) {
      issues.push({
        severity: 'medium',
        description: `Stylesheet is ${formatBytes(css.size)} — consider splitting critical/non-critical CSS`,
        resource: css.name,
        suggestion: 'Extract critical CSS and defer loading of non-critical styles',
      });
    }
  }

  const blockingStyles = resources.blocking.filter((r) => r.type === 'stylesheet');
  for (const css of blockingStyles) {
    issues.push({
      severity: 'high',
      description: 'Render-blocking stylesheet delays page rendering',
      resource: css.name,
      suggestion: 'Inline critical CSS and load the rest asynchronously',
    });
  }

  const totalCSSSize = stylesheets.reduce((sum, s) => sum + s.size, 0);
  if (totalCSSSize > 200_000) {
    suggestions.push(
      `Total CSS is ${formatBytes(totalCSSSize)} — audit for unused styles`
    );
  }

  const styleSheetCount = document.styleSheets.length;
  let estimatedUnusedRules = 0;
  let totalRules = 0;

  try {
    for (let i = 0; i < styleSheetCount; i++) {
      try {
        const sheet = document.styleSheets[i];
        if (!sheet.cssRules) continue;
        totalRules += sheet.cssRules.length;

        for (let j = 0; j < sheet.cssRules.length; j++) {
          const rule = sheet.cssRules[j];
          if (rule instanceof CSSStyleRule) {
            try {
              if (document.querySelectorAll(rule.selectorText).length === 0) {
                estimatedUnusedRules++;
              }
            } catch {
              // invalid selector
            }
          }
        }
      } catch {
        // cross-origin stylesheet
      }
    }
  } catch {
    // stylesheet access error
  }

  if (totalRules > 0 && estimatedUnusedRules / totalRules > 0.3) {
    const pct = Math.round((estimatedUnusedRules / totalRules) * 100);
    issues.push({
      severity: 'medium',
      description: `Approximately ${pct}% of CSS rules appear unused (${estimatedUnusedRules}/${totalRules} rules)`,
      suggestion: 'Use tools like PurgeCSS to remove unused styles',
    });
    suggestions.push(`Remove ~${estimatedUnusedRules} potentially unused CSS rules`);
  }

  return createAudit('styles', 'CSS Optimization', 'Styles', issues, suggestions);
}

export function auditCaching(resources: ResourceMetrics): AuditResult {
  const issues: AuditIssue[] = [];
  const suggestions: string[] = [];
  const uncached = resources.resources.filter((r) => !r.cached && r.size > 0);
  const staticTypes = ['script', 'stylesheet', 'image', 'font'];

  const uncachedStatic = uncached.filter((r) => staticTypes.includes(r.type));

  if (uncachedStatic.length > 0) {
    const sampleSize = Math.min(uncachedStatic.length, 5);
    for (let i = 0; i < sampleSize; i++) {
      issues.push({
        severity: 'medium',
        description: `Static resource not served from cache`,
        resource: uncachedStatic[i].name,
        suggestion: 'Set Cache-Control headers with appropriate max-age for static assets',
      });
    }

    if (uncachedStatic.length > sampleSize) {
      issues.push({
        severity: 'medium',
        description: `${uncachedStatic.length - sampleSize} additional static resources not cached`,
        suggestion: 'Configure caching for all static assets',
      });
    }

    suggestions.push(
      `${uncachedStatic.length} static resources could benefit from caching headers`
    );
    suggestions.push('Use Cache-Control: public, max-age=31536000 for versioned assets');
  }

  const totalCacheSavings = uncachedStatic.reduce((sum, r) => sum + r.size, 0);
  if (totalCacheSavings > 0) {
    suggestions.push(
      `Potential cache savings: ${formatBytes(totalCacheSavings)} per repeat visit`
    );
  }

  return createAudit('caching', 'Cache Policy', 'Caching', issues, suggestions);
}

export function auditCompression(resources: ResourceMetrics): AuditResult {
  const issues: AuditIssue[] = [];
  const suggestions: string[] = [];
  const compressibleTypes = ['script', 'stylesheet', 'data', 'fetch'];

  const uncompressed = resources.resources.filter(
    (r) => compressibleTypes.includes(r.type) && !r.compressed && r.size > 1000
  );

  for (const resource of uncompressed.slice(0, 5)) {
    issues.push({
      severity: resource.size > 50_000 ? 'high' : 'medium',
      description: `Uncompressed ${resource.type} resource (${formatBytes(resource.size)})`,
      resource: resource.name,
      suggestion: 'Enable gzip or Brotli compression on the server',
    });
  }

  if (uncompressed.length > 5) {
    issues.push({
      severity: 'medium',
      description: `${uncompressed.length - 5} additional uncompressed text resources`,
      suggestion: 'Enable compression for all text-based resources',
    });
  }

  const potentialSavings = uncompressed.reduce((sum, r) => sum + r.size * 0.65, 0);
  if (potentialSavings > 0) {
    suggestions.push(
      `Enable compression to save ~${formatBytes(potentialSavings)} in transfer size`
    );
    suggestions.push('Use Brotli compression for best results (20-26% better than gzip)');
  }

  return createAudit('compression', 'Text Compression', 'Compression', issues, suggestions);
}

export function auditAccessibility(): AuditResult {
  const issues: AuditIssue[] = [];
  const suggestions: string[] = [];

  const images = document.querySelectorAll('img');
  let missingAlt = 0;
  images.forEach((img) => {
    if (!img.hasAttribute('alt')) {
      missingAlt++;
    }
  });
  if (missingAlt > 0) {
    issues.push({
      severity: 'high',
      description: `${missingAlt} image(s) missing alt attribute`,
      suggestion: 'Add descriptive alt text to all images for screen readers',
    });
  }

  const html = document.documentElement;
  if (!html.lang) {
    issues.push({
      severity: 'high',
      description: 'Missing lang attribute on <html> element',
      suggestion: 'Add lang="en" (or appropriate language) to the <html> tag',
    });
  }

  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    issues.push({
      severity: 'high',
      description: 'Missing meta viewport tag',
      suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    });
  }

  const title = document.title;
  if (!title || title.trim().length === 0) {
    issues.push({
      severity: 'medium',
      description: 'Page is missing a title element',
      suggestion: 'Add a descriptive <title> element to the page',
    });
  }

  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length === 0) {
    issues.push({
      severity: 'low',
      description: 'No heading elements found on the page',
      suggestion: 'Use semantic heading elements (h1-h6) for page structure',
    });
  } else {
    const firstHeading = headings[0];
    if (firstHeading.tagName !== 'H1') {
      issues.push({
        severity: 'low',
        description: `First heading is <${firstHeading.tagName.toLowerCase()}> instead of <h1>`,
        suggestion: 'Ensure the page has a single h1 as the first heading',
      });
    }
  }

  const buttons = document.querySelectorAll('button, [role="button"]');
  let emptyButtons = 0;
  buttons.forEach((btn) => {
    const text = btn.textContent?.trim();
    const ariaLabel = btn.getAttribute('aria-label');
    const title = btn.getAttribute('title');
    if (!text && !ariaLabel && !title) {
      emptyButtons++;
    }
  });
  if (emptyButtons > 0) {
    issues.push({
      severity: 'medium',
      description: `${emptyButtons} button(s) with no accessible label`,
      suggestion: 'Add text content or aria-label to all interactive elements',
    });
  }

  const links = document.querySelectorAll('a');
  let emptyLinks = 0;
  links.forEach((a) => {
    const text = a.textContent?.trim();
    const ariaLabel = a.getAttribute('aria-label');
    if (!text && !ariaLabel && !a.querySelector('img[alt]')) {
      emptyLinks++;
    }
  });
  if (emptyLinks > 0) {
    issues.push({
      severity: 'medium',
      description: `${emptyLinks} link(s) with no accessible text`,
      suggestion: 'Add descriptive text or aria-label to all links',
    });
  }

  const formInputs = document.querySelectorAll('input, select, textarea');
  let unlabeled = 0;
  formInputs.forEach((input) => {
    const id = input.id;
    const ariaLabel = input.getAttribute('aria-label');
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
    const type = input.getAttribute('type');
    if (type === 'hidden' || type === 'submit' || type === 'button') return;
    if (!hasLabel && !ariaLabel && !ariaLabelledBy) {
      unlabeled++;
    }
  });
  if (unlabeled > 0) {
    issues.push({
      severity: 'medium',
      description: `${unlabeled} form input(s) missing associated labels`,
      suggestion: 'Associate labels with form inputs using the for attribute or aria-label',
    });
  }

  if (issues.length > 0) {
    suggestions.push('Add alt text to all images for accessibility');
    suggestions.push('Ensure proper heading hierarchy (h1 → h2 → h3)');
    suggestions.push('Label all form inputs and interactive elements');
  }

  return createAudit('accessibility', 'Accessibility Basics', 'Accessibility', issues, suggestions);
}

export function generateSuggestions(audits: AuditResult[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  let idCounter = 0;

  for (const audit of audits) {
    for (const issue of audit.issues) {
      suggestions.push({
        id: `suggestion-${idCounter++}`,
        impact: issue.severity,
        category: audit.category,
        title: issue.suggestion,
        description: issue.description,
        resources: issue.resource ? [issue.resource] : [],
      });
    }
  }

  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.category}:${s.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function runFullAudit(resources: ResourceMetrics): {
  audits: AuditResult[];
  suggestions: Suggestion[];
} {
  const audits = [
    auditImages(resources),
    auditScripts(resources),
    auditStyles(resources),
    auditCaching(resources),
    auditCompression(resources),
    auditAccessibility(),
  ];

  const suggestions = generateSuggestions(audits);
  return { audits, suggestions };
}
