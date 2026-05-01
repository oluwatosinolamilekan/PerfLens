#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { runUnifiedAudit } from "./audit-engine.mjs";

const program = new Command();

program
  .name("audit")
  .description("AI-powered unified web audit")
  .argument("<url>", "URL to audit")
  .option("-o, --output <dir>", "Output directory", "audit-results")
  .action(async (url, options) => {
    const outputDir = path.resolve(process.cwd(), options.output);
    const started = Date.now();
    try {
      const { report, reportPath } = await runUnifiedAudit({ url, outputDir });
      const elapsed = Date.now() - started;
      console.log(`Audit complete in ${elapsed}ms`);
      console.log(`Report: ${reportPath}`);
      console.log("Scores:");
      console.log(
        `  Overall ${report.aggregate.overall} | Perf ${report.aggregate.performance} | SEO ${report.aggregate.seo} | A11y ${report.aggregate.accessibility} | Sec ${report.aggregate.security} | Carbon ${report.aggregate.carbon}`
      );
      process.exit(0);
    } catch (error) {
      console.error("Audit failed:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
