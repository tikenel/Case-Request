// Turns the FHIR resources Epic returns into the handful of facts a surgery
// request needs. Pure functions, so they're tested without an Epic sandbox.

import { classify } from "./meds.js";

/* Minimal FHIR R4 shapes: only the fields this app reads. */
export interface Coding { system?: string; code?: string; display?: string }
export interface CodeableConcept { coding?: Coding[]; text?: string }
export interface Reference { reference?: string; display?: string }
export interface FhirResource { resourceType: string; id?: string; [k: string]: unknown }
export interface Bundle { resourceType: "Bundle"; entry?: { resource?: FhirResource }[]; link?: { relation: string; url: string }[] }

export interface PatientFacts {
  id: string;
  name: string;
  mrn: string | null;
  birthDate: string | null;
  age: number | null;
  sex: string | null;
  phone: string | null;
}
export interface Problem { code: string | null; system: string | null; display: string }
export interface Allergy { display: string; contrast: boolean }
export type AllergyStatus = "recorded" | "none known" | "not on file";
export type MedFlag = "anticoagulant" | "antiplatelet" | "nephrotoxic" | "sglt2" | "glp1" | "metformin" | "insulin";
export interface Med { display: string; flags: MedFlag[] }
export interface Lab { value: number; unit: string; date: string | null }
export interface Labs { egfr?: Lab; creatinine?: Lab; inr?: Lab; hemoglobin?: Lab; platelets?: Lab; potassium?: Lab; a1c?: Lab }
export interface CoverageFact { payer: string; memberId: string | null; plan: string | null }
export interface NoteRef { id: string; title: string; date: string | null; author: string | null; attachments: { url: string; contentType: string }[] }

export interface ChartSummary {
  patient: PatientFacts;
  encounterId: string | null;
  user: string | null;
  /** The signed-in clinician (Practitioner), when Epic shares it. */
  signedIn: import("./team.js").SignedInUser | null;
  problems: Problem[];
  allergies: Allergy[];
  /** "recorded": real allergies listed; "none known": NKA documented; "not on file": nobody has recorded allergies. */
  allergyStatus: AllergyStatus;
  meds: Med[];
  labs: Labs;
  coverage: CoverageFact[];
  notes: NoteRef[];
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const arr = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function conceptText(c: unknown): string {
  const cc = obj(c) as CodeableConcept;
  return cc.text || cc.coding?.find((x) => x.display)?.display || cc.coding?.[0]?.code || "";
}

export function resourcesOf(bundle: unknown, type: string): FhirResource[] {
  return arr<{ resource?: FhirResource }>(obj(bundle).entry)
    .map((e) => e.resource)
    .filter((r): r is FhirResource => Boolean(r) && r!.resourceType === type);
}

export function ageOn(birthDate: string | null, today: Date): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < (m || 1) || (today.getMonth() + 1 === (m || 1) && today.getDate() < (d || 1))) age -= 1;
  return age;
}

export function patientFacts(p: FhirResource, today = new Date()): PatientFacts {
  const names = arr<{ use?: string; text?: string; given?: string[]; family?: string }>(p.name);
  const n = names.find((x) => x.use === "official") ?? names.find((x) => x.use === "usual") ?? names[0];
  const name = n?.text || [n?.given?.join(" "), n?.family].filter(Boolean).join(" ") || "Unknown patient";
  // Epic identifiers carry a type text such as "MRN" or "EPI"; fall back to the first one.
  const ids = arr<{ type?: CodeableConcept; value?: string }>(p.identifier);
  const mrn =
    ids.find((i) => /\bmrn\b/i.test(conceptText(i.type)) || i.type?.coding?.some((c) => c.code === "MR"))?.value ??
    ids.find((i) => /\bepi\b/i.test(conceptText(i.type)))?.value ??
    null;
  const phone = arr<{ system?: string; value?: string }>(p.telecom).find((t) => t.system === "phone")?.value ?? null;
  const birthDate = str(p.birthDate) ?? null;
  return { id: p.id ?? "", name, mrn, birthDate, age: ageOn(birthDate, today), sex: str(p.gender) ?? null, phone };
}

