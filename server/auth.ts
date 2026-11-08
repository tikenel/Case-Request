// Only signed-in Epic users may use the AI endpoint. The browser sends the
// SMART access token it got from Epic; we check it by reading the open patient
// from that Epic FHIR server. No accounts or passwords of our own.
import { createHash } from "node:crypto";

export interface FhirCaller { iss: string; patient: string; token: string }

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, number>();

export function allowedIssuers(): string[] {
  return (process.env.FHIR_ISS_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export type Verdict = { ok: true } | { ok: false; status: number; message: string };

export async function verifyCaller(c: Partial<FhirCaller>, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Verdict> {
  if (!c.iss || !c.patient || !c.token) return { ok: false, status: 401, message: "Open this app from the patient's chart in Epic." };
  const iss = c.iss.replace(/\/$/, "");
  if (!allowedIssuers().includes(iss)) return { ok: false, status: 403, message: "This Epic server isn't on the app's allowlist." };
  if (!/^[A-Za-z0-9\-.]{1,64}$/.test(c.patient)) return { ok: false, status: 400, message: "Bad patient id." };

  const key = createHash("sha256").update(`${iss}|${c.patient}|${c.token}`).digest("hex");
  const until = cache.get(key);
  if (until && until > now) return { ok: true };

  try {
    const res = await fetcher(`${iss}/Patient/${encodeURIComponent(c.patient)}`, {
      headers: { Authorization: `Bearer ${c.token}`, Accept: "application/fhir+json" },
    });
    if (!res.ok) return { ok: false, status: 401, message: "Your Epic session has expired. Relaunch the app from the chart." };
  } catch {
    return { ok: false, status: 502, message: "Couldn't reach Epic to check your session." };
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, now + TTL_MS);
  return { ok: true };
}

export function demoAllowed() {
  return process.env.ALLOW_DEMO === "1";
}
