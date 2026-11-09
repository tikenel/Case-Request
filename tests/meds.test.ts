import { describe, expect, it } from "vitest";
import { applyPlanText, classify, lastDoseDate, matchesFavorite, planLine, plansFor, withFavorite, withoutFavorite } from "../shared/meds";

describe("medication classes", () => {
  it.each([
    ["ELIQUIS 5 MG tablet", "apixaban", "anticoagulant"],
    ["warfarin (COUMADIN) 5 mg tablet", "warfarin", "anticoagulant"],
    ["clopidogrel 75 mg tablet", "clopidogrel", "antiplatelet"],
    ["aspirin EC 81 mg tablet", "aspirin", "antiplatelet"],
    ["ibuprofen 600 mg tablet", "ibuprofen", "nephrotoxic"],
    ["lisinopril 20 mg tablet", "lisinopril", "nephrotoxic"],
    ["vancomycin 1,250 mg in sodium chloride", "vancomycin", "nephrotoxic"],
  ])("%s → %s", (name, agent, cls) => expect(classify(name)[0]).toEqual({ agent, cls }));

  it("finds both drugs in a combination and skips heparin flushes and unrelated drugs", () => {
    expect(classify("sacubitril-valsartan (ENTRESTO) 49-51 mg").map((c) => c.agent)).toEqual(["valsartan"]);
    expect(classify("aspirin-dipyridamole (AGGRENOX) 25-200 mg").map((c) => c.agent)).toEqual(["aspirin", "dipyridamole"]);
    expect(classify("heparin lock flush 100 unit/mL")).toEqual([]);
    expect(classify("atorvastatin 80 mg tablet")).toEqual([]);
  });
});

describe("decisions and favorites", () => {
  const meds = ["aspirin 81 mg tablet", "apixaban 5 mg tablet", "lisinopril 20 mg tablet", "atorvastatin 80 mg"];

  it("lists anticoagulants first, prefilled from favorites", () => {
    const plans = plansFor(meds, { apixaban: { action: "hold", holdDays: 3 } });
    expect(plans.map((p) => [p.agent, p.action, p.holdDays])).toEqual([["apixaban", "hold", 3], ["aspirin", null, null], ["lisinopril", null, null]]);
    expect(plans[0].fromFavorite).toBe(true);
  });

  it("keeps decisions already made when the list is rebuilt", () => {
    const first = plansFor(meds, {}).map((p) => (p.agent === "aspirin" ? { ...p, action: "continue" as const } : p));
    expect(plansFor(meds, { aspirin: { action: "hold", holdDays: 7 } }, first).find((p) => p.agent === "aspirin")?.action).toBe("continue");
  });

  it("saves, matches and forgets a favorite", () => {
    const plan = { med: "clopidogrel 75 mg", agent: "clopidogrel", cls: "antiplatelet" as const, action: "hold" as const, holdDays: 5 };
    const favs = withFavorite({}, plan);
    expect(favs).toEqual({ clopidogrel: { action: "hold", holdDays: 5 } });
    expect(matchesFavorite(favs, plan)).toBe(true);
    expect(matchesFavorite(favs, { ...plan, holdDays: 7 })).toBe(false);
    expect(withoutFavorite(favs, "clopidogrel")).toEqual({});
  });

  it("writes the sheet line with the last dose date when the date is fixed", () => {
    const plan = { med: "apixaban 5 mg", agent: "apixaban", cls: "anticoagulant" as const, action: "hold" as const, holdDays: 3 };
    expect(lastDoseDate("2026-11-20", 3)).toBe("2026-11-16");
    expect(planLine(plan, "2026-11-20")).toBe("HOLD apixaban 5 mg for 3 days before surgery (last dose 2026-11-16)");
    expect(planLine({ ...plan, action: "continue", holdDays: null }, null)).toBe("CONTINUE apixaban 5 mg");
  });

  it("reads a dictated plan using brand or generic names", () => {
    const plans = applyPlanText("Hold Eliquis 3 days prior, no bridging. Continue aspirin and statin.", plansFor(meds, {}));
    expect(plans.map((p) => [p.agent, p.action, p.holdDays])).toEqual([["apixaban", "hold", 3], ["aspirin", "continue", null], ["lisinopril", null, null]]);
  });
});
