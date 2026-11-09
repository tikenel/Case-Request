// The surgery request: what the surgeon or APP fills in, the booking defaults
// derived from the procedures, the pre-op checklist derived from the chart,
// the completeness check, and the step-by-step sheet a new scheduler follows.
import { procedureById, type Admission, type Anesthesia, type Blood, type Procedure, type Setting } from "./catalog.js";
import type { ChartSummary } from "./chart.js";
import type { Side } from "./match.js";
import { CLASS_LABEL, planLine, type MedPlan } from "./meds.js";
import { defaultLocation, type Location } from "./locations.js";

export type Urgency = "Elective" | "Urgent" | "Emergent";
export type DatePlan = "First available" | "On date" | "No later than" | "Between dates";
export type PriorAuth = "Unknown" | "Not required" | "Needed" | "Submitted" | "Approved";

export interface RequestedProcedure { id: string; side: Side | null; note: string }
export interface DiagnosisPick { code: string; display: string }
export interface CheckItem { id: string; label: string; why: string; done: boolean; detail: string }

export interface SurgeryRequest {
  surgeon: string;
  requestedBy: string;
  procedures: RequestedProcedure[];
  diagnoses: DiagnosisPick[];
  urgency: Urgency;
  datePlan: DatePlan;
  dateFrom: string;
  dateTo: string;
  /** Booking details. null means "use the default derived from the procedures". */
  /** Booking site (UMH Main OR, Hybrid OR, Sole Mia, Lennar, Doral). null: use the default for the procedures. */
  location: Location | null;
  anesthesia: Anesthesia | null;
  minutes: number | null;
  admission: Admission | null;
  extraEquipment: string;
  vendorNotes: string;
  priorAuth: PriorAuth;
  checklist: CheckItem[];
  /** Continue/hold decisions for anticoagulants, antiplatelets and kidney-risk drugs on file. */
  medPlans: MedPlan[];
  /** Contrast allergy on file and the case may use contrast: premedication ordered, or no contrast planned. */
  premed: { status: "ordered" | "no contrast" | null; regimen: string };
  schedulerNotes: string;
  /** Free text the surgeon typed or the note excerpt the AI read, kept for the sheet. */
  source: string;
}

export function emptyRequest(user: string | null): SurgeryRequest {
  return {
    surgeon: user ?? "",
    requestedBy: user ?? "",
    procedures: [],
    diagnoses: [],
    urgency: "Elective",
    datePlan: "First available",
    dateFrom: "",
    dateTo: "",
    location: null,
    anesthesia: null,
    minutes: null,
    admission: null,
    extraEquipment: "",
    vendorNotes: "",
    priorAuth: "Unknown",
    checklist: [],
    medPlans: [],
    premed: { status: null, regimen: "" },
    schedulerNotes: "",
    source: "",
  };
}

const SETTING_RANK: Setting[] = ["Main OR", "Hybrid OR"];
const ANES_RANK: Anesthesia[] = ["Local/Sedation", "MAC", "General"];
const ADMIT_RANK: Admission[] = ["Outpatient", "23h observation", "Admission (telemetry)", "Admission (ICU)"];
const BLOOD_RANK: Blood[] = ["None", "Type & screen", "Type & cross"];
const top = <T>(rank: T[], vals: T[], fallback: T) => vals.reduce((a, b) => (rank.indexOf(b) > rank.indexOf(a) ? b : a), fallback);
const uniq = (xs: string[]) => [...new Set(xs)];

/** Minutes an add-on adds to the booking when listed with its primary. */
export const ADD_ON_MINUTES = 20;

export interface Derived {
  procedures: Procedure[];
  setting: Setting;
  anesthesia: Anesthesia;
  minutes: number;
  admission: Admission;
  blood: Blood;
  contrast: boolean;
  vendor: boolean;
  imaging: string[];
  equipment: string[];
}

