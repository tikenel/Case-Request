import { describe, expect, it } from "vitest";
import { DEMO_CHART } from "../shared/demo";
import { noteResource, serviceRequests } from "../shared/fhirOut";
import { booking, checklistFor, derive, emptyRequest, packetText, postingLine, validate, type SurgeryRequest } from "../shared/request";
import { applySuggestion, defaultAccepted, offlineSuggestion, type Suggestion } from "../shared/suggestion";

const today = new Date("2026-11-08T12:00:00Z");
const base = (over: Partial<SurgeryRequest> = {}): SurgeryRequest => ({
  ...emptyRequest("Dr Surgeon"),
  procedures: [{ id: "35656", side: "Right", note: "" }],
  diagnoses: [{ code: "I70.221", display: "Rest pain right leg" }],
  priorAuth: "Needed",
  ...over,
});

describe("booking defaults", () => {
  it("takes the most demanding room and stay, and adds time for extra work", () => {
    const d = derive({ procedures: [{ id: "34705", side: null, note: "" }, { id: "34713", side: "Right", note: "" }, { id: "34713", side: "Left", note: "" }] });
    expect(d.setting).toBe("Hybrid OR");
    expect(d.minutes).toBe(225); // 180 + 2 add-ons × 20, rounded up to 15
    expect(d.vendor).toBe(true);
    const two = derive({ procedures: [{ id: "35371", side: "Right", note: "" }, { id: "37221", side: "Right", note: "" }] });
    expect(two.minutes).toBe(210); // 150 + 120/2
    expect(two.setting).toBe("Main OR");
  });
  it("lets the clinician override defaults", () => {
    expect(booking(base({ minutes: 240, anesthesia: "Regional" }))).toMatchObject({ minutes: 240, anesthesia: "Regional", setting: "Main OR" });
  });
});

describe("pre-op checklist", () => {
  it("builds items from the chart and keeps what was entered", () => {
    const r = base({ procedures: [{ id: "37226", side: "Right", note: "" }] });
    const ids = checklistFor(r, DEMO_CHART).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["anticoag", "antiplatelet", "sglt2", "diabetes", "renal", "contrast-allergy", "auth"]));
    const kept = checklistFor({ ...r, checklist: [{ id: "anticoag", label: "", why: "", done: false, detail: "Hold 3 days" }] }, DEMO_CHART);
    expect(kept.find((c) => c.id === "anticoag")?.detail).toBe("Hold 3 days");
  });
  it("skips contrast items for an open case", () => {
    const ids = checklistFor(base(), DEMO_CHART).map((c) => c.id);
    expect(ids).not.toContain("contrast-allergy");
    expect(ids).toContain("anesthesia");
  });
});

describe("validation", () => {
  it("passes a complete request", () => {
    const r = base();
    const withPlan = { ...r, checklist: checklistFor(r, DEMO_CHART).map((c) => (c.id === "anticoag" ? { ...c, detail: "Hold 3 days" } : c)) };
    expect(validate(withPlan, today).filter((i) => i.level === "error")).toEqual([]);
  });
  it("catches what schedulers call back about", () => {
    const r = base({ procedures: [{ id: "35656", side: null, note: "" }, { id: "34713", side: "Left", note: "" }], diagnoses: [], datePlan: "Between dates", dateFrom: "2026-11-01" });
    const errs = validate(r, today).filter((i) => i.level === "error").map((i) => i.message);
    expect(errs).toEqual(expect.arrayContaining([
      expect.stringContaining("Choose a side"),
      expect.stringContaining("diagnosis"),
      expect.stringContaining("in the past"),
      expect.stringContaining("end of the date window"),
    ]));
    expect(validate(base({ procedures: [{ id: "34713", side: "Left", note: "" }] }), today).some((i) => i.message.includes("primary"))).toBe(true);
  });
  it("requires an anticoagulant plan when the patient is on one", () => {
    const r = base();
    expect(validate({ ...r, checklist: checklistFor(r, DEMO_CHART) }, today).some((i) => i.field === "checklist" && i.level === "error")).toBe(true);
  });
});

describe("scheduler sheet and FHIR", () => {
  it("writes the posting line and packet", () => {
    const r = base();
    expect(postingLine(r)).toBe("RIGHT Femoral-popliteal bypass with prosthetic graft (35656) · General · 180 min · Main OR");
    const text = packetText({ ...r, checklist: checklistFor(r, DEMO_CHART) }, DEMO_CHART);
    expect(text).toContain("CPT 35656");
    expect(text).toContain("Test Patient (demo) · MRN DEMO0001");
    expect(text).toContain("Submit with CPT 35656 and ICD-10 I70.221");
  });
  it("builds a note and one ServiceRequest per procedure", () => {
    const note = noteResource(DEMO_CHART, "hello");
    expect(note.content[0].attachment.data).toBe(Buffer.from("hello").toString("base64"));
    const srs = serviceRequests(base({ datePlan: "Between dates", dateFrom: "2026-11-20", dateTo: "2026-11-30", urgency: "Urgent" }), DEMO_CHART, "req-1");
    expect(srs).toHaveLength(1);
    expect(srs[0]).toMatchObject({ priority: "urgent", occurrencePeriod: { start: "2026-11-20", end: "2026-11-30" }, code: { coding: [{ code: "35656" }] } });
  });
});

describe("suggestions", () => {
  const s: Suggestion = {
    procedures: [
      { id: "35656", side: "Right", evidence: "fem-pop with PTFE", confidence: "high" },
      { id: "35556", side: "Right", evidence: "fem-pop", confidence: "low" },
    ],
    unmatched: [], diagnoses: [{ code: "I70.221", display: "Rest pain", evidence: "rest pain" }],
    urgency: "Urgent", datePlan: "Between dates", dateFrom: "2026-11-08", dateTo: "2026-11-29",
    anesthesia: "General", admission: null, equipment: ["6 mm PTFE"], vendorNotes: null,
    medicationPlan: "Hold apixaban 3 days, no bridging", questions: [], summary: "",
  };
  it("pre-ticks only confident items and merges them", () => {
    const a = defaultAccepted(s);
    expect([...a.procedures]).toEqual([0]);
    const start = { ...emptyRequest("Dr"), checklist: [{ id: "anticoag", label: "", why: "", done: false, detail: "" }] };
    const r = applySuggestion(start, s, a);
    expect(r.procedures).toEqual([{ id: "35656", side: "Right", note: "" }]);
    expect(r).toMatchObject({ urgency: "Urgent", datePlan: "Between dates", dateTo: "2026-11-29", anesthesia: "General", extraEquipment: "6 mm PTFE" });
    expect(r.checklist[0].detail).toBe("Hold apixaban 3 days, no bridging");
    expect(applySuggestion(r, s, a).procedures).toHaveLength(1);
  });
  it("offers catalog matches without AI", () => {
    expect(offlineSuggestion("left BKA").procedures[0]).toMatchObject({ id: "27880", side: "Left", confidence: "low" });
  });
});
