// The vascular surgery team roster and who is signed in. The roster lives in
// public/team.json so the practice can edit it without touching code.

export type TeamRole = "Surgeon" | "Fellow" | "Resident" | "NP" | "PA";
export interface TeamMember { name: string; role: TeamRole; npi?: string; credentials?: string }

export interface SignedInUser {
  name: string;
  fhirId: string | null;
  npi: string | null;
  credentials: string[];
  /** MD or DO, from the Practitioner record (qualifications or name suffix). */
  isPhysician: boolean;
}

const ROLES: TeamRole[] = ["Surgeon", "Fellow", "Resident", "NP", "PA"];
const PHYSICIAN = /^(MD|DO|MBBS|MBCHB)$/i;
const NPI_SYSTEM = "http://hl7.org/fhir/sid/us-npi";

/** Reads team.json, keeping only well-formed entries. */
export function parseTeam(json: unknown): TeamMember[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { members?: unknown })?.members) ? (json as { members: unknown[] }).members : [];
  return list
    .filter((m): m is TeamMember => !!m && typeof (m as TeamMember).name === "string" && ROLES.includes((m as TeamMember).role))
    .map((m) => ({ name: m.name.trim(), role: m.role, ...(m.npi ? { npi: String(m.npi).trim() } : {}), ...(m.credentials ? { credentials: m.credentials } : {}) }))
    .filter((m) => m.name);
}

type Name = { use?: string; text?: string; given?: string[]; family?: string; suffix?: string[]; prefix?: string[] };

/** Who is signed in, from the Practitioner resource Epic returns for fhirUser. */
export function userFromPractitioner(p: unknown): SignedInUser | null {
  const r = p as { resourceType?: string; id?: string; name?: Name[]; identifier?: { system?: string; type?: { text?: string }; value?: string }[]; qualification?: { code?: { text?: string; coding?: { code?: string; display?: string }[] } }[] };
  if (!r || (r.resourceType && r.resourceType !== "Practitioner")) return null;
  const n = r.name?.find((x) => x.use === "official") ?? r.name?.find((x) => x.use === "usual") ?? r.name?.[0];
  const name = n?.text || [n?.given?.join(" "), n?.family].filter(Boolean).join(" ");
  if (!name) return null;
  const quals = (r.qualification ?? []).flatMap((q) => [q.code?.text, ...(q.code?.coding ?? []).flatMap((c) => [c.code, c.display])]).filter((x): x is string => !!x);
  const fromName = [...(n?.suffix ?? []), ...(name.match(/,?\s+(MD|DO|NP|PA-C|PA|RN|APRN|CRNP)\.?$/i)?.slice(1) ?? [])];
  const credentials = [...new Set([...quals, ...fromName].map((c) => c.replace(/\./g, "").trim().toUpperCase()).filter((c) => c.length <= 8))];
  const npi = r.identifier?.find((i) => i.system === NPI_SYSTEM || /\bnpi\b/i.test(i.type?.text ?? ""))?.value ?? null;
  return { name, fhirId: r.id ?? null, npi, credentials, isPhysician: credentials.some((c) => PHYSICIAN.test(c)) };
}

const normName = (s: string) =>
  s.toLowerCase().replace(/\b(dr|md|do|np|pa|pa-c|aprn|crnp|rn|facs|rpvi)\b\.?/g, "").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

/** The roster entry for the signed-in user: by NPI, else by name (order-insensitive, ignoring titles). */
export function matchMember(user: SignedInUser | null, team: TeamMember[]): TeamMember | null {
  if (!user) return null;
  if (user.npi) {
    const byNpi = team.find((m) => m.npi && m.npi === user.npi);
    if (byNpi) return byNpi;
  }
  const key = normName(user.name);
  return team.find((m) => normName(m.name) === key) ?? null;
}

/** Operating surgeon defaults to the signed-in user when they're a surgeon (roster) or a physician; requested-by is always the user. */
export function defaultPeople(user: SignedInUser | null, team: TeamMember[]): { surgeon: string; requestedBy: string } {
  if (!user) return { surgeon: "", requestedBy: "" };
  const member = matchMember(user, team);
  const operating = member ? member.role === "Surgeon" : user.isPhysician;
  return { surgeon: operating ? member?.name ?? user.name : "", requestedBy: member?.name ?? user.name };
}

/** Choices for the operating-surgeon list: roster surgeons, plus a signed-in physician who isn't on it. */
export function surgeonChoices(user: SignedInUser | null, team: TeamMember[]): string[] {
  const names = team.filter((m) => m.role === "Surgeon").map((m) => m.name);
  if (user?.isPhysician && !matchMember(user, team)) names.unshift(user.name);
  return [...new Set(names)];
}