/** Booking defaults for a set of procedures: the most demanding room, anesthetic and stay wins. */
export function derive(req: Pick<SurgeryRequest, "procedures">): Derived {
  const procs = req.procedures.map((r) => procedureById(r.id)).filter((p): p is Procedure => Boolean(p));
  const primaries = procs.filter((p) => !p.addOn);
  return {
    procedures: procs,
    setting: top(SETTING_RANK, procs.map((p) => p.setting), "Main OR"),
    anesthesia: top(ANES_RANK, procs.map((p) => p.anesthesia), "Local/Sedation"),
    minutes: bookingMinutes(primaries, procs.length - primaries.length),
    admission: top(ADMIT_RANK, procs.map((p) => p.admission), "Outpatient"),
    blood: top(BLOOD_RANK, procs.map((p) => p.blood), "None"),
    contrast: procs.some((p) => p.contrast),
    vendor: procs.some((p) => p.vendor),
    imaging: uniq(procs.flatMap((p) => p.imaging)),
    equipment: uniq(procs.flatMap((p) => p.equipment)),
  };
}

/** Longest primary in full, half of each other primary (shared setup and closure), plus add-ons. Rounded up to 15 min. */
function bookingMinutes(primaries: Procedure[], addOns: number): number {
  if (!primaries.length) return 0;
  const sorted = [...primaries].sort((a, b) => b.minutes - a.minutes);
  const total = sorted[0].minutes + sorted.slice(1).reduce((s, p) => s + p.minutes / 2, 0) + addOns * ADD_ON_MINUTES;
  return Math.ceil(total / 15) * 15;
}

export function booking(req: SurgeryRequest) {
  const d = derive(req);
  return {
    ...d,
    location: req.location ?? defaultLocation(d.setting),
    anesthesia: req.anesthesia ?? d.anesthesia,
    minutes: req.minutes ?? d.minutes,
    admission: req.admission ?? d.admission,
  };
}

/** Pre-op items that apply to this patient and these procedures. Keeps "done" and details already entered. */
export function checklistFor(req: SurgeryRequest, chart: ChartSummary | null): CheckItem[] {
  const b = booking(req);
  const items: Omit<CheckItem, "done" | "detail">[] = [];
  const add = (id: string, label: string, why: string) => items.push({ id, label, why });
  const meds = chart?.meds ?? [];
  const named = (flag: string) => meds.filter((m) => m.flags.includes(flag as never)).map((m) => m.display).join(", ");

  for (const img of b.imaging) add(`img:${img}`, `Imaging on file: ${img}`, "Needed to plan the case and for prior authorization.");
  // Anticoagulant, antiplatelet and kidney-risk decisions live in req.medPlans, not here.
  if (req.medPlans.some((p) => p.cls === "anticoagulant" && p.action === "hold")) add("bridging", "Bridging decided (needed or not)", "An anticoagulant is being held.");
  if (named("sglt2")) add("sglt2", "SGLT2 inhibitor hold instructions", `On ${named("sglt2")}. Usually held before surgery to avoid ketoacidosis; confirm timing with anesthesia.`);
  if (named("glp1") && b.anesthesia !== "Local/Sedation") add("glp1", "GLP-1 agonist: flag for anesthesia review", `On ${named("glp1")}. Delayed gastric emptying affects anesthesia plans.`);
  if (named("insulin") || named("metformin")) add("diabetes", "Diabetes medication instructions for the day of surgery", `On ${[named("insulin"), named("metformin")].filter(Boolean).join(", ")}.`);
  if (b.contrast) {
    const egfr = chart?.labs.egfr?.value;
    if (egfr === undefined) add("renal", "Recent creatinine/eGFR before contrast", "Contrast case; no recent eGFR in the chart.");
    else if (egfr < 45) add("renal", "Renal protection plan for contrast (hydration, limit contrast, CO2 if available)", `eGFR ${egfr}. Contrast case.`);
  }
  if (chart?.allergyStatus === "not on file") add("allergy-history", "Allergy history taken and entered in the chart", "The chart says allergies are not on file.");
  if (b.anesthesia === "General" || b.anesthesia === "MAC") add("anesthesia", "Pre-anesthesia evaluation booked", `${b.anesthesia} anesthesia.`);
  if (b.admission === "Admission (telemetry)" || b.admission === "Admission (ICU)") add("medical", "Medical/cardiac risk assessment if indicated", `${b.admission} after surgery.`);
  if (b.blood !== "None") add("blood", `${b.blood} within the blood bank window`, "Blood bank sample usually expires 72 h before the case.");
  if (b.admission === "Admission (ICU)") add("icu-bed", "ICU bed requested for after surgery", "Post-op ICU admission.");
  if (b.admission === "Admission (telemetry)") add("bed", "Telemetry bed requested for after surgery", "Post-op telemetry admission.");
  if (b.admission === "23h observation") add("bed", "Observation bed requested for after surgery", "23-hour observation.");
  if (b.vendor) add("vendor", "Device ordered / vendor rep confirmed for the date", "One or more procedures need a device or rep.");
  if (req.priorAuth !== "Not required" && req.urgency !== "Emergent") add("auth", "Prior authorization started with the codes and diagnosis below", "Most payers need authorization for elective vascular procedures.");
  if (req.procedures.some((r) => procedureById(r.id)?.category === "Venous" && !procedureById(r.id)?.addOn)) add("venous-criteria", "Payer criteria documented (compression trial, reflux times, symptoms)", "Venous ablation coverage depends on documented conservative therapy.");
  if (req.procedures.some((r) => procedureById(r.id)?.category === "Dialysis access – open")) add("access-arm", "Protect the access arm: no IV/blood draws, nephrology aware of date", "Dialysis access case.");
  const k = chart?.labs.potassium?.value;
  if (k !== undefined && k > 5.5 && (chart?.problems.some((p) => /end stage renal|esrd|n18\.6/i.test(`${p.code} ${p.display}`)) ?? false))
    add("dialysis-timing", "Dialysis the day before surgery", `ESRD with potassium ${k}.`);

  const prev = new Map(req.checklist.map((c) => [c.id, c]));
  return items.map((i) => ({ ...i, done: prev.get(i.id)?.done ?? false, detail: prev.get(i.id)?.detail ?? "" }));
}

