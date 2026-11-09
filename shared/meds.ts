// Peri-operative medication decisions: which chart medications need a
// continue/hold decision, the decision itself, and the clinician's saved
// "usual" choices. The app records what the surgeon decides; it never
// recommends a hold duration on its own.

export type MedClass = "anticoagulant" | "antiplatelet" | "nephrotoxic";
export type MedAction = "continue" | "hold";

export interface MedPlan {
  /** As written in the chart, e.g. "apixaban 5 mg tablet". */
  med: string;
  /** Generic agent, used to match favorites, e.g. "apixaban". */
  agent: string;
  cls: MedClass;
  action: MedAction | null;
  /** Days before surgery to hold (last dose X days before). */
  holdDays: number | null;
  /** Set when the decision came from the user's saved usual. */
  fromFavorite?: boolean;
}

/** Saved usual decisions, keyed by agent. */
export type Favorites = Record<string, { action: MedAction; holdDays: number | null }>;

// Generic names with common brand names. Order matters only for display.
const AGENTS: { agent: string; cls: MedClass; names: string[] }[] = [
  // Anticoagulants
  { agent: "apixaban", cls: "anticoagulant", names: ["apixaban", "eliquis"] },
  { agent: "rivaroxaban", cls: "anticoagulant", names: ["rivaroxaban", "xarelto"] },
  { agent: "dabigatran", cls: "anticoagulant", names: ["dabigatran", "pradaxa"] },
  { agent: "edoxaban", cls: "anticoagulant", names: ["edoxaban", "savaysa"] },
  { agent: "warfarin", cls: "anticoagulant", names: ["warfarin", "coumadin", "jantoven"] },
  { agent: "enoxaparin", cls: "anticoagulant", names: ["enoxaparin", "lovenox"] },
  { agent: "dalteparin", cls: "anticoagulant", names: ["dalteparin", "fragmin"] },
  { agent: "fondaparinux", cls: "anticoagulant", names: ["fondaparinux", "arixtra"] },
  { agent: "heparin", cls: "anticoagulant", names: ["heparin"] },
  // Antiplatelets
  { agent: "aspirin", cls: "antiplatelet", names: ["aspirin", "acetylsalicylic", "ecotrin", "bayer"] },
  { agent: "clopidogrel", cls: "antiplatelet", names: ["clopidogrel", "plavix"] },
  { agent: "ticagrelor", cls: "antiplatelet", names: ["ticagrelor", "brilinta"] },
  { agent: "prasugrel", cls: "antiplatelet", names: ["prasugrel", "effient"] },
  { agent: "cilostazol", cls: "antiplatelet", names: ["cilostazol", "pletal"] },
  { agent: "dipyridamole", cls: "antiplatelet", names: ["dipyridamole", "aggrenox", "persantine"] },
  { agent: "vorapaxar", cls: "antiplatelet", names: ["vorapaxar", "zontivity"] },
  // Nephrotoxic or kidney-relevant around surgery and contrast
  { agent: "ibuprofen", cls: "nephrotoxic", names: ["ibuprofen", "advil", "motrin"] },
  { agent: "naproxen", cls: "nephrotoxic", names: ["naproxen", "aleve", "naprosyn"] },
  { agent: "ketorolac", cls: "nephrotoxic", names: ["ketorolac", "toradol"] },
  { agent: "diclofenac", cls: "nephrotoxic", names: ["diclofenac", "voltaren"] },
  { agent: "meloxicam", cls: "nephrotoxic", names: ["meloxicam", "mobic"] },
  { agent: "celecoxib", cls: "nephrotoxic", names: ["celecoxib", "celebrex"] },
  { agent: "indomethacin", cls: "nephrotoxic", names: ["indomethacin", "indocin"] },
  { agent: "nabumetone", cls: "nephrotoxic", names: ["nabumetone"] },
  { agent: "etodolac", cls: "nephrotoxic", names: ["etodolac"] },
  { agent: "lisinopril", cls: "nephrotoxic", names: ["lisinopril", "zestril", "prinivil"] },
  { agent: "enalapril", cls: "nephrotoxic", names: ["enalapril", "vasotec"] },
  { agent: "ramipril", cls: "nephrotoxic", names: ["ramipril", "altace"] },
  { agent: "benazepril", cls: "nephrotoxic", names: ["benazepril", "lotensin"] },
  { agent: "quinapril", cls: "nephrotoxic", names: ["quinapril", "accupril"] },
  { agent: "captopril", cls: "nephrotoxic", names: ["captopril"] },
  { agent: "losartan", cls: "nephrotoxic", names: ["losartan", "cozaar", "hyzaar"] },
  { agent: "valsartan", cls: "nephrotoxic", names: ["valsartan", "diovan", "entresto"] },
  { agent: "irbesartan", cls: "nephrotoxic", names: ["irbesartan", "avapro"] },
  { agent: "olmesartan", cls: "nephrotoxic", names: ["olmesartan", "benicar"] },
  { agent: "candesartan", cls: "nephrotoxic", names: ["candesartan", "atacand"] },
  { agent: "telmisartan", cls: "nephrotoxic", names: ["telmisartan", "micardis"] },
  { agent: "gentamicin", cls: "nephrotoxic", names: ["gentamicin"] },
  { agent: "tobramycin", cls: "nephrotoxic", names: ["tobramycin"] },
  { agent: "amikacin", cls: "nephrotoxic", names: ["amikacin"] },
  { agent: "vancomycin", cls: "nephrotoxic", names: ["vancomycin"] },
  { agent: "amphotericin", cls: "nephrotoxic", names: ["amphotericin"] },
  { agent: "tacrolimus", cls: "nephrotoxic", names: ["tacrolimus", "prograf"] },
  { agent: "cyclosporine", cls: "nephrotoxic", names: ["cyclosporine", "neoral", "sandimmune"] },
  { agent: "lithium", cls: "nephrotoxic", names: ["lithium"] },
  { agent: "methotrexate", cls: "nephrotoxic", names: ["methotrexate"] },
];

