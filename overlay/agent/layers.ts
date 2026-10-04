import { AgentError } from "./types";

export interface LayerState {
  active: string[];
  available: string[];
}

export function listLayers(): LayerState {
  return {
    active: Layers.state.active,
    available: Layers.all.filter(layer => !layer.params.permanent).map(layer => layer.id)
  };
}

/** Shows and/or hides map layers (what the person sees). Unknown names are refused with the valid list. */
export function setLayers(change: { show?: string[]; hide?: string[] }): LayerState {
  const wanted = [...(change.show ?? []), ...(change.hide ?? [])];
  const { available } = listLayers();
  const unknown = wanted.filter(id => !available.includes(id));
  if (unknown.length)
    throw new AgentError(`Unknown layer(s): ${unknown.join(", ")}. Available: ${available.join(", ")}`);
  const known = (ids: string[]) => ids.filter((id): id is Parameters<typeof Layers.show>[number] => Layers.has(id));
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