/** Contrast allergies on file. */
export function contrastAllergies(chart: ChartSummary | null): string[] {
  return chart?.allergies.filter((a) => a.contrast).map((a) => a.display) ?? [];
}

/** The case may use contrast: a contrast procedure, or imaging equipment such as a C-arm completion angiogram. */
export function mayUseContrast(req: SurgeryRequest): boolean {
  const b = booking(req);
  return b.contrast || b.equipment.some((e) => /c-arm|fluoro|angiogra|power injector|fixed imaging/i.test(e));
}

/** Show the premedication prompt: contrast allergy on file and the case may use contrast. */
export function needsPremedPrompt(req: SurgeryRequest, chart: ChartSummary | null): boolean {
  return req.procedures.length > 0 && contrastAllergies(chart).length > 0 && mayUseContrast(req);
}

export interface Issue { level: "error" | "warning"; field: string; message: string }

/** Everything that would make a scheduler call back. Errors block sending; warnings don't. */
export function validate(req: SurgeryRequest, today = new Date(), chart: ChartSummary | null = null): Issue[] {
  const out: Issue[] = [];
  const err = (field: string, message: string) => out.push({ level: "error", field, message });
  const warn = (field: string, message: string) => out.push({ level: "warning", field, message });
  const iso = today.toISOString().slice(0, 10);

  if (!req.surgeon.trim()) err("surgeon", "Name the surgeon.");
  if (!req.procedures.length) err("procedures", "Add at least one procedure.");
  const procs = req.procedures.map((r) => ({ r, p: procedureById(r.id) }));
  for (const { r, p } of procs) {
    if (!p) err("procedures", `Unknown procedure ${r.id}.`);
    else if (p.sided && !r.side) err("procedures", `Choose a side for "${p.name}".`);
    else if (p.verify) warn("procedures", `${p.cpt}: ${p.verify}`);
  }
  if (procs.length && procs.every(({ p }) => p?.addOn)) err("procedures", "Add-on codes need a primary procedure.");
  if (!req.diagnoses.length) err("diagnoses", "Add the diagnosis (needed for authorization and booking).");

  if (req.datePlan !== "First available" && !req.dateFrom) err("date", "Enter the requested date.");
  if (req.dateFrom && req.dateFrom < iso) err("date", "The requested date is in the past.");
  if (req.datePlan === "Between dates") {
    if (!req.dateTo) err("date", "Enter the end of the date window.");
    else if (req.dateFrom && req.dateTo < req.dateFrom) err("date", "The date window ends before it starts.");
  }
  if (req.urgency === "Emergent" && req.datePlan !== "First available") {
    const days = req.dateFrom ? (Date.parse(req.dateFrom) - Date.parse(iso)) / 86_400_000 : 0;
    if (days > 2) warn("date", "Emergent cases are usually booked within 48 hours; check the date or the urgency.");
  }
  if (req.urgency === "Emergent") warn("urgency", "Emergent: call the OR desk directly as well as sending this request.");

  const b = booking(req);
  if (req.procedures.length && !b.location) err("location", "Choose the location.");
  if (b.vendor && !req.vendorNotes.trim()) warn("vendor", "A device or vendor rep is needed. Add the device, size or company if known.");
  if (req.urgency !== "Emergent" && req.priorAuth === "Unknown") warn("auth", "Say whether prior authorization is needed.");
  for (const m of req.medPlans) {
    const name = `${m.med} (${CLASS_LABEL[m.cls].toLowerCase()})`;
    if (!m.action) (m.cls === "anticoagulant" ? err : warn)("meds", `Continue or hold ${name}?`);
    else if (m.action === "hold" && !(m.holdDays && m.holdDays > 0)) err("meds", `Enter how many days to hold ${m.med}.`);
  }
  if (needsPremedPrompt(req, chart) && !req.premed.status)
    err("premed", `Contrast allergy (${contrastAllergies(chart).join(", ")}): order premedication, or confirm no contrast will be used.`);
  return out;
}

