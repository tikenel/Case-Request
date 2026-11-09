// A made-up patient for trying the app without Epic (?demo=1). No real data.
import type { ChartSummary } from "./chart.js";
import type { TeamMember } from "./team.js";
import type { Tracking } from "./tracking.js";

export const DEMO_NOTE = `VASCULAR SURGERY CLINIC NOTE

HPI: 71 y/o man with lifestyle-limiting right calf claudication at half a block despite 6 months of supervised exercise and cilostazol. Rest pain started 3 weeks ago, worse at night. No tissue loss.

Studies: ABI right 0.42, left 0.88. CTA runoff: right SFA occluded from origin to above-knee popliteal, reconstitutes at the AK popliteal with 2-vessel runoff (AT and peroneal). GSV mapped: right GSV 2.0-2.5 mm, small and sclerotic in the thigh.

PMH: CAD s/p PCI 2019, HTN, T2DM, CKD 3b, AF on apixaban.

Assessment: Right leg chronic limb-threatening ischemia (rest pain) from SFA occlusion.

Plan: Right common femoral to above-knee popliteal bypass with 6 mm PTFE given poor vein. Would like to do this within the next 2-3 weeks. Hold apixaban 3 days prior, no bridging. Continue aspirin and statin. General anesthesia. Admit post-op.`;

export const DEMO_CHART: ChartSummary = {
  patient: { id: "demo-patient", name: "Test Patient (demo)", mrn: "DEMO0001", birthDate: "1955-03-14", age: 71, sex: "male", phone: "555-0100" },
  encounterId: "demo-encounter",
  user: "Demo Surgeon, MD",
  signedIn: { name: "Demo Surgeon, MD", fhirId: "demo-practitioner", npi: "1000000001", credentials: ["MD"], isPhysician: true },
  problems: [
    { code: "I70.221", system: "http://hl7.org/fhir/sid/icd-10-cm", display: "Atherosclerosis of native arteries of right leg with rest pain" },
    { code: "I48.91", system: "http://hl7.org/fhir/sid/icd-10-cm", display: "Atrial fibrillation" },
    { code: "N18.32", system: "http://hl7.org/fhir/sid/icd-10-cm", display: "Chronic kidney disease, stage 3b" },
    { code: "E11.51", system: "http://hl7.org/fhir/sid/icd-10-cm", display: "Type 2 diabetes with peripheral angiopathy" },
  ],
  allergies: [{ display: "Iodinated contrast media", contrast: true }],
  allergyStatus: "recorded",
  meds: [
    { display: "apixaban 5 mg tablet", flags: ["anticoagulant"] },
    { display: "aspirin 81 mg tablet", flags: ["antiplatelet"] },
    { display: "empagliflozin 10 mg tablet", flags: ["sglt2"] },
    { display: "metformin 1000 mg tablet", flags: ["metformin"] },
    { display: "lisinopril 20 mg tablet", flags: ["nephrotoxic"] },
    { display: "atorvastatin 80 mg tablet", flags: [] },
  ],
  labs: {
    egfr: { value: 38, unit: "mL/min/1.73m2", date: "2026-10-30" },
    creatinine: { value: 1.8, unit: "mg/dL", date: "2026-10-30" },
    hemoglobin: { value: 12.1, unit: "g/dL", date: "2026-10-30" },
    potassium: { value: 4.6, unit: "mmol/L", date: "2026-10-30" },
  },
  coverage: [{ payer: "Demo Medicare Advantage", memberId: "XYZ123456", plan: "PPO" }],
  notes: [{ id: "demo-note", title: "Vascular surgery clinic note", date: "2026-11-05", author: "Demo Surgeon, MD", attachments: [{ url: "demo", contentType: "text/plain" }] }],
};

/** Used in demo mode when public/team.json has no members yet. Made-up names. */
export const DEMO_TEAM: TeamMember[] = [
  { name: "Demo Surgeon, MD", role: "Surgeon", npi: "1000000001" },
  { name: "Second Surgeon, MD", role: "Surgeon", npi: "1000000002" },
  { name: "Third Surgeon, DO", role: "Surgeon", npi: "1000000003" },
  { name: "Demo Practitioner, NP", role: "NP", npi: "1000000004" },
];

/** A case partway through scheduling: order signed, case created, not yet on the schedule. */
export const DEMO_TRACKING: Tracking = {
  caseRequests: [{ id: "demo-order", status: "active", title: "CASE REQUEST: VASCULAR SURGERY", authoredOn: "2026-11-06T15:12:00Z", requester: "Demo Surgeon, MD" }],
  surgeries: [{ id: "demo-case", status: "proposed", description: "FEMORAL-POPLITEAL BYPASS [35656 (CPT®)] with Demo Surgeon, MD", start: null, end: null, minutes: 180, surgeon: "Demo Surgeon, MD", location: null, comment: "Waiting on cardiology clearance", created: "2026-11-07" }],
};

/** Patients for the demo "My cases" board. */
export const DEMO_BOARD: { id: string; name: string; tracking: Tracking }[] = [
  { id: "demo-patient", name: "Test Patient (demo)", tracking: DEMO_TRACKING },
  { id: "demo-2", name: "Second Patient (demo)", tracking: { caseRequests: [{ id: "o2", status: "active", title: "CASE REQUEST: VASCULAR SURGERY", authoredOn: "2026-11-02T14:00:00Z", requester: "Demo Surgeon, MD" }], surgeries: [{ id: "c2", status: "booked", description: "CAROTID ENDARTERECTOMY [35301 (CPT®)] with Demo Surgeon, MD", start: "2026-11-18T13:30:00Z", end: "2026-11-18T16:00:00Z", minutes: 150, surgeon: "Demo Surgeon, MD", location: "Main OR 4", comment: null, created: "2026-11-03" }] } },
  { id: "demo-3", name: "Third Patient (demo)", tracking: { caseRequests: [{ id: "o3", status: "active", title: "CASE REQUEST: VASCULAR SURGERY", authoredOn: "2026-11-07T19:40:00Z", requester: "Demo Practitioner, NP" }], surgeries: [] } },
];
