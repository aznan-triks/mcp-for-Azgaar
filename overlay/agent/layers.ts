import { applyPreset } from "@/components/layers-presets";
import { LAYER_PRESETS } from "@/components/options/tabs/layers-tab";
import { AgentError } from "./types";

export interface LayerState {
  active: string[];
  available: string[];
  presets: string[];
}

export function listLayers(): LayerState {
  return {
    active: Layers.state.active,
    available: Layers.all.filter(layer => !layer.params.permanent).map(layer => layer.id),
    presets: Object.keys(LAYER_PRESETS)
  };
}

/**
 * Shows and/or hides map layers (what the person sees). `preset` applies one of Azgaar's own layer presets;
 * `only` shows exactly these layers and hides every other one. Unknown names are refused with the valid list.
 */
export function setLayers(change: { show?: string[]; hide?: string[]; only?: string[]; preset?: string }): LayerState {
  const { available } = listLayers();
  if (change.preset !== undefined) {
    if (!(change.preset in LAYER_PRESETS))
      throw new AgentError(
        `Unknown layer preset "${change.preset}". Available: ${Object.keys(LAYER_PRESETS).join(", ")}`
      );
    applyPreset(change.preset);
  }
  const wanted = [...(change.show ?? []), ...(change.hide ?? []), ...(change.only ?? [])];
  const unknown = wanted.filter(id => !available.includes(id));
  if (unknown.length)
    throw new AgentError(`Unknown layer(s): ${unknown.join(", ")}. Available: ${available.join(", ")}`);
  const known = (ids: string[]) => ids.filter((id): id is Parameters<typeof Layers.show>[number] => Layers.has(id));
  if (change.only) {
    const keep = new Set(change.only);
    const toHide = Layers.state.active.filter(id => !keep.has(id) && available.includes(id));
    if (toHide.length) Layers.hide(...known(toHide));
    Layers.show(...known(change.only));
  }
  if (change.show?.length) Layers.show(...known(change.show));
  if (change.hide?.length) Layers.hide(...known(change.hide));
  return listLayers();
}

/** A reminder for the AI when an edit was made on a layer the person cannot currently see. */
export function hiddenLayerNote(ids: string[], what: string): string[] {
  const hidden = ids.filter(id => Layers.has(id) && !Layers.isOn(id));
  if (!hidden.length) return [];
  return [
    `${what} is not visible in the current view: show layer ${hidden.map(id => `"${id}"`).join(" or ")} (map_layers) to see it.`
  ];
}
