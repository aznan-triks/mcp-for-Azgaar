// Tools that open the rest of Azgaar to the AI: file exports, Azgaar's own action menu, the interface itself,
// and the generation settings. Registered next to the core tools (see tools.ts).
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { captureInset, insetSchema } from "./inset.ts";
import type { MapSession } from "./browser.ts";
import type { Config } from "./config.ts";
import type { History } from "./history.ts";
import type { Content, ToolResult } from "./tools.ts";

export interface Kit {
  server: McpServer;
  cfg: Config;
  session: MapSession;
  history: History;
  guarded: <A>(fn: (args: A) => Promise<ToolResult>) => (args: A) => Promise<ToolResult>;
  text: (value: unknown) => Content;
  viewContent: () => Promise<Content>;
  settle: () => Promise<void>;
  autosave: () => Promise<void>;
  loadPresets: () => Record<string, string[]>;
  safeName: (raw: string) => string;
}

/** Azgaar's own export actions that are not pictures (each is one entry of its action menu). */
const MENU_EXPORTS: Record<string, string> = {
  "json-full": "exportJsonFull",
  "json-minimal": "exportJsonMinimal",
  "json-pack-cells": "exportJsonPackCells",
  "json-grid-cells": "exportJsonGridCells",
  "geojson-cells": "exportGeoJsonCells",
  "geojson-routes": "exportGeoJsonRoutes",
  "geojson-rivers": "exportGeoJsonRivers",
  "geojson-markers": "exportGeoJsonMarkers",
  "geojson-zones": "exportGeoJsonZones",
  "csv-burgs": "exportCsvBurgs",
  "csv-biomes": "exportCsvBiomes",
  "csv-relations": "exportCsvRelations",
  "csv-goods": "exportCsvGoods",
  "csv-markers": "exportCsvMarkers",
  "csv-markets": "exportCsvMarkets",
  "csv-military": "exportCsvMilitary",
  "csv-regiments": "exportCsvRegiments",
  "csv-notes": "exportCsvNotes",
  "csv-zones": "exportCsvZones"
};
const PICTURES = ["svg", "png", "jpeg", "tiles"] as const;
const FORMATS = [...PICTURES, "map", ...Object.keys(MENU_EXPORTS)] as [string, ...string[]];
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

