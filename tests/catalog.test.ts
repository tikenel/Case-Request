import { describe, expect, it } from "vitest";
import { CATALOG, CATEGORIES, procedureById } from "../shared/catalog";
import { DIAGNOSES } from "../shared/diagnoses";

describe("catalog", () => {
  it("has unique ids and well-formed codes", () => {
    const ids = CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CATALOG) {
      expect(p.cpt, p.name).toMatch(/^\d{5}$/);
      expect(p.id.startsWith(p.cpt), p.id).toBe(true);
      expect(p.minutes).toBeGreaterThan(0);
      expect(p.synonyms.every((s) => s === s.toLowerCase()), p.id).toBe(true);
    }
  });
  it("only reuses a CPT code when the entries are told apart by id", () => {
    const byCode = new Map<string, number>();
    for (const p of CATALOG) byCode.set(p.cpt, (byCode.get(p.cpt) ?? 0) + 1);
    expect([...byCode].filter(([, n]) => n > 1).map(([c]) => c)).toEqual(["37215"]);
  });
  it("covers every category", () => {
    for (const c of CATEGORIES) expect(CATALOG.some((p) => p.category === c), c).toBe(true);
  });
  it("has the core vascular procedures", () => {
    for (const code of ["34705", "33881", "35301", "35656", "35556", "36821", "36830", "36475", "27880", "27590", "21615", "37191"])
      expect(procedureById(code), code).toBeDefined();
  });
  it("has well-formed ICD-10 codes", () => {
    for (const d of DIAGNOSES) expect(d.code).toMatch(/^[A-TV-Z]\d[0-9A-Z](\.[0-9A-Z]{1,4})?$/);
  });
});
