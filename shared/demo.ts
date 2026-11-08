// A made-up patient for trying the app without Epic (?demo=1). No real data.
import type { ChartSummary } from "./chart.js";

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
