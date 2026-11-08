import { describe, expect, it } from "vitest";
import { defaultPeople, matchMember, parseTeam, surgeonChoices, userFromPractitioner } from "../shared/team";

const team = parseTeam({ members: [
  { name: "Jane Smith, MD", role: "Surgeon", npi: "1111111111" },
  { name: "Ravi Patel, DO", role: "Surgeon" },
  { name: "Ana Lopez, NP", role: "NP", npi: "3333333333" },
  { name: "bad", role: "Janitor" },
  { role: "Surgeon" },
] });

const practitioner = (name: object, extra: object = {}) => ({ resourceType: "Practitioner", id: "p1", name: [name], ...extra });

describe("roster", () => {
  it("keeps well-formed members only", () => {
    expect(team.map((m) => m.name)).toEqual(["Jane Smith, MD", "Ravi Patel, DO", "Ana Lopez, NP"]);
  });

  it("reads the signed-in user's name, NPI and credentials", () => {
    const u = userFromPractitioner(practitioner({ use: "official", given: ["Jane"], family: "Smith", suffix: ["MD"] }, {
      identifier: [{ system: "http://hl7.org/fhir/sid/us-npi", value: "1111111111" }],
    }))!;
    expect(u).toMatchObject({ name: "Jane Smith", npi: "1111111111", isPhysician: true });
    expect(userFromPractitioner(practitioner({ text: "Ana Lopez, NP" }))?.isPhysician).toBe(false);
    expect(userFromPractitioner(practitioner({ text: "Pat Doe" }, { qualification: [{ code: { coding: [{ code: "DO" }] } }] }))?.isPhysician).toBe(true);
  });

  it("matches by NPI, else by name regardless of order and titles", () => {
    expect(matchMember({ name: "Someone Else", npi: "1111111111", fhirId: null, credentials: [], isPhysician: true }, team)?.name).toBe("Jane Smith, MD");
    expect(matchMember({ name: "Patel Ravi", npi: null, fhirId: null, credentials: ["DO"], isPhysician: true }, team)?.name).toBe("Ravi Patel, DO");
  });

  it("makes a signed-in surgeon the operating surgeon, and leaves it blank for an APP", () => {
    const md = { name: "Jane Smith", npi: "1111111111", fhirId: null, credentials: ["MD"], isPhysician: true };
    expect(defaultPeople(md, team)).toEqual({ surgeon: "Jane Smith, MD", requestedBy: "Jane Smith, MD" });
    const np = { name: "Ana Lopez", npi: "3333333333", fhirId: null, credentials: ["NP"], isPhysician: false };
    expect(defaultPeople(np, team)).toEqual({ surgeon: "", requestedBy: "Ana Lopez, NP" });
  });

  it("defaults a physician who isn't on the roster and offers them in the list", () => {
    const guest = { name: "Locum Surgeon", npi: null, fhirId: null, credentials: ["MD"], isPhysician: true };
    expect(defaultPeople(guest, team).surgeon).toBe("Locum Surgeon");
    expect(surgeonChoices(guest, team)).toEqual(["Locum Surgeon", "Jane Smith, MD", "Ravi Patel, DO"]);
    expect(surgeonChoices(null, team)).toEqual(["Jane Smith, MD", "Ravi Patel, DO"]);
  });
});