export function problems(conditions: FhirResource[]): Problem[] {
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (const c of conditions) {
    const status = conceptText(c.clinicalStatus).toLowerCase();
    if (status && !["active", "recurrence", "relapse"].includes(status)) continue;
    const codings = (obj(c.code) as CodeableConcept).coding ?? [];
    const icd = codings.find((x) => /icd-10/i.test(x.system ?? "")) ?? codings[0];
    const display = conceptText(c.code);
    const key = icd?.code ?? display;
    if (!display || seen.has(key)) continue;
    seen.add(key);
    out.push({ code: icd?.code ?? null, system: icd?.system ?? null, display });
  }
  return out;
}

const CONTRAST = /contrast|iodin|iohexol|iopamidol|iodixanol|ioversol|omnipaque|isovue|visipaque|optiray|gadolin/i;
// Epic files placeholder records instead of leaving the list empty: "Not on File"
// (SNOMED 1631000175102, patient not asked) and no-known-allergy statements.
const NOT_ASKED = { codes: ["1631000175102"], text: /^not on file$|not asked/i };
const NONE_KNOWN = { codes: ["716186003", "409137002", "428607008", "429625007"], text: /^(no known|nka\b|nkda\b|no allergies)/i };

function activeAllergies(list: FhirResource[]) {
  return list.filter((a) => {
    const s = conceptText(a.clinicalStatus).toLowerCase();
    const v = conceptText(a.verificationStatus).toLowerCase();
    return (!s || s === "active") && v !== "entered-in-error" && v !== "refuted";
  });
}
const matches = (a: FhirResource, rule: { codes: string[]; text: RegExp }) =>
  ((obj(a.code) as CodeableConcept).coding ?? []).some((c) => c.code && rule.codes.includes(c.code)) || rule.text.test(conceptText(a.code));

export function allergies(list: FhirResource[]): Allergy[] {
  return activeAllergies(list)
    .filter((a) => !matches(a, NOT_ASKED) && !matches(a, NONE_KNOWN))
    .map((a) => conceptText(a.code))
    .filter(Boolean)
    .map((display) => ({ display, contrast: CONTRAST.test(display) }));
}

export function allergyStatus(list: FhirResource[]): AllergyStatus {
  const active = activeAllergies(list);
  if (active.some((a) => !matches(a, NOT_ASKED) && !matches(a, NONE_KNOWN))) return "recorded";
  if (active.some((a) => matches(a, NONE_KNOWN))) return "none known";
  return "not on file";
}

const MED_RULES: [MedFlag, RegExp][] = [
  ["anticoagulant", /warfarin|coumadin|jantoven|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban|savaysa|enoxaparin|lovenox|dalteparin|fragmin|fondaparinux|arixtra|heparin/i],
  ["antiplatelet", /clopidogrel|plavix|ticagrelor|brilinta|prasugrel|effient|cilostazol|pletal|aspirin|dipyridamole|aggrenox|vorapaxar/i],
  ["sglt2", /empagliflozin|jardiance|dapagliflozin|farxiga|canagliflozin|invokana|ertugliflozin|steglatro|sotagliflozin|bexagliflozin|synjardy|xigduo|glyxambi|trijardy|qtern/i],
  ["glp1", /semaglutide|ozempic|wegovy|rybelsus|tirzepatide|mounjaro|zepbound|dulaglutide|trulicity|liraglutide|victoza|saxenda|exenatide|byetta|bydureon/i],
  ["metformin", /metformin|glucophage|janumet|synjardy|xigduo|kazano|jentadueto|invokamet|segluromet/i],
  ["insulin", /insulin|lantus|basaglar|toujeo|levemir|tresiba|humalog|novolog|admelog|fiasp|lyumjev|humulin|novolin|semglee/i],
];

export function medications(requests: FhirResource[]): Med[] {
  const seen = new Set<string>();
  const out: Med[] = [];
  for (const m of requests) {
    const status = str(m.status);
    if (status && !["active", "on-hold", "draft"].includes(status)) continue;
    const display = conceptText(m.medicationCodeableConcept) || obj(m.medicationReference).display?.toString() || "";
    if (!display || seen.has(display.toLowerCase())) continue;
    seen.add(display.toLowerCase());
    const classes = classify(display).map((c) => c.cls);
    const flags = [...new Set([...classes, ...MED_RULES.filter(([f, re]) => f !== "anticoagulant" && f !== "antiplatelet" && re.test(display)).map(([f]) => f)])];
    out.push({ display, flags });
  }
  return out;
}

