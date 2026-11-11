import { getProfile } from "../api/profiles";
import {
  loadLawnProfile,
  sameCalculationInputs,
  saveLawnProfile,
  withServerProfile,
} from "./lawnProfileStorage";
import type { LawnProfile } from "../types/lawnProfile";

/**
 * Refresh the browser's copy of a profile from the server, which is what
 * the engine reads. Returns the updated profile, or null when nothing
 * changed or the server could not be reached.
 */
export async function syncProfileFromServer(
  profileId: string,
): Promise<LawnProfile | null> {
  let refreshed: LawnProfile | null = null;

  try {
    const server = await getProfile(profileId);
    const local = loadLawnProfile();
    if (!local || local.backendId !== server.id) return null;
    if (sameCalculationInputs(local, server)) return null;

    refreshed = withServerProfile(local, server);
  } catch {
    // Offline or removed: the saved copy stays on screen.
    return null;
  }

  return saveLawnProfile(refreshed) ? refreshed : null;
}
