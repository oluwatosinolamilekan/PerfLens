import fs from "node:fs/promises";
import path from "node:path";
import { runUnifiedAudit } from "./audit-engine.mjs";

const url = process.env.AUDIT_URL;
const threshold = Number(process.env.AUDIT_MIN_SCORE || 75);
const outputDir = path.resolve(process.cwd(), "audit-results");

if (!url) {
  console.error("AUDIT_URL env var is required.");
  process.exit(1);
}

const baselinePath = path.resolve(process.cwd(), "audit-baseline.json");

try {
  const { report } = await runUnifiedAudit({ url, outputDir });
  const current = report.aggregate.overall;
  let baseline = null;

  try {
    baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
  } catch {
    // baseline is optional on first run
  }

  const previous = baseline?.aggregate?.overall ?? null;
  const delta = previous == null ? null : current - previous;

  const summary = {
    url,
    current,
    previous,
    delta,
    threshold,
    aggregate: report.aggregate,
  };

  await fs.writeFile(
    path.join(outputDir, "ci-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  if (current < threshold) {
    console.error(
      `Audit score ${current} is below threshold ${threshold}. Blocking deployment.`
    );
    process.exit(1);
  }

  console.log(`Audit score ${current} passed threshold ${threshold}.`);
  process.exit(0);
} catch (error) {
  console.error("CI audit failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
