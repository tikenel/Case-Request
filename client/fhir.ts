// Everything that talks to Epic: SMART launch, reading the chart, reading a
// note, and (when the health system enables it) writing back.
import FHIR from "fhirclient";
import type Client from "fhirclient/lib/Client";
import {
  allergies, bestAttachment, coverage, labs, LAB_CODES, medications, noteRefs, noteText, patientFacts, problems,
  resourcesOf, type ChartSummary, type FhirResource, type NoteRef,
} from "../shared/chart";
import { DEMO_CHART, DEMO_NOTE } from "../shared/demo";
import { noteResource, serviceRequests, type NoteType } from "../shared/fhirOut";
import type { SurgeryRequest } from "../shared/request";

export const SCOPES =
  import.meta.env.VITE_SMART_SCOPES ||
  "launch openid fhirUser patient/Patient.read patient/Condition.read patient/MedicationRequest.read patient/AllergyIntolerance.read patient/Observation.read patient/Coverage.read patient/DocumentReference.read patient/Binary.read patient/Encounter.read";

export const WRITE_NOTE = import.meta.env.VITE_WRITE_NOTE === "1";
export const WRITE_ORDERS = import.meta.env.VITE_WRITE_ORDERS === "1";
const NOTE_TYPE: NoteType = {
  system: import.meta.env.VITE_NOTE_TYPE_SYSTEM || "http://loinc.org",
  code: import.meta.env.VITE_NOTE_TYPE_CODE || "11506-3",
  display: import.meta.env.VITE_NOTE_TYPE_DISPLAY || "Progress note",
};

/** Called by launch.html: Epic opens it with ?iss=...&launch=..., this sends the user to Epic's sign-in. */
export function authorize() {
  const clientId = import.meta.env.VITE_SMART_CLIENT_ID;
  if (!clientId) throw new Error("VITE_SMART_CLIENT_ID is not set. Register the app at fhir.epic.com and rebuild.");
  // "launch" is only valid when Epic opened the app from a chart (it passes ?launch=...).
  // A standalone sign-in without it gets "Invalid OAuth 2.0 request", so drop it there.
  const fromChart = new URLSearchParams(location.search).has("launch");
  const scope = fromChart ? SCOPES : SCOPES.split(/\s+/).filter((s) => s !== "launch").join(" ");
  return FHIR.oauth2.authorize({ clientId, scope, redirectUri: "./index.html", pkceMode: "ifSupported" });
}

/** patientId is the chart's patient, or a test patient picked when Epic opened the app without one. */
export type Session = { kind: "demo" } | { kind: "epic"; client: Client; patientId: string | null };

const SANDBOX = "fhir.epic.com/interconnect-fhir-oauth";
/** Epic's published sandbox test patients that carry the data this app reads. */
export const SANDBOX_PATIENTS = [
  { id: "e0w0LEDCYtfckT6N.CkJKCw3", name: "Warren McGinnis", has: "allergies, problems, notes, labs" },
  { id: "egqBHVfQlt4Bw3XGXoxVxHg3", name: "Elijah Davis", has: "allergies, problems, notes, medications" },
  { id: "erXuFYUfucBZaryVksYEcMg3", name: "Camila Lopez", has: "medications, labs" },
  { id: "eh2xYHuzl9nkSFVvV3osUHg3", name: "Olivia Roberts", has: "problems, notes" },
];
export const isSandbox = (s: Session) => s.kind === "epic" && s.client.state.serverUrl.includes(SANDBOX);
const TEST_PATIENT_KEY = "case-request:test-patient";

/** For standalone testing only: remember the chosen test patient for this browser tab. */
export function pickTestPatient(s: Session, id: string): Session {
  try { sessionStorage.setItem(TEST_PATIENT_KEY, id); } catch { /* private mode */ }
  return s.kind === "epic" ? { ...s, patientId: id } : s;
}

export async function connect(): Promise<Session> {
  if (new URLSearchParams(location.search).has("demo")) return { kind: "demo" };
  const client = await FHIR.oauth2.ready();
  let stored: string | null = null;
  try { stored = sessionStorage.getItem(TEST_PATIENT_KEY); } catch { /* private mode */ }
  return { kind: "epic", client, patientId: client.patient.id ?? stored };
}

