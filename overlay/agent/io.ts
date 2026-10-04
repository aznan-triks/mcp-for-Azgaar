import { config } from "./config";
import { dropSelections, restoreSelections, snapshotSelections } from "./selection";
import { AgentError } from "./types";

/** The exact text of a .map file for the current map. */
export async function exportMap(): Promise<string> {
  return await Services.Save.prepareMapData();
}

/**
 * Replaces the current map by the one in `text`; resolves when it is loaded and drawn.
 * `keepSelections`: the new map is the same geography (undo, redo, rollback), so selections are carried over by position.
 */
export async function importMap(text: string, keepSelections = false): Promise<void> {
  const before = mapHistory.length;
  const kept = keepSelections ? snapshotSelections() : null;
  Services.Load.uploadMap(new Blob([text]));
  const started = Date.now();
  while (mapHistory.length <= before) {
    if (Date.now() - started > config.importTimeoutMs) throw new AgentError("Loading the map timed out");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => setTimeout(resolve, config.settleMs));
  // A loaded map brings its own cell numbering: selections made on the previous map would point at
  // arbitrary cells of the new one (a loaded file); undo, redo and rollback keep them, re-found by position.
  if (kept) restoreSelections(kept);
  else dropSelections();
}
