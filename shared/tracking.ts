// Scheduling progress, read from Epic: the case request order (ServiceRequest)
// and the surgery the scheduler books in OpTime (Appointment, Scheduled
// Surgeries). Nothing is stored by the app; every refresh asks Epic again.
import { CATALOG } from "./catalog.js";
import { conceptText, resourcesOf, type FhirResource } from "./chart.js";

export interface CaseRequest {
  id: string;
  status: string;
  title: string;
  authoredOn: string | null;
  requester: string | null;
}

export interface Surgery {
  id: string;
  /** FHIR status: proposed (Epic pending / not scheduled / missing information), booked, arrived, fulfilled, cancelled, noshow. */
  status: string;
  description: string;
  start: string | null;
  end: string | null;
  minutes: number | null;
  surgeon: string | null;
  location: string | null;
  comment: string | null;
  created: string | null;
}

export type StageKey = "requested" | "scheduling" | "scheduled" | "arrived" | "done";
export interface Tracking {
  caseRequests: CaseRequest[];
  surgeries: Surgery[];
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const CPT_CODES = new Set(CATALOG.map((p) => p.cpt));

/**
 * Which orders are case requests. Organizations name the order type differently,
 * so a configured category code wins; otherwise match on wording or a vascular CPT.
 */
export function isCaseRequest(sr: FhirResource, categoryCode?: string): boolean {
  const cats = (sr.category as { coding?: { code?: string; display?: string }[]; text?: string }[] | undefined) ?? [];
  if (categoryCode) return cats.some((c) => c.coding?.some((x) => x.code === categoryCode));
  const code = sr.code as { coding?: { system?: string; code?: string }[]; text?: string } | undefined;
  const words = [...cats.map((c) => conceptText(c)), conceptText(code)].join(" ");
  if (/case request|surgical case|surgery request|or request|request for surgery/i.test(words)) return true;
  return (code?.coding ?? []).some((c) => /cpt/i.test(c.system ?? "") && c.code && CPT_CODES.has(c.code));
}

export function caseRequests(bundle: unknown, categoryCode?: string): CaseRequest[] {
  return resourcesOf(bundle, "ServiceRequest")
    .filter((sr) => isCaseRequest(sr, categoryCode))
    .filter((sr) => str(sr.status) !== "entered-in-error")
    .map((sr) => ({
      id: sr.id ?? "",
      status: str(sr.status) ?? "unknown",
      title: conceptText(sr.code) || "Case request",
      authoredOn: str(sr.authoredOn),
      requester: str((sr.requester as { display?: string } | undefined)?.display),
    }))
    .sort((a, b) => (b.authoredOn ?? "").localeCompare(a.authoredOn ?? ""));
}

type Participant = { type?: { coding?: { code?: string }[]; text?: string }[]; actor?: { reference?: string; display?: string } };

export function surgeries(bundle: unknown): Surgery[] {
  return resourcesOf(bundle, "Appointment")
    .filter((a) => str(a.status) !== "entered-in-error")
    .map((a) => {
      const parts = (a.participant as Participant[] | undefined) ?? [];
      const roleOf = (p: Participant) => [p.type?.[0]?.text, ...(p.type?.flatMap((t) => t.coding?.map((c) => c.code)) ?? [])].join(" ");
      const surgeon = parts.find((p) => /PPRF/.test(roleOf(p)) && /^Practitioner\//.test(p.actor?.reference ?? ""))
        ?? parts.find((p) => /^Practitioner\//.test(p.actor?.reference ?? ""));
      const location = parts.find((p) => /^Location\//.test(p.actor?.reference ?? ""));
      return {
        id: a.id ?? "",
        status: str(a.status) ?? "unknown",
        description: str(a.description) ?? "Surgery",
        start: str(a.start),
        end: str(a.end),
        minutes: typeof a.minutesDuration === "number" ? a.minutesDuration : null,
        surgeon: surgeon?.actor?.display ?? null,
        location: location?.actor?.display ?? null,
        comment: str(a.comment)?.replace(/\\r\\n|\r\n/g, " ").trim() || null,
        created: str(a.created),
      };
    })
    .sort((a, b) => (b.start ?? b.created ?? "").localeCompare(a.start ?? a.created ?? ""));
}

/** The case that matters now: the next upcoming or most recent active surgery. */
export function currentSurgery(list: Surgery[], now = new Date()): Surgery | null {
  const active = list.filter((s) => !["cancelled", "noshow"].includes(s.status));
  const upcoming = active.filter((s) => s.start && Date.parse(s.start) >= now.getTime() - 86_400_000).sort((a, b) => a.start!.localeCompare(b.start!));
  return upcoming[0] ?? active.find((s) => s.status === "proposed") ?? active[0] ?? null;
}

export interface Stage { key: StageKey; label: string; state: "done" | "current" | "todo"; detail: string | null }

export function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Steps from request to surgery, with what the scheduler has done so far. */
export function stages(t: Tracking, sentHere: boolean, now = new Date()): { stages: Stage[]; cancelled: Surgery | null; summary: string } {
  const surgery = currentSurgery(t.surgeries, now);
  const cancelled = !surgery ? t.surgeries.find((s) => s.status === "cancelled") ?? null : null;
  const order = t.caseRequests.find((c) => c.status === "active") ?? t.caseRequests[0] ?? null;
  const reached: Record<StageKey, boolean> = {
    requested: sentHere || !!order || !!surgery,
    scheduling: !!surgery || order?.status === "active",
    scheduled: !!surgery && ["booked", "arrived", "fulfilled"].includes(surgery.status),
    arrived: !!surgery && ["arrived", "fulfilled"].includes(surgery.status),
    done: !!surgery && surgery.status === "fulfilled",
  };
  const order_: StageKey[] = ["requested", "scheduling", "scheduled", "arrived", "done"];
  const last = [...order_].reverse().find((k) => reached[k]);
  const when = formatWhen(surgery?.start ?? null);
  const detail: Record<StageKey, string | null> = {
    requested: order ? `Case request order ${order.status}${order.authoredOn ? ` · signed ${formatWhen(order.authoredOn)}` : ""}${order.requester ? ` · ${order.requester}` : ""}` : sentHere ? "Sent from this app" : null,
    scheduling: surgery?.status === "proposed" ? `Case created, not yet scheduled${surgery.comment ? ` · “${surgery.comment}”` : ""}` : order && !surgery ? "Waiting for the scheduler to create the case" : null,
    scheduled: reached.scheduled ? [when, surgery?.location, surgery?.surgeon, surgery?.minutes ? `${surgery.minutes} min` : null].filter(Boolean).join(" · ") : null,
    arrived: reached.arrived ? "Patient arrived" : null,
    done: reached.done ? "Surgery completed" : null,
  };
  const labels: Record<StageKey, string> = { requested: "Requested", scheduling: "With scheduler", scheduled: "Scheduled", arrived: "Day of surgery", done: "Completed" };
  const list = order_.map((k) => ({
    key: k,
    label: labels[k],
    state: (reached[k] ? (k === last && k !== "done" ? "current" : "done") : "todo") as Stage["state"],
    detail: detail[k],
  }));
  const summary = cancelled
    ? `Cancelled: ${cancelled.description}`
    : !last ? "No case request or scheduled surgery found in Epic yet"
    : last === "scheduled" ? `Scheduled ${when ?? ""}`.trim()
    : last === "scheduling" ? "With the scheduler"
    : labels[last];
  return { stages: list, cancelled, summary };
}

/** Patients on an Epic patient list (List resource, code=patients). */
export function listPatients(bundle: unknown): { id: string; name: string }[] {
  return resourcesOf(bundle, "List").flatMap((l) =>
    ((l.entry as { item?: { reference?: string; display?: string } }[] | undefined) ?? [])
      .map((e) => ({ id: e.item?.reference?.replace(/^Patient\//, "") ?? "", name: e.item?.display ?? "" }))
      .filter((p) => p.id && !p.id.includes("/")),
  );
}
