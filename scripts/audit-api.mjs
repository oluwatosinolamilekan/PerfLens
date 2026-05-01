import express from "express";
import { runUnifiedAudit } from "./audit-engine.mjs";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

const reports = new Map();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/audit", async (req, res) => {
  const url = req.body?.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "url must use http or https" });
    }
  } catch {
    return res.status(400).json({ error: "url must be valid" });
  }

  try {
    const { report, reportPath } = await runUnifiedAudit({ url });
    reports.set(url, report);
    return res.json({ report, reportPath });
  } catch (error) {
    return res.status(500).json({
      error: "audit_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/benchmark", (_req, res) => {
  const urls = Array.isArray(_req.body?.urls) ? _req.body.urls : [];
  if (urls.length < 2 || urls.length > 6) {
    return res.status(400).json({ error: "provide between 2 and 6 URLs (you + up to 5 competitors)" });
  }

  const data = urls.map((url) => {
    const report = reports.get(url);
    return {
      url,
      score: report?.aggregate?.overall ?? null,
      categories: report?.aggregate ?? null,
    };
  });

  return res.json({ competitors: data });
});

app.post("/api/webhooks/score-change", (req, res) => {
  const payload = req.body || {};
  // Stub endpoint for Slack/Teams relay integration.
  return res.json({ accepted: true, receivedAt: new Date().toISOString(), payload });
});

app.listen(port, () => {
  console.log(`Audit API listening on http://localhost:${port}`);
});