export const LOINC: Record<keyof Labs, string[]> = {
  egfr: ["98979-8", "62238-1", "33914-3", "48642-3", "48643-1", "69405-9", "50044-7"],
  creatinine: ["2160-0", "38483-4"],
  inr: ["6301-6", "34714-6"],
  hemoglobin: ["718-7", "20509-6"],
  platelets: ["777-3", "26515-7"],
  potassium: ["2823-3", "6298-4"],
  a1c: ["4548-4", "17856-6"],
};
export const LAB_CODES = Object.values(LOINC).flat();

/** Most recent value per lab, from Observation resources in any order. */
export function labs(observations: FhirResource[]): Labs {
  const out: Labs = {};
  for (const o of observations) {
    const codes = ((obj(o.code) as CodeableConcept).coding ?? []).map((c) => c.code);
    const q = obj(o.valueQuantity);
    let value = typeof q.value === "number" ? q.value : undefined;
    // eGFR often comes back as a string such as ">60".
    if (value === undefined) {
      const s = str(o.valueString)?.match(/[\d.]+/)?.[0];
      if (s) value = Number(s);
    }
    if (value === undefined || Number.isNaN(value)) continue;
    const date = str(o.effectiveDateTime) ?? str(o.issued) ?? null;
    for (const key of Object.keys(LOINC) as (keyof Labs)[]) {
      if (!codes.some((c) => c && LOINC[key].includes(c))) continue;
      const prev = out[key];
      if (!prev || (date && (!prev.date || date > prev.date))) out[key] = { value, unit: str(q.unit) ?? "", date };
    }
  }
  return out;
}

export function coverage(list: FhirResource[]): CoverageFact[] {
  return list
    .filter((c) => !str(c.status) || c.status === "active")
    .map((c) => {
      const payor = arr<Reference>(c.payor)[0];
      const plan = arr<{ type?: CodeableConcept; value?: string; name?: string }>(c.class).find((k) => /plan|group/i.test(conceptText(k.type)));
      return {
        payer: payor?.display || "Unknown payer",
        memberId: str(c.subscriberId) ?? arr<{ value?: string }>(c.identifier)[0]?.value ?? null,
        plan: plan?.name ?? plan?.value ?? null,
      };
    });
}

export function noteRefs(docs: FhirResource[]): NoteRef[] {
  return docs
    .filter((d) => str(d.status) !== "entered-in-error" && str(d.docStatus) !== "entered-in-error")
    .map((d) => ({
      id: d.id ?? "",
      title: conceptText(d.type) || str(d.description) || "Clinical note",
      date: str(d.date) ?? str(obj(obj(d.context).period).start) ?? null,
      author: arr<Reference>(d.author)[0]?.display ?? null,
      attachments: arr<{ attachment?: { url?: string; contentType?: string } }>(d.content)
        .map((c) => ({ url: c.attachment?.url ?? "", contentType: c.attachment?.contentType ?? "" }))
        .filter((a) => a.url),
    }))
    .filter((n) => n.attachments.length)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** Prefer plain text, then HTML, then RTF: the order that converts most cleanly. */
export function bestAttachment(note: NoteRef) {
  const rank = (t: string) => (/plain/.test(t) ? 0 : /html/.test(t) ? 1 : /rtf/.test(t) ? 2 : 3);
  return [...note.attachments].sort((a, b) => rank(a.contentType) - rank(b.contentType))[0];
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Good-enough RTF to text for Epic notes: drops control words and groups like font tables. */
export function rtfToText(rtf: string): string {
  let t = rtf.replace(/\{\\\*[^{}]*\}/g, "");
  for (let i = 0; i < 4; i++) t = t.replace(/\{\\(fonttbl|colortbl|stylesheet|info)[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, "");
  return t
    .replace(/\\par[d]?\b ?/g, "\n")
    .replace(/\\line\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function noteText(contentType: string, body: string): string {
  if (/html/i.test(contentType)) return htmlToText(body);
  if (/rtf/i.test(contentType) || body.startsWith("{\\rtf")) return rtfToText(body);
  return body.trim();
}
