// Each clinician's usual continue/hold choices. Not patient data (drug → days),
// kept in this browser per signed-in user. A shared store can replace this
// once the app has a server under a BAA, so favorites follow users between computers.
import type { Favorites } from "../shared/meds";
import type { SignedInUser } from "../shared/team";

const key = (user: SignedInUser | null) => `case-request:favorites:${user?.fhirId ?? user?.npi ?? user?.name ?? "anonymous"}`;

export function loadFavorites(user: SignedInUser | null): Favorites {
  try {
    const raw = localStorage.getItem(key(user));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFavorites(user: SignedInUser | null, favs: Favorites) {
  try {
    localStorage.setItem(key(user), JSON.stringify(favs));
  } catch { /* storage blocked: favorites last for this visit only */ }
}
