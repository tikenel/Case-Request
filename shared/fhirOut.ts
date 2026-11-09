// FHIR resources the app can write back to Epic once the health system turns
// it on. Both are off by default: what Epic accepts (note types, whether
// ServiceRequest.Create is enabled) is set per organization by its Epic team.
import { procedureById } from "./catalog.js";
import type { ChartSummary } from "./chart.js";
import { booking, dateLine, type SurgeryRequest } from "./request.js";

export const CPT_SYSTEM = "http://www.ama-assn.org/go/cpt";
export const ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10-cm";

const b64 = (text: string) =>
  typeof Buffer !== "undefined" ? Buffer.from(text, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(text)));

export interface NoteType { system: string; code: string; display: string }
export const DEFAULT_NOTE_TYPE: NoteType = { system: "http://loinc.org", code: "11506-3", display: "Progress note" };

/** The scheduler sheet as a clinical note (Epic: DocumentReference.Create, Clinical Notes). */
export function noteResource(chart: ChartSummary, text: string, type: NoteType = DEFAULT_NOTE_TYPE) {
  return {
    resourceType: "DocumentReference",
    status: "current",
    docStatus: "final",
    type: { coding: [type], text: type.display },
    category: [{ coding: [{ system: "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category", code: "clinical-note" }] }],
    subject: { reference: `Patient/${chart.patient.id}` },
    date: new Date().toISOString(),
    content: [{ attachment: { contentType: "text/plain", data: b64(text) } }],
    ...(chart.encounterId ? { context: { encounter: [{ reference: `Encounter/${chart.encounterId}` }] } } : {}),
  };
}

const PRIORITY = { Elective: "routine", Urgent: "urgent", Emergent: "stat" } as const;

/** One ServiceRequest per procedure, sharing a requisition id so they read as one case. */
export function serviceRequests(req: SurgeryRequest, chart: ChartSummary, requisition: string) {
  const b = booking(req);
  return req.procedures.map((r) => {
    const p = procedureById(r.id)!;
    const period =
      req.datePlan === "Between dates" ? { start: req.dateFrom, end: req.dateTo }
      : req.datePlan === "No later than" ? { end: req.dateFrom }
      : req.datePlan === "On date" ? { start: req.dateFrom, end: req.dateFrom }
      : undefined;
    return {
      resourceType: "ServiceRequest",
      status: "active",
      intent: "order",
      priority: PRIORITY[req.urgency],
      requisition: { system: "urn:or-request:case", value: requisition },
      category: [{ coding: [{ system: "http://snomed.info/sct", code: "387713003", display: "Surgical procedure" }] }],
      code: { coding: [{ system: CPT_SYSTEM, code: p.cpt }], text: `${p.sided && r.side ? `${r.side} ` : ""}${p.name}` },
      ...(p.sided && r.side ? { bodySite: [{ text: r.side }] } : {}),
      subject: { reference: `Patient/${chart.patient.id}` },
      ...(chart.encounterId ? { encounter: { reference: `Encounter/${chart.encounterId}` } } : {}),
      ...(period ? { occurrencePeriod: period } : {}),
      reasonCode: req.diagnoses.map((d) => ({ coding: [{ system: ICD10_SYSTEM, code: d.code, display: d.display }], text: d.display })),
      note: [{ text: `${dateLine(req)}. ${b.location ?? b.setting}, ${b.anesthesia}, ${b.minutes} min, ${b.admission}.${r.note ? ` ${r.note}` : ""}` }],
    };
  });
}