async function search(client: Client, query: string): Promise<FhirResource[]> {
  const type = query.split("?")[0];
  const bundle = await client.request<unknown>(query, { pageLimit: 3, flat: false });
  const pages = Array.isArray(bundle) ? bundle : [bundle];
  return pages.flatMap((b) => resourcesOf(b, type));
}

const settled = async <T,>(p: Promise<T>, fallback: T) => {
  try {
    return await p;
  } catch (err) {
    console.warn("Chart read skipped:", err instanceof Error ? err.message : err);
    return fallback;
  }
};

function personName(r: unknown): string | null {
  const n = (r as { name?: { text?: string; given?: string[]; family?: string }[] })?.name?.[0];
  return n ? n.text || [n.given?.join(" "), n.family].filter(Boolean).join(" ") || null : null;
}

export async function loadChart(s: Session): Promise<ChartSummary> {
  if (s.kind === "demo") return DEMO_CHART;
  const c = s.client;
  const pid = s.patientId;
  if (!pid) throw new Error("No patient is open. Launch the app from a patient's chart.");
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [patient, user, conds, meds, alls, obs, cov, docs] = await Promise.all([
    c.patient.id ? c.patient.read() : c.request(`Patient/${pid}`),
    settled(c.user.read(), null),
    settled(search(c, `Condition?patient=${pid}&category=problem-list-item`), []),
    settled(search(c, `MedicationRequest?patient=${pid}&status=active`), []),
    settled(search(c, `AllergyIntolerance?patient=${pid}`), []),
    settled(search(c, `Observation?patient=${pid}&code=${LAB_CODES.map((x) => `http://loinc.org|${x}`).join(",")}&date=ge${since}`), []),
    settled(search(c, `Coverage?patient=${pid}`), []),
    settled(search(c, `DocumentReference?patient=${pid}&category=clinical-note&date=ge${since}`), []),
  ]);
  return {
    patient: patientFacts(patient as unknown as FhirResource),
    encounterId: c.encounter.id ?? null,
    user: personName(user),
    problems: problems(conds),
    allergies: allergies(alls),
    meds: medications(meds),
    labs: labs(obs),
    coverage: coverage(cov),
    notes: noteRefs(docs).slice(0, 25),
  };
}

export async function readNote(s: Session, note: NoteRef): Promise<string> {
  if (s.kind === "demo") return DEMO_NOTE;
  const att = bestAttachment(note);
  const body = await s.client.request<unknown>({ url: att.url, headers: { Accept: att.contentType || "text/html" } });
  if (typeof body === "string") return noteText(att.contentType, body);
  // Some servers return a Binary resource with base64 data instead of the raw document.
  const bin = body as { contentType?: string; data?: string };
  if (bin?.data) {
    const text = new TextDecoder().decode(Uint8Array.from(atob(bin.data), (ch) => ch.charCodeAt(0)));
    return noteText(bin.contentType || att.contentType, text);
  }
  throw new Error("This note's format can't be read.");
}

/** Headers that let our server check this is a live Epic session before it calls the AI. */
export function aiHeaders(s: Session): Record<string, string> {
  if (s.kind === "demo") return { "X-Demo": "1" };
  return {
    Authorization: `Bearer ${s.client.state.tokenResponse?.access_token ?? ""}`,
    "X-FHIR-Server": s.client.state.serverUrl,
    "X-FHIR-Patient": s.patientId ?? "",
  };
}

export async function fileNote(s: Session, chart: ChartSummary, text: string) {
  if (s.kind === "demo") return "demo";
  const created = await s.client.create(noteResource(chart, text, NOTE_TYPE) as never);
  return (created as { id?: string }).id ?? "created";
}

export async function sendOrders(s: Session, req: SurgeryRequest, chart: ChartSummary) {
  const requisition = crypto.randomUUID();
  if (s.kind === "demo") return requisition;
  for (const sr of serviceRequests(req, chart, requisition)) await s.client.create(sr as never);
  return requisition;
}
