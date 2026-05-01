#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const userDataDir = path.join(rootDir, ".perflens-chromium-profile");
const apiPort = Number(process.env.PORT || 8787);
const startUrl = process.argv[2] || "https://example.com";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: options.stdio || "inherit",
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || "0",
        npm_config_script_shell: process.env.npm_config_script_shell || "/bin/zsh",
      },
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${apiPort}/health`);
      if (response.ok) return;
    } catch {
      // API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Audit API did not become ready on port ${apiPort}`);
}

async function ensureBuiltExtension() {
  await run("npm", ["run", "build"]);
  await fs.access(path.join(distDir, "manifest.json"));
}

async function main() {
  await ensureBuiltExtension();

  const api = spawn("npm", ["run", "audit:api"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(apiPort),
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || "0",
      npm_config_script_shell: process.env.npm_config_script_shell || "/bin/zsh",
    },
  });

  const cleanup = async () => {
    api.kill("SIGTERM");
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  await waitForApi();

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(startUrl);

  console.log("");
  console.log("PerfLens phase 1 is running.");
  console.log(`Extension: ${distDir}`);
  console.log(`Audit API: http://localhost:${apiPort}`);
  console.log("Open the PerfLens toolbar popup and use Platform audit for desktop/mobile reports.");

  await new Promise((resolve) => {
    context.on("close", resolve);
  });
  await cleanup();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
