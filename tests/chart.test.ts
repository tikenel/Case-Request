import { describe, expect, it } from "vitest";
import { ageOn, allergies, coverage, htmlToText, labs, medications, noteRefs, noteText, patientFacts, problems, resourcesOf, rtfToText } from "../shared/chart";

describe("chart parsing", () => {
  it("reads patient name, MRN and age", () => {
    const p = patientFacts(
      {
        resourceType: "Patient", id: "abc", gender: "female", birthDate: "1950-12-01",
        name: [{ use: "usual", text: "Jane Q" }, { use: "official", given: ["Jane"], family: "Doe" }],
        identifier: [{ type: { text: "EPI" }, value: "E1" }, { type: { text: "MRN" }, value: "M123" }],
        telecom: [{ system: "email", value: "x" }, { system: "phone", value: "555" }],
      },
      new Date("2026-11-08"),
    );
    expect(p).toEqual({ id: "abc", name: "Jane Doe", mrn: "M123", birthDate: "1950-12-01", age: 75, sex: "female", phone: "555" });
    expect(ageOn("1950-11-08", new Date("2026-11-08"))).toBe(76);
  });

  it("keeps active problems once, preferring the ICD-10 code", () => {
    const out = problems([
      { resourceType: "Condition", clinicalStatus: { coding: [{ code: "active" }] }, code: { text: "PAD", coding: [{ system: "http://snomed.info/sct", code: "1" }, { system: "http://hl7.org/fhir/sid/icd-10-cm", code: "I70.221" }] } },
      { resourceType: "Condition", clinicalStatus: { coding: [{ code: "resolved" }] }, code: { text: "Old" } },
      { resourceType: "Condition", code: { text: "PAD", coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: "I70.221" }] } },
    ]);
    expect(out).toEqual([{ code: "I70.221", system: "http://hl7.org/fhir/sid/icd-10-cm", display: "PAD" }]);
  });

  it("flags anticoagulants, SGLT2s and contrast allergy", () => {
    const meds = medications([
      { resourceType: "MedicationRequest", status: "active", medicationCodeableConcept: { text: "ELIQUIS 5 MG tablet" } },
      { resourceType: "MedicationRequest", status: "active", medicationReference: { display: "Jardiance 10 mg" } },
      { resourceType: "MedicationRequest", status: "stopped", medicationCodeableConcept: { text: "warfarin" } },
    ]);
    expect(meds).toEqual([{ display: "ELIQUIS 5 MG tablet", flags: ["anticoagulant"] }, { display: "Jardiance 10 mg", flags: ["sglt2"] }]);
    expect(allergies([{ resourceType: "AllergyIntolerance", code: { text: "Iodinated contrast" } }, { resourceType: "AllergyIntolerance", code: { text: "Penicillin" } }]))
      .toEqual([{ display: "Iodinated contrast", contrast: true }, { display: "Penicillin", contrast: false }]);
  });

  it("takes the latest lab by LOINC code, including '>60' strings", () => {
    const out = labs([
      { resourceType: "Observation", code: { coding: [{ code: "2160-0" }] }, valueQuantity: { value: 1.1, unit: "mg/dL" }, effectiveDateTime: "2026-01-01" },
      { resourceType: "Observation", code: { coding: [{ code: "2160-0" }] }, valueQuantity: { value: 1.6, unit: "mg/dL" }, effectiveDateTime: "2026-10-01" },
      { resourceType: "Observation", code: { coding: [{ code: "98979-8" }] }, valueString: ">60", effectiveDateTime: "2026-10-01" },
    ]);
    expect(out.creatinine).toEqual({ value: 1.6, unit: "mg/dL", date: "2026-10-01" });
    expect(out.egfr?.value).toBe(60);
  });

  it("reads coverage and notes from bundles", () => {
    const bundle = { resourceType: "Bundle", entry: [
      { resource: { resourceType: "Coverage", status: "active", payor: [{ display: "Aetna" }], subscriberId: "W1" } },
      { resource: { resourceType: "DocumentReference", id: "n1", date: "2026-11-01", type: { text: "Progress Notes" }, author: [{ display: "Dr A" }], content: [{ attachment: { url: "Binary/1", contentType: "text/html" } }] } },
      { resource: { resourceType: "DocumentReference", id: "n2", date: "2026-11-05", type: { text: "Consult" }, content: [{ attachment: { url: "Binary/2", contentType: "text/rtf" } }] } },
    ] };
    expect(coverage(resourcesOf(bundle, "Coverage"))).toEqual([{ payer: "Aetna", memberId: "W1", plan: null }]);
    expect(noteRefs(resourcesOf(bundle, "DocumentReference")).map((n) => n.id)).toEqual(["n2", "n1"]);
  });

  it("turns HTML and RTF notes into text", () => {
    expect(htmlToText("<p>Plan:</p><div>R fem-pop&nbsp;bypass</div><script>x</script>")).toBe("Plan:\nR fem-pop bypass");
    expect(rtfToText("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Plan:\\par Right \\b CEA\\b0}")).toBe("Plan:\nRight CEA");
    expect(noteText("text/plain", "  x  ")).toBe("x");
  });
});

describe("Epic allergy placeholders", () => {
  // Shapes copied from Epic sandbox responses (test patient Omar Optime).
  const notOnFile = { resourceType: "AllergyIntolerance", clinicalStatus: { coding: [{ code: "active", display: "Active" }] }, verificationStatus: { coding: [{ code: "unconfirmed", display: "Unconfirmed" }] }, code: { coding: [{ system: "http://snomed.info/sct", code: "1631000175102", display: "Patient not asked" }], text: "Not on File" } };
  const nka = { resourceType: "AllergyIntolerance", clinicalStatus: { coding: [{ code: "active" }] }, code: { coding: [{ system: "http://snomed.info/sct", code: "716186003" }], text: "No Known Allergies" } };
  const pcn = { resourceType: "AllergyIntolerance", clinicalStatus: { coding: [{ code: "active" }] }, code: { text: "Penicillins" } };
  it("doesn't list placeholders as allergies and reports the status", async () => {
    const { allergies, allergyStatus } = await import("../shared/chart");
    expect(allergies([notOnFile])).toEqual([]);
    expect(allergyStatus([notOnFile])).toBe("not on file");
    expect(allergyStatus([])).toBe("not on file");
    expect(allergies([nka])).toEqual([]);
    expect(allergyStatus([nka])).toBe("none known");
    expect(allergies([nka, pcn])).toEqual([{ display: "Penicillins", contrast: false }]);
    expect(allergyStatus([pcn])).toBe("recorded");
  });
});
