// Where cases can be booked. Edit this list to change the choices.
import type { Setting } from "./catalog.js";

export const LOCATIONS = ["UMH Main OR", "Hybrid OR", "Sole Mia", "Lennar", "Doral"] as const;
export type Location = (typeof LOCATIONS)[number];

/** Default site from the room a procedure needs: open cases to UMH Main OR, angio and endovascular cases to the Hybrid OR. */
export function defaultLocation(setting: Setting): Location {
  return setting === "Hybrid OR" ? "Hybrid OR" : "UMH Main OR";
}
