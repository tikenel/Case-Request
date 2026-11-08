import { describe, expect, it } from "vitest";
import { searchProcedures, sideFromText } from "../shared/match";

const top = (q: string) => searchProcedures(q)[0]?.procedure.id;

describe("procedure search", () => {
  it.each([
    ["37226", "37226"],
    ["R fem-pop PTFE", "35656"],
    ["fem pop bypass with vein", "35556"],
    ["bka", "27880"],
    ["AKA", "27590"],
    ["carotid endarterectomy", "35301"],
    ["CEA", "35301"],
    ["TCAR", "37215-tcar"],
    ["evar", "34705"],
    ["tevar", "33881"],
    ["brachiocephalic fistula", "36821"],
    ["basilic vein transposition", "36819"],
    ["declot", "36904"],
    ["venaseal", "36482"],
    ["GSV ablation", "36475"],
    ["first rib resection", "21615"],
    ["IVC filter retrieval", "37193"],
    ["sfa stent", "37226"],
    ["tunneled dialysis catheter", "36558"],
  ])("%s → %s", (q, id) => expect(top(q)).toBe(id));

  it("returns nothing for empty or unrelated text", () => {
    expect(searchProcedures("")).toEqual([]);
    expect(searchProcedures("knee replacement arthroplasty")).toEqual([]);
  });
});

describe("side from text", () => {
  it.each([
    ["Right fem-pop", "Right"],
    ["lt BKA", "Left"],
    ["bilateral EVAR access", "Bilateral"],
    ["EVAR", null],
    ["right then left", null],
  ])("%s → %s", (t, side) => expect(sideFromText(t)).toBe(side));
});
