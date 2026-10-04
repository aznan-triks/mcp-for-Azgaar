// Tools that open the rest of Azgaar to the AI: file exports, Azgaar's own action menu, the interface itself,
// and the generation settings. Registered next to the core tools (see tools.ts).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
  const { server, cfg, session, history, guarded, text, viewContent, settle, autosave } = kit;

  /** Runs something that may change the map: undo snapshot first, dropped again if nothing changed. */
  const undoable = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    await history.pushBefore(label);
    try {
      const result = await run();
      if (await history.lastSnapshotMatchesCurrent()) history.dropLast();
      else await autosave();
      return result;
    } catch (err) {
      const dirty = await session.call<boolean>("lastFailureLeftMapDirty").catch(() => true);
      if (dirty && (await history.lastSnapshotMatchesCurrent().then(same => !same).catch(() => true))) await history.rollback();
      else history.dropLast();
      throw err;
    }
  };

  server.registerTool(
    "map_export",
    {
      title: "Export the map to a file",
      description:
        `Exports exactly what Azgaar's Export menu exports, into the exports folder (the path is returned). Pictures: svg, png, jpeg (what is on screen NOW: choose the layers first, here or with map_layers), tiles (zip of png tiles). map = the .map save file. Data: json-* (full, minimal, pack/grid cells), geojson-* (cells, routes, rivers, markers, zones), csv-* (burgs, biomes, relations, goods, markers, markets, military, regiments, notes, zones). Options: only_layers = show exactly these layers and hide the others (e.g. ["heightmap","cultures"]); layer_preset = one of Azgaar's layer presets (political, cultural, religions, provinces, biomes, heightmap, physical...); resolution = picture scale factor; name = file name. The whole map is framed for pictures. A png/jpeg is also returned as an image unless the model cannot see images.`,
      inputSchema: {
        format: z.enum(FORMATS),
        name: z.string().optional(),
        only_layers: z.array(z.string()).optional(),
        layer_preset: z.string().optional(),
        resolution: z.number().positive().optional()
      }
    },
    guarded(async ({ format, name, only_layers, layer_preset, resolution }) => {
      mkdirSync(cfg.exportsDir, { recursive: true });
      const isPicture = (PICTURES as readonly string[]).includes(format);
      if (only_layers?.length || layer_preset) await session.call("setLayers", { only: only_layers, preset: layer_preset });
      if (isPicture) await session.call("setCamera", { scale: 1, duration: 0 });
      let result: { file: string; bytes: number };
      if (format === "map") {
        const safe = (name ?? `map-${Date.now()}`).replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\.map$/i, "");
        const file = join(cfg.exportsDir, `${safe}.map`);
        writeFileSync(file, await session.call<string>("exportMap"));
        result = { file, bytes: statSync(file).size };
      } else if (isPicture) {
        result = await session.captureDownload(() => session.call("exportPicture", { format, resolution }), name);
      } else {
        result = await session.captureDownload(() => session.call("menuRun", { id: MENU_EXPORTS[format] }), name);
      }
      const layers = await session.call<{ active: string[] }>("layers");
      const content: Content[] = [text({ exported: format, file: result.file, bytes: result.bytes, layersOnScreen: layers.active })];
      const ext = result.file.slice(result.file.lastIndexOf(".")).toLowerCase();
      if (MIME[ext] && !cfg.view.textOnly) {
        if (result.bytes <= cfg.view.maxImageBytes) content.unshift({ type: "image", data: readFileSync(result.file).toString("base64"), mimeType: MIME[ext] });
        else content.push(text("The picture is too large to attach here; it is saved at the path above."));
      }
      return { content };
    })
  );

  server.registerTool(
    "map_menu",
    {
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
      title: "Use Azgaar's interface",
      description:
        "Operate Azgaar's own screen like a person: the open dialogs (editors opened with map_menu), the side menu and any button or field, so that nothing the interface offers is out of reach. list: open dialogs with their text, and their controls (scope dialogs | menu | page; query filters). find: same with a query. get: one control's value. hidden:true also lists controls of closed panels (like the Options side menu: by id they can still be read and set). click / set: act on a control given by ref (from list/find), id, selector or text (the visible label); set takes value for fields, checkboxes and drop-downs. upload: give path plus either a file input (id/selector) or the button that opens the file picker (text/ref/id), e.g. a heightmap picture. close_dialogs. After a click or set the open dialogs are returned; clicks and sets are undoable (the previous state is saved, and dropped if nothing changed). Set view:true to also get the picture.",
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
          if (isFileInput && target) await page.setInputFiles(target, path, { timeout: cfg.limits.exportTimeoutMs });
          else {
            // a button that opens the file picker: answer the picker with the file
            const chooser = page.waitForEvent("filechooser", { timeout: cfg.limits.exportTimeoutMs });
            chooser.catch(() => undefined);
            await session.call("uiClick", args);
            await (await chooser).setFiles(path);
          }
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
