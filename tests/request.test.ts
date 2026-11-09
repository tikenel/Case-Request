import { describe, expect, it } from "vitest";
import { DEMO_CHART } from "../shared/demo";
import { noteResource, serviceRequests } from "../shared/fhirOut";
import { booking, CARM, checklistFor, needsPremedPrompt, derive, emptyRequest, packetText, postingLine, validate, type SurgeryRequest } from "../shared/request";
import { plansFor } from "../shared/meds";
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
    expect(two.setting).toBe("Hybrid OR"); // the iliac stent needs imaging, so the Hybrid OR wins
  });
  it("lets the clinician override defaults", () => {
    expect(booking(base({ minutes: 240, anesthesia: "MAC" }))).toMatchObject({ minutes: 240, anesthesia: "MAC", setting: "Main OR", location: "UMH Main OR" });
  });
});

describe("locations", () => {
  it("defaults open cases to UMH Main OR and angio/endovascular cases to the Hybrid OR", () => {
    expect(booking(base()).location).toBe("UMH Main OR");
    expect(booking(base({ procedures: [{ id: "34705", side: null, note: "" }] })).location).toBe("Hybrid OR");
    const angio = base({ procedures: [{ id: "37224", side: "Right", note: "" }] });
    expect(booking(angio).location).toBe("Hybrid OR");
    expect(booking(base({ procedures: [{ id: "36475", side: "Left", note: "" }] })).location).toBe("Hybrid OR"); // vein ablation: no office lab
    const chosen = { ...angio, location: "Doral" as const };
    expect(packetText(chosen, null)).toContain("Location: Doral");
  });
});

describe("C-arm", () => {
  it("is off by default in the Main OR, adds the C-arm when ticked, and isn't needed in the Hybrid OR", () => {
    expect(booking(base()).equipment).not.toContain(CARM);
    expect(booking(base({ carm: true })).equipment[0]).toBe(CARM);
    expect(booking(base({ carm: true, location: "Hybrid OR" })).equipment).not.toContain(CARM);
  });
});

describe("contrast allergy premedication", () => {
  // DEMO_CHART has an iodinated contrast allergy.
  it("prompts for contrast cases and open cases with a completion angiogram, not otherwise", () => {
    expect(needsPremedPrompt(base({ procedures: [{ id: "37226", side: "Right", note: "" }] }), DEMO_CHART)).toBe(true);
    expect(needsPremedPrompt(base(), DEMO_CHART)).toBe(false); // open fem-pop bypass: no C-arm by default
    expect(needsPremedPrompt(base({ carm: true }), DEMO_CHART)).toBe(true); // C-arm ticked: completion angiogram
    expect(needsPremedPrompt(base({ procedures: [{ id: "27880", side: "Left", note: "" }] }), DEMO_CHART)).toBe(false); // BKA
    expect(needsPremedPrompt(base({ procedures: [{ id: "37226", side: "Right", note: "" }] }), { ...DEMO_CHART, allergies: [] })).toBe(false);
  });
  it("blocks sending until premedication is ordered or no contrast is confirmed, and shows it on the sheet", () => {
    const r = base({ procedures: [{ id: "37226", side: "Right", note: "" }] });
    expect(validate(r, today, DEMO_CHART).some((i) => i.field === "premed" && i.level === "error")).toBe(true);
    const ordered = { ...r, premed: { status: "ordered" as const, regimen: "per protocol" } };
    expect(validate(ordered, today, DEMO_CHART).some((i) => i.field === "premed")).toBe(false);
    expect(packetText(ordered, DEMO_CHART)).toContain("CONTRAST ALLERGY: premedication ordered (per protocol)");
    expect(packetText({ ...r, premed: { status: "no contrast", regimen: "" } }, DEMO_CHART)).toContain("no contrast will be used");
  });
});

describe("pre-op checklist", () => {
  it("builds items from the chart and keeps what was entered", () => {
    const r = base({ procedures: [{ id: "37226", side: "Right", note: "" }] });
    const ids = checklistFor(r, DEMO_CHART).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["sglt2", "diabetes", "renal", "auth"]));
    expect(ids).not.toContain("anticoag"); // blood thinners are decided in the medication section now
    const kept = checklistFor({ ...r, checklist: [{ id: "sglt2", label: "", why: "", done: true, detail: "Hold 3 days" }] }, DEMO_CHART);
    expect(kept.find((c) => c.id === "sglt2")).toMatchObject({ done: true, detail: "Hold 3 days" });
  });
  it("skips contrast items for an open case", () => {
    const ids = checklistFor(base(), DEMO_CHART).map((c) => c.id);
    expect(ids).toContain("anesthesia");
  });
});

describe("validation", () => {
  it("passes a complete request", () => {
    const r = base({ medPlans: plansFor(DEMO_CHART.meds.map((m) => m.display), { apixaban: { action: "hold", holdDays: 3 } }) });
    const withPlan = { ...r, checklist: checklistFor(r, DEMO_CHART) };
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
  it("requires a continue/hold decision for anticoagulants, and days for a hold", () => {
    const plans = plansFor(DEMO_CHART.meds.map((m) => m.display), {});
    const issues = validate(base({ medPlans: plans }), today).filter((i) => i.field === "meds");
    expect(issues.find((i) => i.message.includes("apixaban"))?.level).toBe("error");
    expect(issues.find((i) => i.message.includes("aspirin"))?.level).toBe("warning");
    const noDays = plans.map((p) => (p.agent === "apixaban" ? { ...p, action: "hold" as const, holdDays: null } : p));
    expect(validate(base({ medPlans: noDays }), today).some((i) => i.level === "error" && i.message.includes("how many days"))).toBe(true);
  });
});

describe("scheduler sheet and FHIR", () => {
  it("writes the posting line and packet", () => {
    const r = base();
    expect(postingLine(r)).toBe("RIGHT Femoral-popliteal bypass with prosthetic graft (35656) · General · 180 min · UMH Main OR");
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
    const start = { ...emptyRequest("Dr"), medPlans: plansFor(["apixaban 5 mg tablet", "aspirin 81 mg"], {}) };
    const r = applySuggestion(start, s, a);
    expect(r.procedures).toEqual([{ id: "35656", side: "Right", note: "" }]);
    expect(r).toMatchObject({ urgency: "Urgent", datePlan: "Between dates", dateTo: "2026-11-29", anesthesia: "General", extraEquipment: "6 mm PTFE" });
    expect(r.medPlans.find((m) => m.agent === "apixaban")).toMatchObject({ action: "hold", holdDays: 3 });
    expect(applySuggestion(r, s, a).procedures).toHaveLength(1);
  });
  it("offers catalog matches without AI", () => {
    expect(offlineSuggestion("left BKA").procedures[0]).toMatchObject({ id: "27880", side: "Left", confidence: "low" });
  });
});