export function registerExtraTools(kit: Kit): void {
  const { server, cfg, session, history, guarded, text, viewContent, settle, autosave, loadPresets, safeName } = kit;

  /** Runs something that may change the map: undo snapshot first, dropped again if nothing changed. */
  const undoable = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    await history.pushBefore(label);
    try {
      const result = await run();
      if (await history.lastSnapshotMatchesCurrent()) history.dropLast();
      else await autosave();
      return result;
    } catch (err) {
      // Menu/UI actions do not set the bridge's apply-only dirty flag. Compare snapshots instead:
      // a command may throw *after* changing the map, in which case undo must restore it.
      if (await history.lastSnapshotMatchesCurrent().catch(() => false)) history.dropLast();
      else await history.rollback();
      throw err;
    }
  };

  server.registerTool(
    "map_export",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      title: "Export the map to a file",
      description:
        "Exports the map to exportsDir. Pictures: png/jpeg (exact width, height or resolution; an inline preview is returned), svg or tiles (ZIP). Opt-in bitmap supersample 1..4 captures vectors at higher resolution (source capped by export.maxSourcePixels), then filters down via lanczos3, stepdown or fast; the default screenshot path is unchanged. Data: map, json-* (full, minimal, cells), geojson-* (cells, routes, rivers, markers, zones), csv-* (burgs, biomes, relations, goods, markers, markets, military, regiments, notes, zones). only_layers selects exactly the visible layers; layer_preset uses a saved/config or native Azgaar preset; clean hides port anchors, routes, markers and ice. For pictures the whole map is framed and the camera and layers are restored afterwards.",
      inputSchema: {
        inset: insetSchema.optional().describe("Non-destructive atlas: global map, locator rectangle and framed regional loupe. PNG/JPEG only, without supersample/filter."),
        format: z.enum(FORMATS).optional(),
        name: z.string().optional(),
        width: z.number().int().min(1).optional(),
        height: z.number().int().min(1).optional(),
        only_layers: z.array(z.string()).optional(),
        layer_preset: z.string().optional(),
        resolution: z.number().positive().optional(),
        supersample: z.number().int().min(1).max(4).optional(),
        filter: z.enum(["lanczos3", "stepdown", "fast"]).optional(),
        clean: z.boolean().optional(),
        max_image_bytes: z.number().int().min(cfg.limits.imageBytesMin).max(cfg.limits.imageBytesMax).optional()
      }
    },
    guarded(async ({ inset, format, name, width, height, only_layers, layer_preset, resolution, supersample, filter, clean, max_image_bytes }) => {
      const fmt = format ?? cfg.export.format;
      const isPicture = (PICTURES as readonly string[]).includes(fmt);
      const bitmap = fmt === "png" || fmt === "jpeg";
      if (resolution !== undefined && (width !== undefined || height !== undefined))
        throw new Error("map_export: give width/height OR resolution, not both");
      if (!bitmap && (width !== undefined || height !== undefined))
        throw new Error("map_export: width/height only apply to png or jpeg");
      if (!isPicture && resolution !== undefined)
        throw new Error("map_export: resolution only applies to pictures");
      if (!bitmap && (supersample !== undefined || filter !== undefined))
        throw new Error("map_export: supersample/filter only apply to png or jpeg");
      if (inset && (!bitmap || supersample !== undefined || filter !== undefined))
        throw new Error("map_export: inset only supports png/jpeg without supersample/filter");
      if (inset) await session.call("validateInset", inset);
      const factor = supersample ?? 1;
      const imageFilter = filter ?? "lanczos3";
      const view = session.viewportSize();
      const before = isPicture ? await session.call<{ scale: number; visibleMapArea: { x0: number; y0: number; x1: number; y1: number }; mapSize: { width: number } }>("camera") : null;
      let scale = before ? before.mapSize.width / view.width : 1;
      if (resolution !== undefined) scale = resolution;
      else if (bitmap && (width !== undefined || height !== undefined)) {
        const byWidth = width === undefined ? undefined : width / view.width;
        const byHeight = height === undefined ? undefined : height / view.height;
        if (byWidth !== undefined && byHeight !== undefined && Math.abs(byWidth - byHeight) > cfg.limits.scaleTolerance)
          throw new Error(`map_export: width and height must keep the window's aspect ratio (${view.width}x${view.height}); give only one of them`);
        scale = (byWidth ?? byHeight) as number;
      }
      const outW = Math.round(view.width * scale);
      const outH = Math.round(view.height * scale);
      if (isPicture && Math.max(outW, outH) > cfg.export.maxPixels)
        throw new Error(`map_export: ${outW}x${outH} exceeds export.maxPixels (${cfg.export.maxPixels})`);
      if (bitmap && factor > 1 && Math.max(outW * factor, outH * factor) > cfg.export.maxSourcePixels)
        throw new Error(`map_export: ${outW * factor}x${outH * factor} supersampled source exceeds export.maxSourcePixels (${cfg.export.maxSourcePixels})`);
      const layerChange = isPicture && (only_layers !== undefined || layer_preset !== undefined);
      const layersBefore = layerChange ? (await session.call<{ active: string[] }>("layers")).active : null;
      const wantsClean = isPicture && (clean ?? cfg.export.clean);
      let file = "";
      let bytes = 0;
      let picture: Buffer | null = null;
      let downsampleMs = 0;
      let shownLayers: string[] = [];
      try {
        if (layer_preset && isPicture) {
          const saved = loadPresets()[layer_preset];
          await session.call("setLayers", saved ? { only: saved } : { preset: layer_preset });
        }
        if (only_layers !== undefined && isPicture) await session.call("setLayers", { only: only_layers });
        if (wantsClean) await session.call("setCleanMode", true, cfg.export.cleanHide);
        if (isPicture && !inset) {
          await session.call("setCamera", { scale: 1, duration: 0 });
          await settle();
        }
        mkdirSync(cfg.exportsDir, { recursive: true });
        if (bitmap) {
          if (inset) picture = (await captureInset(session, inset, outW, outH, fmt)).bytes;
          else {
            const captured = await session.captureFiltered(scale, fmt, cfg.export.jpegQuality, outW, outH, factor, imageFilter);
            picture = captured.data;
            downsampleMs = captured.downsampleMs;
          }
          const base = name ? safeName(name) : `map-${new Date().toISOString().replace(/[:.]/g, "-")}`;
          file = join(cfg.exportsDir, `${base}.${fmt === "png" ? "png" : "jpg"}`);
          writeFileSync(file, picture);
          bytes = picture.length;
        } else if (fmt === "map") {
          const base = name ? safeName(name) : `map-${new Date().toISOString().replace(/[:.]/g, "-")}`;
          file = join(cfg.exportsDir, `${base}.map`);
          writeFileSync(file, await session.call<string>("exportMap"));
          bytes = statSync(file).size;
        } else {
          const trigger = isPicture ? () => session.call("exportPicture", { format: fmt, resolution })
            : () => session.call("menuRun", { id: MENU_EXPORTS[fmt] });
          const result = await session.captureDownload(trigger, name);
          file = result.file;
          bytes = result.bytes;
        }
        shownLayers = (await session.call<{ active: string[] }>("layers")).active;
      } finally {
        if (wantsClean) await session.call("setCleanMode", false).catch(() => undefined);
        if (layersBefore) await session.call("setLayers", { only: layersBefore }).catch(() => undefined);
        if (before && !inset) {
          const b = before.visibleMapArea;
          await session.call("setCamera", { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, scale: before.scale, duration: 0 }).catch(() => undefined);
        }
      }
      const limit = max_image_bytes ?? cfg.view.maxImageBytes;
      const details: Record<string, unknown> = { exported: fmt, file, saved: file, bytes, clean: wantsClean, layersOnScreen: shownLayers, ...(inset ? { inset } : {}) };
      const content: Content[] = [];
      if (bitmap && picture) {
        details.widthPx = outW;
        details.heightPx = outH;
        details.scale = Math.round(scale * 1e3) / 1e3; // const-ok: three decimal places for display
        if (supersample !== undefined || filter !== undefined)
          Object.assign(details, { supersample: factor, filter: imageFilter, downsampleMs });
        if (!cfg.view.textOnly) {
          details.inlinePicture = bytes <= limit ? "the export itself" : `a preview (export heavier than ${limit} bytes)`;
          if (bytes <= limit) content.push({ type: "image", data: picture.toString("base64"), mimeType: MIME[fmt === "png" ? ".png" : ".jpg"] });
          else {
            if (inset) {
              const shot = await session.call<{ base64: string }>("downsampleImage", { base64: picture.toString("base64"), width: view.width, height: view.height, mimeType: "image/jpeg", filter: "fast", quality: cfg.view.jpegQuality / 100 });
              content.push({ type: "image", data: shot.base64, mimeType: "image/jpeg" });
            } else {
              const shot = await session.screenshot({ maxBytes: limit });
              content.push({ type: "image", data: shot.data.toString("base64"), mimeType: shot.mimeType });
            }
          }
        }
      }
      content.push(text(details));
      return { content };
    })
  );

  server.registerTool(
    "map_3d",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      title: "3D picture: relief scene or globe",
      description:
        "Saves a 3D picture of the map (Azgaar's own 3D engine) in the exports folder and returns its path, size and weight plus an inline picture. mode relief = a lit terrain scene; globe = the map wrapped on a planet (its true longitude span is respected and the closing ocean fills the rest, edges faded so no seam shows). preset: satellite (procedural terrain texture, relief or globe), heightmap or biomes (the flat map drawn with that layer preset is the texture). rotation {x, y} in degrees: globe = longitude/latitude of the view centre (0/0 = the middle of the map); relief = azimuth around the map and tilt from straight down. hemispheres both (globe) saves two pictures, west and east, for a map that does not cover the whole planet; diptych saves a single composite plate showing both hemispheres side-by-side with planetary cartouche. sun_position {x, y, z} or {azimuth, altitude} in degrees; atmosphere = sky/fog (relief), Fresnel halo (globe, on by default); clouds = procedural cloud shell (globe only); erosion = terrain mesh (relief) or baked globe bump detail; height_scale = terrain exaggeration (relief) or satellite shading scale (globe); diptych: true aliases hemispheres: diptych; distance = camera distance; texture_resolution (pixels, a power of two; clamped to what the graphics card and Azgaar accept); clean hides port anchors, routes, markers and ice from the texture. output png, jpeg or webp. The picture has the size of the browser window. The flat map, its layers and its settings are put back afterwards. Needs WebGL: a browser without it gives a clear error.",
      inputSchema: {
        mode: z.enum(["relief", "globe"]),
        preset: z.enum(Object.keys(cfg.view3d.presets) as [string, ...string[]]).optional(),
        rotation: z.object({ x: z.number(), y: z.number() }).optional(),
        hemispheres: z.enum(["single", "both", "diptych"]).optional(),
        diptych: z.boolean().optional(), // alias for hemispheres: diptych
        sun_position: z.union([
          z.object({ x: z.number(), y: z.number(), z: z.number().optional() }),
          z.object({ azimuth: z.number(), altitude: z.number().min(-90).max(90) })
        ]).optional(),
        atmosphere: z.boolean().optional(),
        clouds: z.boolean().optional(),
        erosion: z.boolean().optional(),
        height_scale: z.number().min(1).optional(),
        distance: z.number().positive().optional(),
        texture_resolution: z.number().int().min(1).optional(),
        labels: z.boolean().optional(),
        clean: z.boolean().optional(),
        output: z.enum(["png", "jpeg", "webp"]).optional(),
        name: z.string().optional(),
        max_image_bytes: z.number().int().min(cfg.limits.imageBytesMin).max(cfg.limits.imageBytesMax).optional()
      }
    },
    guarded(async args => {
      const { mode, preset, rotation, hemispheres, diptych, sun_position, atmosphere, clouds, erosion, height_scale, distance, texture_resolution, labels, clean, output, name, max_image_bytes } = args;
      const globe = mode === "globe";
      if (diptych && hemispheres && hemispheres !== "diptych") throw new Error("map_3d: diptych conflicts with hemispheres");
      const hemisphereMode = diptych ? "diptych" : hemispheres;
      if ((hemisphereMode === "both" || hemisphereMode === "diptych") && !globe) throw new Error(`map_3d: hemispheres ${hemisphereMode} only exists for the globe`);
      if (clouds && !globe) throw new Error("map_3d: clouds only exist on the globe");
      const chosen = preset ? cfg.view3d.presets[preset] : undefined;
      const fmt = output ?? cfg.view3d.format;
      const wantsClean = clean ?? cfg.export.clean;
      const layerSet = chosen?.layerPreset ? loadPresets()[chosen.layerPreset] : undefined;
      if (chosen?.layerPreset && !layerSet) throw new Error(`map_3d: layer preset "${chosen.layerPreset}" does not exist (see map_layers)`);
      const layersBefore = layerSet ? (await session.call<{ active: string[] }>("layers")).active : null;
      const notes: string[] = [];
      const shots: { label: string; file: string; widthPx: number; heightPx: number; bytes: number; inline: Content }[] = [];
      let globeInfo: Record<string, unknown> | undefined;
      let opened: Record<string, unknown> | undefined;
      const limit = max_image_bytes ?? cfg.view.maxImageBytes;
      mkdirSync(cfg.exportsDir, { recursive: true });
      const base = name ? safeName(name) : `map-3d-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      const preview = async (): Promise<Content> => {
        const small = await session.call<{ data: string; mimeType: string }>("capture3d", "jpeg", cfg.view.jpegQuality);
        return { type: "image", data: small.data, mimeType: small.mimeType };
      };
      const take = async (label: string | null): Promise<void> => {
        const pic = await session.call<{ data: string; mimeType: string; width: number; height: number }>("capture3d", fmt, cfg.view3d.quality);
        const bytes = Buffer.from(pic.data, "base64");
        const file = join(cfg.exportsDir, `${base}${label ? `-${label}` : ""}.${fmt === "jpeg" ? "jpg" : fmt}`);
        writeFileSync(file, bytes);
        const inline: Content = bytes.length <= limit && fmt !== "webp" ? { type: "image", data: pic.data, mimeType: pic.mimeType } : await preview();
        shots.push({ label: label ?? mode, file, widthPx: pic.width, heightPx: pic.height, bytes: bytes.length, inline });
      };
      try {
        if (layerSet) await session.call("setLayers", { only: layerSet });
        if (wantsClean) await session.call("setCleanMode", true, cfg.export.cleanHide);
        const first = (hemisphereMode === "both" || hemisphereMode === "diptych") ? { x: 0, y: rotation?.y ?? 0 } : rotation;
        opened = await session.call<Record<string, unknown>>("open3d", {
          mode,
          satellite: chosen?.satellite,
          erosion: erosion ?? chosen?.erosion,
          atmosphere,
          clouds,
          sun: sun_position,
          scale: height_scale,
          textureResolution: texture_resolution,
          labels,
          rotation: first,
          distance
        });
        if (opened.finished === false) notes.push("the 3D picture was still changing when the wait ran out: ask again, or lower texture_resolution");
        if (globe) globeInfo = await session.call<Record<string, unknown>>("globeInfo");
        if (hemisphereMode === "diptych") {
          if (rotation && rotation.x !== 0) notes.push("rotation.x is ignored with hemispheres diptych (the two views are centred on the west and east halves of the map)");
          const span = Number(globeInfo?.mapLongitudeDegrees ?? 0);
          const shift = span * cfg.view3d.hemisphereOffset;
          const pic = await session.call<{ data: string; mimeType: string; width: number; height: number }>(
            "captureDiptych",
            fmt,
            cfg.view3d.quality,
            shift,
            rotation?.y ?? 0,
            distance
          );
          const bytes = Buffer.from(pic.data, "base64");
          const file = join(cfg.exportsDir, `${base}-diptych.${fmt === "jpeg" ? "jpg" : fmt}`);
          writeFileSync(file, bytes);
          let inline: Content;
          if (bytes.length <= limit && fmt !== "webp") {
            inline = { type: "image", data: pic.data, mimeType: pic.mimeType };
          } else {
            const smallDipt = await session.call<{ data: string; mimeType: string }>(
              "captureDiptych",
              "jpeg",
              cfg.view.jpegQuality,
              shift,
              rotation?.y ?? 0,
              distance
            );
            inline = { type: "image", data: smallDipt.data, mimeType: smallDipt.mimeType };
          }
          shots.push({ label: "diptych", file, widthPx: pic.width, heightPx: pic.height, bytes: bytes.length, inline });
        } else if (hemisphereMode === "both") {
          if (rotation && rotation.x !== 0) notes.push("rotation.x is ignored with hemispheres both (the two views are centred on the west and east halves of the map)");
          const span = Number(globeInfo?.mapLongitudeDegrees ?? 0);
          const shift = span * cfg.view3d.hemisphereOffset;
          for (const [label, x] of [["west", -shift], ["east", shift]] as const) {
            await session.call("view3d", { x, y: rotation?.y ?? 0, distance });
            await take(label);
          }
        } else await take(null);
      } finally {
        await session.call("close3d").catch(() => undefined);
        if (wantsClean) await session.call("setCleanMode", false).catch(() => undefined);
        if (layersBefore) await session.call("setLayers", { only: layersBefore }).catch(() => undefined);
      }
      const content: Content[] = shots.map(s => s.inline);
      content.push(text({ saved: shots.map(s => ({ view: s.label, file: s.file, widthPx: s.widthPx, heightPx: s.heightPx, bytes: s.bytes })), format: fmt, mode, preset: preset ?? null, clean: wantsClean, settings: opened?.settings, globe: globeInfo, notes }));
      return { content };
    })
  );

  server.registerTool(
    "map_menu",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      title: "Azgaar's action menu",
      description:
        "Azgaar's own list of actions, the same ones its search bar offers: open any editor or overview (states, burgs, cultures, religions, provinces, heightmap, biomes, diplomacy, zones, military, markers, routes, rivers, notes, units, coastline...), regenerate anything (regenerateRivers, regenerateBurgs, regenerateCultures, regenerateStates, regenerateReliefIcons, regenerateMarkers...), open charts and hierarchies. action=list (optional query to filter) shows the ids; action=run executes one: the previous state is saved first (map_undo reverts it). Editors open as dialogs: operate them with map_ui.",
      inputSchema: { action: z.enum(["list", "run"]), id: z.string().optional(), query: z.string().optional() }
    },
    guarded(async ({ action, id, query }) => {
      if (action === "list") return { content: [text(await session.call("menuList", { query }))] };
      if (!id) throw new Error('map_menu run: "id" is required (see action list)');
      const result = await undoable(`menu ${id}`, () => session.call("menuRun", { id }));
      await settle();
      return { content: [text(result)] };
    })
  );

  server.registerTool(
    "map_ui",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      title: "Use Azgaar's interface",
      description:
        "Operate Azgaar's own screen like a person: the open dialogs (editors opened with map_menu), the side menu and any button or field, so that nothing the interface offers is out of reach. list: open dialogs with their text, and their controls (scope dialogs | menu | page; query filters). find: same with a query. get: one control's value. hidden:true also lists controls of closed panels (like the Options side menu: by id they can still be read and set). click / set: act on a control given by ref (from list/find), id, selector or text (the visible label); set takes value for fields, checkboxes and drop-downs. When a text fits several controls equally well, the one acted on is reported with the others in alsoMatched and a warning: name the one you mean by ref, id or selector. upload: give path plus either a file input (id/selector) or the button that opens the file picker (text/ref/id), e.g. a heightmap picture. close_dialogs. After a click or set the open dialogs are returned; clicks and sets are undoable (the previous state is saved, and dropped if nothing changed). Set view:true to also get the picture.",
      inputSchema: {
        action: z.enum(["list", "find", "get", "click", "set", "close_dialogs", "upload"]),
        path: z.string().optional(),
        scope: z.enum(["dialogs", "menu", "page"]).optional(),
        query: z.string().optional(),
        ref: z.string().optional(),
        id: z.string().optional(),
        selector: z.string().optional(),
        text: z.string().optional(),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
        limit: z.number().int().positive().optional(),
        hidden: z.boolean().optional(),
        view: z.boolean().optional()
      }
    },
    guarded(async ({ action, view, path, ...args }) => {
      let result: unknown;
      if (action === "list" || action === "find") result = await session.call("uiList", args);
      else if (action === "get") result = await session.call("uiGet", args);
      else if (action === "close_dialogs") result = await session.call("uiCloseDialogs", args);
      else if (action === "upload") {
        if (!path || !existsSync(path)) throw new Error(`map_ui upload: "path" must be an existing file (got ${path ?? "nothing"})`);
        const target = args.selector ?? (args.id ? `[id="${args.id.replace(/"/g, "")}"]` : undefined);
        result = await undoable(`ui upload ${args.id ?? args.selector ?? args.text ?? args.ref}`, async () => {
          const page = await session.ensure();
          const isFileInput = target ? await page.evaluate(sel => (document.querySelector(sel) as HTMLInputElement | null)?.type === "file", target) : false;
          if (isFileInput && target) await session.setInputFile(target, path);
          else await session.uploadViaPicker(() => session.call("uiClick", args), path);
          await settle();
          return session.call("uiList", { scope: "dialogs", limit: 0 });
        });
      }
      else result = await undoable(`ui ${action} ${args.text ?? args.id ?? args.ref ?? args.selector ?? ""}`.trim(), () => session.call(action === "click" ? "uiClick" : "uiSet", args));
      const content: Content[] = [text(result)];
      if (view) {
        await settle();
        content.unshift(await viewContent());
      }
      return { content };
    })
  );

  server.registerTool(
    "map_options",
    {
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      title: "Generation settings",
      description:
        "Read or change what the NEXT generated map is built from (Azgaar's Options): number of states, cultures (and the culture set), religions, burgs, province ratio, growth rates, heightmap template (continents, archipelago, island... see the choices returned), points density, map size and position, lake limits. action=get shows the values and the valid choices (section generation by default; map = the current map's own settings: units, climate, lore, style preset; app = preferences). A new map re-rolls most settings at random unless they are pinned: action=set pins the values you give (partial object, validated by Azgaar's own rules, nothing changes if anything is refused), e.g. {states:{limit:12}, template:\"archipelago\"}; section map pins climate, units, calendar and map name for the next map. Then call map_file new to generate with them. action=release forgets pins (all, or names) so settings are random again. The CURRENT map's settings are changed with the editors (map_menu / map_ui).",
      inputSchema: { action: z.enum(["get", "set", "release"]), section: z.enum(["generation", "map", "app"]).optional(), values: z.record(z.string(), z.unknown()).optional(), names: z.array(z.string()).optional() }
    },
    guarded(async ({ action, section, values, names }) => {
      if (action === "get") return { content: [text(await session.call("getSettings", { section }))] };
      if (action === "release") return { content: [text(await session.call("releaseSettings", { names }))] };
      if (!values) throw new Error('map_options set: "values" is required');
      return { content: [text(await session.call("setSettings", { section, values }))] };
    })
  );
}