export function sideLabel(p: Procedure, side: Side | null) {
  return p.sided && side ? `${side.toUpperCase()} ` : "";
}

export function dateLine(req: SurgeryRequest): string {
  switch (req.datePlan) {
    case "First available": return "First available";
    case "On date": return `On ${req.dateFrom}`;
    case "No later than": return `No later than ${req.dateFrom}`;
    case "Between dates": return `Between ${req.dateFrom} and ${req.dateTo}`;
  }
}

export interface PacketStep { title: string; lines: string[] }

/** The scheduler's instruction sheet: what to book, in what order, with every detail they'd otherwise ask for. */
export function schedulerPacket(req: SurgeryRequest, chart: ChartSummary | null): PacketStep[] {
  const b = booking(req);
  const pt = chart?.patient;
  const procLines = req.procedures.map((r) => {
    const p = procedureById(r.id)!;
    return `${sideLabel(p, r.side)}${p.name} — CPT ${p.cpt}${p.addOn ? " (add-on)" : ""}${r.note ? ` — ${r.note}` : ""}`;
  });
  const steps: PacketStep[] = [
    {
      title: "1. Patient",
      lines: [
        pt ? `${pt.name}${pt.mrn ? ` · MRN ${pt.mrn}` : ""}${pt.birthDate ? ` · DOB ${pt.birthDate}` : ""}${pt.age !== null ? ` (${pt.age} y)` : ""}` : "Patient from the open chart",
        ...(pt?.phone ? [`Phone: ${pt.phone}`] : []),
        ...(chart?.coverage.length ? chart.coverage.map((c) => `Insurance: ${c.payer}${c.plan ? ` (${c.plan})` : ""}${c.memberId ? ` · member ${c.memberId}` : ""}`) : ["Insurance: check registration"]),
      ],
    },
    {
      title: "2. Case to book",
      lines: [
        ...procLines,
        `Diagnosis: ${req.diagnoses.map((d) => `${d.code} ${d.display}`).join("; ") || "—"}`,
        `Surgeon: ${req.surgeon}${req.requestedBy && req.requestedBy !== req.surgeon ? ` (requested by ${req.requestedBy})` : ""}`,
      ],
    },
    {
      title: "3. When",
      lines: [`Urgency: ${req.urgency}`, `Date: ${dateLine(req)}`, ...(req.urgency === "Emergent" ? ["Call the OR desk now; do not wait for a block."] : [])],
    },
    {
      title: "4. Room and time",
      lines: [
        `Location: ${b.location ?? "not chosen"}`,
        `Book ${b.minutes} minutes${req.minutes === null ? " (typical; surgeon may adjust)" : ""}`,
        `Anesthesia: ${b.anesthesia}`,
        `After surgery: ${b.admission}`,
        `Blood bank: ${b.blood}`,
        ...(b.contrast ? ["Uses contrast (fluoroscopy room or C-arm needed)"] : []),
      ],
    },
    {
      title: "5. Equipment and vendors",
      lines: [
        ...b.equipment,
        ...(req.extraEquipment.trim() ? req.extraEquipment.split("\n").filter(Boolean) : []),
        ...(b.vendor ? [`Vendor/device: ${req.vendorNotes.trim() || "needed — ask the surgeon which device and size"}`] : []),
      ].concat(b.equipment.length || req.extraEquipment.trim() || b.vendor ? [] : ["Standard tray only"]),
    },
    {
      title: "6. Insurance",
      lines: [
        `Prior authorization: ${req.priorAuth}`,
        ...(req.priorAuth === "Needed" ? [`Submit with CPT ${uniqCodes(req).join(", ")} and ICD-10 ${req.diagnoses.map((d) => d.code).join(", ")}.`] : []),
      ],
    },
    {
      title: "7. Medications and medical history",
      lines: [
        ...(needsPremedPrompt(req, chart)
          ? [req.premed.status === "ordered" ? `CONTRAST ALLERGY: premedication ordered${req.premed.regimen.trim() ? ` (${req.premed.regimen.trim()})` : ""}`
            : req.premed.status === "no contrast" ? "Contrast allergy on file: no contrast will be used"
            : "CONTRAST ALLERGY: premedication not yet ordered"]
          : []),
        ...req.medPlans.map((m) => planLine(m, req.datePlan === "On date" ? req.dateFrom || null : null)),
        ...(chart ? otherMeds(chart, req.medPlans) : []),
        ...(chart?.problems.length ? [`Medical problems: ${chart.problems.map((p) => p.display).join("; ")}`] : []),
        ...(chart?.allergies.length ? [`Allergies: ${chart.allergies.map((a) => a.display).join("; ")}`] : chart?.allergyStatus === "none known" ? ["Allergies: none known"] : chart?.allergyStatus === "not on file" ? ["Allergies: not on file"] : []),
      ].concat(req.medPlans.length || chart?.meds.length || chart?.problems.length ? [] : ["None on file."]),
    },
    {
      title: "8. Before the date (check each)",
      lines: req.checklist.length
        ? req.checklist.map((c) => `[${c.done ? "x" : " "}] ${c.label}${c.detail ? ` — ${c.detail}` : ""} (${c.why})`)
        : ["Nothing extra beyond standard pre-op."],
    },
  ];
  if (req.schedulerNotes.trim()) steps.push({ title: "9. Notes from the surgeon", lines: req.schedulerNotes.split("\n").filter(Boolean) });
  return steps;
}

