// What the interpreter (AI or offline) proposes, and how accepted parts of it
// merge into the request. Nothing is applied until the clinician ticks it.
import { procedureById } from "./catalog.js";
import { searchProcedures, sideFromText, type Side } from "./match.js";
import type { Admission, Anesthesia } from "./catalog.js";
import type { DatePlan, SurgeryRequest, Urgency } from "./request.js";

export interface SuggestedProcedure { id: string; side: Side | null; evidence: string; confidence: "high" | "medium" | "low" }
export interface Suggestion {
  procedures: SuggestedProcedure[];
  unmatched: string[];
  diagnoses: { code: string; display: string; evidence: string }[];
  urgency: Urgency | null;
  datePlan: DatePlan | null;
  dateFrom: string | null;
  dateTo: string | null;
  anesthesia: Anesthesia | null;
  admission: Admission | null;
  equipment: string[];
  vendorNotes: string | null;
  medicationPlan: string | null;
  questions: string[];
  summary: string;
}

export interface Accepted { procedures: Set<number>; diagnoses: Set<number>; details: boolean }

export function defaultAccepted(s: Suggestion): Accepted {
  return {
    procedures: new Set(s.procedures.map((p, i) => (p.confidence === "low" ? -1 : i)).filter((i) => i >= 0)),
    diagnoses: new Set(s.diagnoses.map((_, i) => i)),
    details: true,
  };
}

export function applySuggestion(req: SurgeryRequest, s: Suggestion, a: Accepted): SurgeryRequest {
  const next: SurgeryRequest = { ...req, procedures: [...req.procedures], diagnoses: [...req.diagnoses], checklist: [...req.checklist] };
  s.procedures.forEach((p, i) => {
    if (!a.procedures.has(i)) return;
    const existing = next.procedures.find((r) => r.id === p.id && (r.side === p.side || !r.side));
    if (existing) existing.side ??= p.side;
    else next.procedures.push({ id: p.id, side: p.side, note: "" });
  });
  s.diagnoses.forEach((d, i) => {
    if (a.diagnoses.has(i) && !next.diagnoses.some((x) => x.code === d.code)) next.diagnoses.push({ code: d.code, display: d.display });
  });
  if (a.details) {
    if (s.urgency) next.urgency = s.urgency;
    if (s.datePlan) {
      next.datePlan = s.datePlan;
      next.dateFrom = s.dateFrom ?? "";
      next.dateTo = s.dateTo ?? "";
    }
    if (s.anesthesia) next.anesthesia = s.anesthesia;
    if (s.admission) next.admission = s.admission;
    const extra = s.equipment.filter((e) => !next.extraEquipment.includes(e));
    if (extra.length) next.extraEquipment = [next.extraEquipment.trim(), ...extra].filter(Boolean).join("\n");
    if (s.vendorNotes && !next.vendorNotes.includes(s.vendorNotes)) next.vendorNotes = [next.vendorNotes.trim(), s.vendorNotes].filter(Boolean).join("; ");
    if (s.medicationPlan) {
      const plan = s.medicationPlan;
      next.checklist = next.checklist.map((c) => (c.id === "anticoag" && !c.detail ? { ...c, detail: plan } : c));
      if (!next.schedulerNotes.includes(plan)) next.schedulerNotes = [next.schedulerNotes.trim(), `Medication plan: ${plan}`].filter(Boolean).join("\n");
    }
  }
  return next;
}

/** No-AI fallback: best catalog matches for a short phrase. Always low confidence so the clinician picks. */
export function offlineSuggestion(text: string): Suggestion {
  const side = sideFromText(text);
  const matches = searchProcedures(text, 5);
  return {
    procedures: matches.map((m) => ({ id: m.procedure.id, side: procedureById(m.procedure.id)?.sided ? side : null, evidence: text.trim(), confidence: "low" })),
    unmatched: matches.length ? [] : [text.trim()],
    diagnoses: [],
    urgency: null,
    datePlan: null,
    dateFrom: null,
    dateTo: null,
    anesthesia: null,
    admission: null,
    equipment: [],
    vendorNotes: null,
    medicationPlan: null,
    questions: matches.length ? ["AI is off: tick the procedure that matches."] : ["No catalog match. Try other words or browse the list."],
    summary: matches.length ? "Closest catalog matches (no AI)." : "No match found.",
  };
}
