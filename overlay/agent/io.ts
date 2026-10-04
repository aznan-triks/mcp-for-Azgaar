import { config } from "./config";
import { dropSelections } from "./selection";
import { AgentError } from "./types";

/** The exact text of a .map file for the current map. */
export async function exportMap(): Promise<string> {
  return await Services.Save.prepareMapData();
}

/** Replaces the current map by the one in `text`; resolves when it is loaded and drawn. */
export async function importMap(text: string): Promise<void> {
  const before = mapHistory.length;
  Services.Load.uploadMap(new Blob([text]));
  const started = Date.now();
  while (mapHistory.length <= before) {
    if (Date.now() - started > config.importTimeoutMs) throw new AgentError("Loading the map timed out");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => setTimeout(resolve, config.settleMs));
  // A loaded map brings its own cell numbering: selections made on the previous map would point at
  // arbitrary cells of the new one (undo, redo, load, rollback all pass through here).
  dropSelections();
}