function otherMeds(chart: ChartSummary, plans: MedPlan[]): string[] {
  const decided = new Set(plans.map((p) => p.med));
  const rest = chart.meds.map((m) => m.display).filter((d) => !decided.has(d));
  return rest.length ? [`Other active medications: ${rest.join("; ")}`] : [];
}

function uniqCodes(req: SurgeryRequest) {
  return uniq(req.procedures.map((r) => procedureById(r.id)?.cpt).filter((c): c is string => Boolean(c)));
}

/** One line for the OR schedule, e.g. "RIGHT Femoral-popliteal bypass with prosthetic graft (35656) · General · 180 min · Main OR". */
export function postingLine(req: SurgeryRequest): string {
  const b = booking(req);
  const procs = req.procedures
    .map((r) => ({ r, p: procedureById(r.id)! }))
    .filter(({ p }) => p && !p.addOn)
    .map(({ r, p }) => `${sideLabel(p, r.side)}${p.name} (${p.cpt})`);
  return [procs.join(" + "), b.anesthesia, `${b.minutes} min`, b.location].filter(Boolean).join(" · ");
}

export function packetText(req: SurgeryRequest, chart: ChartSummary | null): string {
  const head = ["VASCULAR SURGERY SCHEDULING REQUEST", postingLine(req), ""];
  const body = schedulerPacket(req, chart).flatMap((s) => [s.title, ...s.lines.map((l) => `  ${l}`), ""]);
  return [...head, ...body].join("\n").trim();
}
