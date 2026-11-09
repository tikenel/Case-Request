// Where cases can be booked. Edit this list to change the choices.
import type { Setting } from "./catalog.js";

export const LOCATIONS = ["UMH Main OR", "Hybrid OR", "Sole Mia", "Lennar", "Doral"] as const;
export type Location = (typeof LOCATIONS)[number];

/** Default location from the room a procedure needs. Outpatient-type rooms have no default: the clinician picks the site. */
export function defaultLocation(setting: Setting): Location | null {
  if (setting === "Hybrid OR") return "Hybrid OR";
  if (setting === "Main OR") return "UMH Main OR";
  return null;
}

/** The room type, when the location name alone doesn't say it (e.g. "Doral" for an angio suite case). */
export function roomNote(location: Location | null, setting: Setting): string | null {
  if (location === "UMH Main OR" && setting === "Main OR") return null;
  if (location === "Hybrid OR" && setting === "Hybrid OR") return null;
  return setting;
}
