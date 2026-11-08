// Offline procedure search: matches what a surgeon types ("R fem-pop PTFE",
// "bka", "37226") against the catalog's names, synonyms and codes. It runs in
// the browser with no AI, so search always works.
import { CATALOG, type Procedure } from "./catalog.js";

export type Side = "Left" | "Right" | "Bilateral";

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bfem\s*pop\b/g, "fem pop femoral popliteal"],
  [/\bfem\s*tib\b/g, "fem tib femoral tibial"],
  [/\bfem\s*fem\b/g, "fem fem femorofemoral crossover"],
  [/\bax\s*fem\b/g, "ax fem axillofemoral"],
  [/\bsfa\b/g, "sfa femoral popliteal"],
  [/\bpta\b/g, "pta angioplasty"],
  [/\bgsv\b/g, "gsv saphenous"],
  [/\bssv\b/g, "ssv saphenous"],
  [/\bptfe\b/g, "ptfe prosthetic"],
  [/\bdacron\b/g, "dacron prosthetic"],
  [/\bstent\s*graft\b/g, "stent graft endograft"],
];

export function normalize(text: string): string {
  let t = text.toLowerCase().replace(/[‐-―]/g, "-").replace(/[-/,.;:()]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, rep] of ABBREVIATIONS) t = t.replace(re, rep);
  return t;
}

const STOP = new Set(["the", "a", "an", "of", "with", "and", "or", "for", "to", "in", "on", "first", "each", "any", "right", "left", "bilateral", "r", "l", "rt", "lt", "bilat"]);
const tokens = (t: string) => normalize(t).split(" ").filter((w) => w && !STOP.has(w));

interface Indexed { p: Procedure; phrases: string[]; words: Set<string> }
const INDEX: Indexed[] = CATALOG.map((p) => {
  const phrases = [p.name, ...p.synonyms].map(normalize);
  return { p, phrases, words: new Set(phrases.flatMap((x) => x.split(" ")).filter((w) => !STOP.has(w))) };
});

export interface Match { procedure: Procedure; score: number }

/** Ranked catalog matches for free text or a CPT code. */
export function searchProcedures(query: string, limit = 10): Match[] {
  const raw = query.trim();
  if (!raw) return [];
  const code = raw.match(/^\d{4}[\dT]$/i)?.[0];
  if (code) return INDEX.filter((x) => x.p.cpt === code.toUpperCase()).map((x) => ({ procedure: x.p, score: 100 }));

  const q = normalize(raw);
  const qWords = tokens(raw);
  if (!qWords.length) return [];
  const out: Match[] = [];
  for (const x of INDEX) {
    let score = 0;
    for (const ph of x.phrases) {
      if (ph === q) score = Math.max(score, 60);
      else if (ph.includes(q)) score = Math.max(score, 40);
      else if (q.includes(ph) && ph.length > 2) score = Math.max(score, 30 + Math.min(ph.length, 20) / 2);
    }
    let hits = 0;
    for (const w of qWords) {
      if (x.words.has(w)) hits += 1;
      else if (w.length >= 3 && [...x.words].some((v) => v.startsWith(w))) hits += 0.6;
    }
    score += (hits / qWords.length) * 30;
    if (x.p.addOn) score -= 3; // primary procedures first when both match
    if (score >= 18) out.push({ procedure: x.p, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Side mentioned in free text, if exactly one is. */
export function sideFromText(text: string): Side | null {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(bilateral|bilat|both)\b/.test(t)) return "Bilateral";
  const right = /\b(right|rt|r)\b/.test(t);
  const left = /\b(left|lt|l)\b/.test(t);
  if (right && !left) return "Right";
  if (left && !right) return "Left";
  return null;
}