export const CLASS_LABEL: Record<MedClass, string> = {
  anticoagulant: "Anticoagulant",
  antiplatelet: "Antiplatelet",
  nephrotoxic: "Kidney risk",
};

/** The agents in a chart medication name that need a decision (a combination pill can match more than one). */
export function classify(display: string): { agent: string; cls: MedClass }[] {
  const t = ` ${display.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  // Heparin flushes and lock solutions aren't anticoagulation.
  if (/\bheparin\b/.test(t) && /\b(flush|lock|catheter)\b/.test(t)) return [];
  const out: { agent: string; cls: MedClass }[] = [];
  for (const a of AGENTS) if (a.names.some((n) => t.includes(` ${n} `) || t.includes(` ${n}`))) out.push({ agent: a.agent, cls: a.cls });
  return out.filter((x, i) => out.findIndex((y) => y.agent === x.agent) === i);
}

/** Decisions to make for this patient's medications, prefilled from favorites. Keeps decisions already made. */
export function plansFor(meds: string[], favorites: Favorites, existing: MedPlan[] = []): MedPlan[] {
  const plans: MedPlan[] = [];
  for (const med of meds) {
    for (const { agent, cls } of classify(med)) {
      if (plans.some((p) => p.agent === agent)) continue;
      const kept = existing.find((p) => p.agent === agent);
      const fav = favorites[agent];
      plans.push(
        kept ?? { med, agent, cls, action: fav?.action ?? null, holdDays: fav?.action === "hold" ? fav.holdDays : null, ...(fav ? { fromFavorite: true } : {}) },
      );
    }
  }
  const rank: Record<MedClass, number> = { anticoagulant: 0, antiplatelet: 1, nephrotoxic: 2 };
  return plans.sort((a, b) => rank[a.cls] - rank[b.cls]);
}

/** Saving the current decision as the user's usual for that agent. */
export function withFavorite(favorites: Favorites, plan: MedPlan): Favorites {
  if (!plan.action) return favorites;
  return { ...favorites, [plan.agent]: { action: plan.action, holdDays: plan.action === "hold" ? plan.holdDays : null } };
}

export function withoutFavorite(favorites: Favorites, agent: string): Favorites {
  const { [agent]: _drop, ...rest } = favorites;
  return rest;
}

export function matchesFavorite(favorites: Favorites, plan: MedPlan): boolean {
  const f = favorites[plan.agent];
  return !!f && f.action === plan.action && (f.action === "continue" || f.holdDays === plan.holdDays);
}

/** Last dose date for a hold, when the surgery date is fixed. */
export function lastDoseDate(surgeryDate: string, holdDays: number): string | null {
  const d = new Date(`${surgeryDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - holdDays - 1);
  return d.toISOString().slice(0, 10);
}

export function planLine(p: MedPlan, surgeryDate: string | null): string {
  if (p.action === "continue") return `CONTINUE ${p.med}`;
  if (p.action === "hold" && p.holdDays) {
    const last = surgeryDate ? lastDoseDate(surgeryDate, p.holdDays) : null;
    return `HOLD ${p.med} for ${p.holdDays} day${p.holdDays === 1 ? "" : "s"} before surgery${last ? ` (last dose ${last})` : ""}`;
  }
  return `${p.med}: decision needed`;
}

/**
 * Reads a dictated or noted plan ("hold Eliquis 3 days, continue aspirin") into
 * decisions for the medications on file. Only fills decisions not made yet.
 */
export function applyPlanText(text: string, plans: MedPlan[]): MedPlan[] {
  const clauses = text.toLowerCase().split(/[.;\n]|,\s*(?=continue|hold|stop)|\band\b(?=\s*(continue|hold|stop))/);
  return plans.map((p) => {
    if (p.action) return p;
    const names = AGENTS.find((a) => a.agent === p.agent)?.names ?? [p.agent];
    const clause = clauses.find((c) => c && names.some((n) => new RegExp(`\\b${n}\\b`).test(c)));
    if (!clause) return p;
    const days = clause.match(/(\d+)\s*(?:days?|d)\b/)?.[1];
    if (/\b(hold|stop|discontinue)\b/.test(clause)) return { ...p, action: "hold", holdDays: days ? Number(days) : null, fromFavorite: false };
    if (/\b(continue|keep|resume|maintain)\b/.test(clause)) return { ...p, action: "continue", holdDays: null, fromFavorite: false };
    return p;
  });
}
