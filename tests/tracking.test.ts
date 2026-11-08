import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caseRequests, isCaseRequest, listPatients, stages, surgeries, type Tracking } from "../shared/tracking";

// Epic's published sample responses (open.epic API documentation).
const epicSurgery = JSON.parse(readFileSync(new URL("./fixtures/epic-appointment-surgery.json", import.meta.url), "utf8"));
const epicOrders = JSON.parse(readFileSync(new URL("./fixtures/epic-servicerequest-orders.json", import.meta.url), "utf8"));
const now = new Date("2022-02-01T12:00:00Z");

describe("reading Epic scheduling data", () => {
  it("reads a scheduled surgery from Epic's sample", () => {
    const [s] = surgeries(epicSurgery);
    expect(s).toMatchObject({ status: "booked", start: "2022-02-08T20:00:00Z", minutes: 120, surgeon: "Steven Hanson", comment: "Schedule at the first case of the day." });
    expect(s.description).toContain("APPENDECTOMY OPEN");
  });

  it("ignores ordinary orders that aren't case requests", () => {
    expect(caseRequests(epicOrders)).toEqual([]);
    expect(caseRequests(epicOrders, "1")).toHaveLength(2); // a configured category wins
  });

  it("recognises case requests by wording or vascular CPT", () => {
    const sr = (code: object, category = "Procedures") => ({ resourceType: "ServiceRequest", status: "active", category: [{ text: category }], code });
    expect(isCaseRequest(sr({ text: "CASE REQUEST: VASCULAR SURGERY" }))).toBe(true);
    expect(isCaseRequest(sr({ coding: [{ system: "http://www.ama-assn.org/go/cpt", code: "35656" }] }))).toBe(true);
    expect(isCaseRequest(sr({ text: "CBC" }, "Lab"))).toBe(false);
  });

  it("reads patients from an Epic patient list", () => {
    const bundle = { resourceType: "Bundle", entry: [{ resource: { resourceType: "List", entry: [{ item: { reference: "Patient/eAbc1", display: "Test, One" } }, { item: { reference: "Group/x" } }] } }] };
    expect(listPatients(bundle)).toEqual([{ id: "eAbc1", name: "Test, One" }]);
  });
});

describe("progress steps", () => {
  const order = { id: "o", status: "active", title: "CASE REQUEST", authoredOn: "2022-01-30T10:00:00Z", requester: "Dr A" };
  const surgery = (status: string, start: string | null = "2022-02-08T20:00:00Z") => ({ id: "c", status, description: "BYPASS", start, end: null, minutes: 180, surgeon: "Dr A", location: "OR 4", comment: null, created: "2022-01-31" });
  const current = (t: Tracking, sent = false) => stages(t, sent, now).stages.find((s) => s.state === "current")?.key;

  it("follows the case from request to scheduled", () => {
    expect(stages({ caseRequests: [], surgeries: [] }, false, now).summary).toMatch(/No case request/);
    expect(current({ caseRequests: [], surgeries: [] }, true)).toBe("requested");
    expect(current({ caseRequests: [order], surgeries: [] })).toBe("scheduling");
    expect(current({ caseRequests: [order], surgeries: [surgery("proposed", null)] })).toBe("scheduling");
    const booked = stages({ caseRequests: [order], surgeries: [surgery("booked")] }, false, now);
    expect(booked.stages.find((s) => s.state === "current")?.key).toBe("scheduled");
    expect(booked.summary).toMatch(/^Scheduled Tue, Feb 8, 2022/);
    expect(booked.stages.find((s) => s.key === "scheduled")?.detail).toContain("OR 4");
  });

  it("marks completed and cancelled cases", () => {
    const done = stages({ caseRequests: [order], surgeries: [surgery("fulfilled")] }, false, now);
    expect(done.stages.every((s) => s.state === "done")).toBe(true);
    const cancelled = stages({ caseRequests: [], surgeries: [surgery("cancelled")] }, false, now);
    expect(cancelled.cancelled?.description).toBe("BYPASS");
    expect(cancelled.summary).toMatch(/^Cancelled/);
  });
});
