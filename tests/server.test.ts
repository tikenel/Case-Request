import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCaller } from "../server/auth";
import { normalizeSuggestion, systemPrompt } from "../server/claude";

const ISS = "https://fhir.example.org/api/FHIR/R4";

describe("Epic session check", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses missing tokens and unknown servers", async () => {
    vi.stubEnv("FHIR_ISS_ALLOWLIST", ISS);
    expect(await verifyCaller({})).toMatchObject({ ok: false, status: 401 });
    expect(await verifyCaller({ iss: "https://evil.example", patient: "p", token: "t" })).toMatchObject({ ok: false, status: 403 });
  });

  it("accepts a token Epic honours and caches it", async () => {
    vi.stubEnv("FHIR_ISS_ALLOWLIST", `${ISS}/`);
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await verifyCaller({ iss: ISS, patient: "eABC.1", token: "good" }, fetcher as never)).toEqual({ ok: true });
    expect(await verifyCaller({ iss: ISS, patient: "eABC.1", token: "good" }, fetcher as never)).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(`${ISS}/Patient/eABC.1`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer good" }) }));
  });

  it("rejects a token Epic refuses", async () => {
    vi.stubEnv("FHIR_ISS_ALLOWLIST", ISS);
    const fetcher = vi.fn(async () => new Response("", { status: 401 }));
    expect(await verifyCaller({ iss: ISS, patient: "p2", token: "bad" }, fetcher as never)).toMatchObject({ ok: false, status: 401 });
  });
});

describe("AI output clean-up", () => {
  const raw = {
    procedures: [
      { id: "35656", side: "Right" as const, evidence: "R fem-pop PTFE", confidence: "high" as const },
      { id: "99999", side: "Left" as const, evidence: "made-up thing", confidence: "high" as const },
      { id: "27880", side: "Not stated" as const, evidence: "BKA", confidence: "medium" as const },
      { id: "34705", side: "Left" as const, evidence: "EVAR", confidence: "high" as const },
    ],
    unmatched: [], diagnoses: [{ code: "i70.221", display: "x", evidence: "" }, { code: "not-a-code", display: "y", evidence: "" }],
    urgency: "soonish" as never, datePlan: "Between dates" as const, dateFrom: "2026-11-08", dateTo: "soon",
    anesthesia: "General" as const, admission: "Not stated" as const, equipment: [], vendorNotes: null, medicationPlan: null, questions: [], summary: "s",
  };
  it("drops ids outside the catalog, bad codes and dates, and asks for missing sides", () => {
    const s = normalizeSuggestion(raw);
    expect(s.procedures.map((p) => [p.id, p.side])).toEqual([["35656", "Right"], ["27880", null], ["34705", null]]);
    expect(s.unmatched).toEqual(["made-up thing"]);
    expect(s.diagnoses.map((d) => d.code)).toEqual(["I70.221"]);
    expect(s).toMatchObject({ urgency: null, admission: null, dateFrom: "2026-11-08", dateTo: null });
    expect(s.questions.some((q) => q.includes("Below-knee"))).toBe(true);
  });
  it("lists the whole catalog in the system prompt", () => {
    expect(systemPrompt()).toContain("37215-tcar | TCAR");
  });
});

describe("structured output schema", () => {
  it("converts to a strict JSON schema the API accepts", async () => {
    const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
    const { Interpretation } = await import("../server/claude");
    const fmt = betaZodOutputFormat(Interpretation) as { type: string; schema: Record<string, unknown> };
    expect(fmt.type).toBe("json_schema");
    const json = JSON.stringify(fmt.schema);
    expect(json).not.toMatch(/"(minLength|maxLength|pattern|format|minimum|maximum)"/);
    expect(fmt.schema).toMatchObject({ type: "object", additionalProperties: false });
  });
});
