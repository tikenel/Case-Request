import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { demoAllowed, verifyCaller } from "./auth.js";
import { claudeEnabled, interpret, MODEL } from "./claude.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Outside production, read local settings the way Vite does (.env wins over .env.development).
if (process.env.NODE_ENV !== "production") {
  for (const f of [".env", ".env.development"]) if (existsSync(join(root, f))) process.loadEnvFile(join(root, f));
}
export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.get("/healthz", (_req, res) => res.send("ok"));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "400kb" }));

app.get("/api/config", (_req, res) => {
  res.json({ ai: claudeEnabled(), model: claudeEnabled() ? MODEL : null, demo: demoAllowed() });
});

// Small per-process limit so one session can't run up the AI bill.
const hits = new Map<string, number[]>();
function limited(key: string, perMinute = 20) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > perMinute;
}

app.post("/api/interpret", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!claudeEnabled()) return res.status(503).json({ error: "AI is not set up on this server. Pick procedures by hand." });
    const demo = req.get("x-demo") === "1";
    if (demo) {
      if (!demoAllowed()) return res.status(403).json({ error: "Demo mode is off on this server." });
    } else {
      const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const verdict = await verifyCaller({ iss: req.get("x-fhir-server"), patient: req.get("x-fhir-patient"), token });
      if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.message });
    }
    if (limited(req.get("x-fhir-patient") || req.ip || "anon")) return res.status(429).json({ error: "Too many AI requests. Wait a minute." });

    const { mode, text, today, context } = req.body ?? {};
    if (mode !== "phrase" && mode !== "note") return res.status(400).json({ error: "mode must be phrase or note" });
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "Nothing to read." });
    if (text.length > 60_000) return res.status(413).json({ error: "That note is too long. Select the assessment and plan instead." });
    const day = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10);
    res.json(await interpret({ mode, text, today: day, context }));
  } catch (err) {
    next(err);
  }
});

app.use("/api", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
});

const dist = join(root, "dist");
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use(express.static(dist, { index: "index.html" }));
  app.get("/launch", (_req, res) => res.sendFile(join(dist, "launch.html")));
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 8787);
  app.listen(port, () => console.log(`OR Request server on :${port} (AI ${claudeEnabled() ? "on" : "off"})`));
}
