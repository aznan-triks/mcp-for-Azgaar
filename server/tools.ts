import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cleanError, type MapSession } from "./browser.ts";
import type { Config } from "./config.ts";
import type { Autosave } from "./autosave.ts";
import type { History } from "./history.ts";
import type { Exclusive } from "./queue.ts";
import { registerExtraTools } from "./tools-extra.ts";

export type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export interface ToolResult {
  [key: string]: unknown;
  content: Content[];
  isError?: boolean;
}

const text = (value: unknown): Content => ({ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) });

export const SERVER_INSTRUCTIONS = `You edit a fantasy map shown live in a browser window (Azgaar's Fantasy Map Generator, offline). The person watches the window and may also edit by hand: look before you act.
Workflow: map_summary (states, ids) -> map_view with grid/state_ids (you see the map; add region {x0,y0,x1,y1} to zoom on an area; if you cannot see images, pass text_map:true to get the map drawn in characters) -> map_select (red preview appears live) -> map_view to check the preview -> map_apply -> map_view to verify.
Finding things: when the person names a city or state, use map_list with name (case-insensitive part of the name) to get its id and position. Lists are cut at 50 rows by default; total is the real count.
Coordinates: "map units" are the map's own coordinates (the graticule labels in map_view). Screenshot pixels are the browser window pixels: convert with map_locate {px,py}. Cells have integer ids; states, provinces, cultures, religions, burgs (cities), rivers, routes and markers too (0 = none/unclaimed).
Extending a state: map_select shape ring {state, depth} (cells just outside it), optionally intersect with a rect to go one way only (combine_op intersect), then map_apply assignState. Capitals are never taken. Merging states: mergeStates; founding one: createState; provinces: createProvince (needs state-owned land); cultures: createCulture (then give it cells with assignCulture); religions: createReligion. Labels: map_list kind=labels shows them, moveLabel shifts/hides/resets one. Emblems: regenerateEmblem / setEmblemStyle. Legends: map_legend explains the colours of a layer (states, provinces, cultures, religions, biomes, heightmap...). 3D scenes and globes: map_3d. Annotations: map_apply annotate puts arrows, markers, lines, areas and text permanently on the map.
Every map_apply is undoable with map_undo, and a failed edit restores the map by itself. Prefer small, verifiable steps; report what changed using the numbers returned and the warnings.
Edits to relief, cultures, religions, provinces or rivers are only visible when their layer is on: use map_layers (e.g. show heightmap or relief to check terrain).
Terrain edits keep coasts and lakes frozen by default (scope land): fast and nothing else changes. Use scope all to create/remove land or lakes; that rebuilds the map, renumbers cells and may shift coastal borders by a cell elsewhere. Open sea is not selectable: shapeCone / shapeRidge can raise an island there.
Call map_commands once to learn the available edit commands and their exact parameters.
Everything else in Azgaar is reachable too: map_export saves pictures and data (svg, png, jpeg, json, geojson, csv, .map; use only_layers/layer_preset to choose what is drawn); map_options and map_file new set how a new map is generated; map_menu runs Azgaar's own actions (open any editor, regenerate rivers/burgs/cultures...); map_ui then operates the open dialogs and any button or field of the interface.`;

export function registerTools(server: McpServer, cfg: Config, session: MapSession, history: History, exclusive: Exclusive, saver: Autosave): void {
  // One request at a time (shared with the background autosave): the page and the history are shared state.
  const guarded =
    <A>(fn: (args: A) => Promise<ToolResult>) =>
    async (args: A): Promise<ToolResult> => {
      try {
        return await exclusive.run(() => fn(args));
      } catch (err) {
        return { isError: true, content: [text(cleanError(err))] };
      }
    };

  const screenshotContent = async (): Promise<Content> => {
    const { data, mimeType } = await session.screenshot();
    return { type: "image", data: data.toString("base64"), mimeType };
  };
  const settle = () => new Promise<void>(r => setTimeout(r, cfg.view.settleMs));
  // Models that cannot look at images (set view.textOnly or FMG_TEXT_ONLY=1) get a map drawn with characters instead.
  const viewContent = async (): Promise<Content> => (cfg.view.textOnly ? text(await session.call("textMap", {})) : screenshotContent());
  const autosave = async (): Promise<void> => {
    await saver.write();
  };
  const safeName = (name: string): string => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/.test(name) || name.includes("..")) throw new Error("Invalid map name: use letters, digits, space, dot, dash, underscore (max 64)");
    return name.replace(/\.map$/i, "");
  };

  const presetsPath = join(cfg.mapsDir, cfg.presetsFile);
  const loadSavedPresets = (): Record<string, string[]> => {
    try {
      return JSON.parse(readFileSync(presetsPath, "utf8"));
    } catch {
      return {};
    }
  };
  const loadPresets = (): Record<string, string[]> => ({ ...cfg.layerPresets, ...loadSavedPresets() });
  const writePresets = (p: Record<string, string[]>) => {
    mkdirSync(cfg.mapsDir, { recursive: true });
    writeFileSync(presetsPath, JSON.stringify(p, null, 2));
  };

  server.registerTool(
    "map_view",
    {
      title: "See the map",
      description:
        "Screenshot of what the browser window currently shows, plus a legend (state ids/names/colours) and the camera. Options draw temporary annotations for this screenshot only: grid = coordinate graticule labelled in map units; state_ids = id badge on each state; cell_ids = cell ids (only when few cells are visible: zoom in first). whole_map=true first frames the whole map (otherwise the shot shows exactly what the window shows now, zoom included). A pending selection is always visible as a red overlay. `region` {x0,y0,x1,y1} in map units first zooms the window onto that rectangle (it stays there: call map_camera with scale 1 to see the whole map again; its reply states the scale really applied, which may be higher if the window cannot show the whole map at 1).",
      inputSchema: {
        grid: z.boolean().optional(),
        state_ids: z.boolean().optional(),
        cell_ids: z.boolean().optional(),
        region: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }).optional(),
        whole_map: z.boolean().optional(),
        text_map: z.boolean().optional().describe("Answer with a map drawn in characters instead of a screenshot (for models that cannot see images)"),
        cols: z.number().int().optional().describe("Width of the character map"),
        rows: z.number().int().optional().describe("Height of the character map")
      }
    },
    guarded(async ({ grid, state_ids, cell_ids, region, whole_map, text_map, cols, rows }) => {
      if (whole_map && !region) await session.call("setCamera", { scale: 1, duration: 0 });
      if (region) await session.call("showRegion", region);
      const wantsNotes = Boolean(grid || state_ids || cell_ids);
      const notes = wantsNotes ? await session.call<Record<string, unknown>>("annotate", { grid, stateIds: state_ids, cellIds: cell_ids }) : {};
      await settle();
      const asText = text_map ?? cfg.view.textOnly;
      const image = asText ? text(await session.call("textMap", { cols, rows })) : await screenshotContent();
      if (wantsNotes) await session.call("clearAnnotations");
      const info = await session.call<{ states: { id: number; name: string; color: string }[]; camera: { scale?: number } }>("summary");
      const camera = info.camera;
      const coverageNote = (!whole_map && !region && camera && typeof camera.scale === "number" && camera.scale > 1.05)
        ? `Camera is zoomed in (scale ${camera.scale}): only part of the map is visible in this shot. Pass whole_map: true or call map_camera with scale: 1 to see the entire map.`
        : undefined;
      return { content: [image, text({ camera, ...(coverageNote ? { coverageNote } : {}), annotations: notes, legend: info.states.map(s => ({ id: s.id, name: s.name, color: s.color })) })] };
    })
  );

  server.registerTool(
    "map_status",
    { title: "Diagnostics", description: "Health check: local address, page errors, and any outside-network request that was blocked (the map must run 100 % offline). Does not open the browser: browserOpen tells whether it is open (any map tool opens it).", inputSchema: {} },
    guarded(async () => {
      if (!session.isOpen())
        return { content: [text({ browserOpen: false, localUrl: session.baseUrl, startupWarnings: session.startupWarnings, history: history.state(), note: "The browser opens at the first map tool (map_summary, map_view...)." })] };
      return { content: [text({ browserOpen: true, localUrl: session.baseUrl, bridgeVersion: await session.call("apiVersion"), blockedOutsideRequests: [...session.blockedRequests], pageErrors: session.pageErrors.slice(-10), startupWarnings: session.startupWarnings, history: history.state() })] };
    })
  );

  server.registerTool(
    "map_summary",
    { title: "Map overview", description: "Seed, size, counts, and every state (id, name, cells, area, burgs, capital, pole position, neighbours) with fresh figures.", inputSchema: {} },
    guarded(async () => ({ content: [text(await session.call("summary"))] }))
  );

  server.registerTool(
    "map_locate",
    {
      title: "What is at this point?",
      description: "Full facts about one cell: state, province, culture, religion, biome, height, burg, neighbours. Give screenshot pixel (px,py), map point (x,y), or a cell id.",
      inputSchema: { px: z.number().optional(), py: z.number().optional(), x: z.number().optional(), y: z.number().optional(), cell: z.number().int().optional() }
    },
    guarded(async args => ({ content: [text(await session.call("locate", args))] }))
  );

  server.registerTool(
    "map_list",
    {
      title: "List entities",
      description:
        "List entities: states, provinces, cultures, religions, burgs (cities), markers, markerTypes (the types addMarker accepts), routes, rivers, labels (what stands where on the map, with the shift moveLabel applied). `name` keeps only entries whose name contains that text (case-insensitive): the way to find a city or state by name. Provinces and burgs can be filtered by state. Spatial filters: `rect` {x0, y0, x1, y1} restricts to a box; `near` {burg: id} or {river: id} or {x, y} sorts by distance; `within` limits distance; `direction` (N, NE, E, SE, S, SW, W, NW) keeps only entities on that compass side. Long lists are cut at `limit` (default 50); `total` is the real count.",
      inputSchema: {
        kind: z.string(),
        name: z.string().optional(),
        state: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(cfg.limits.listMax).optional(),
        rect: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }).strict().optional(),
        near: z.object({ x: z.number().optional(), y: z.number().optional(), burg: z.number().int().min(1).optional(), river: z.number().int().min(1).optional() }).strict().optional(),
        within: z.number().min(0).optional(),
        direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).optional()
      }
    },
    guarded(async ({ kind, name, state, limit, rect, near, within, direction }) => {
      const spatial = { rect, near, within, direction };
      const wanted = Object.values(spatial).some(v => v !== undefined);
      const filter = wanted ? Object.fromEntries(Object.entries(spatial).filter(([, v]) => v !== undefined)) : undefined;
      return { content: [text(await session.call("list", kind, state, limit, name, filter))] };
    })
  );

  server.registerTool(
    "map_select",
    {
      title: "Select cells",
      description:
        "Build a selection of cells (shown in red in the browser at once). Shapes: circle{x,y,radius}, rect{x0,y0,x1,y1}, polygon{points}, cells{cells}, state{state}, province{province}, border{from,to,depth} (depth layers of state `from` along its border with `to`), ring{state,depth} (layers just outside a state, whoever owns them: the way to extend a state, restrict it to one direction by intersecting with a rect), rim{state,depth} (layers just inside a state along its land border), flood{start,match,max_cells}. Then map_apply assignState. Options: land_only (default true), only_state, combine_op (add|subtract|intersect) with combine_with (earlier selection id). Returns the selection id, cell count, bounds and per-state counts. Call map_commands for the exact shape list.",
      inputSchema: {
        shape: z.string(),
        args: z.record(z.string(), z.unknown()),
        land_only: z.boolean().optional(),
        only_state: z.number().int().min(0).optional(),
        combine_op: z.enum(["add", "subtract", "intersect"]).optional(),
        combine_with: z.string().optional()
      }
    },
    guarded(async ({ shape, args, ...options }) => ({ content: [text(await session.call("select", shape, args, options))] }))
  );

  server.registerTool(
    "map_commands",
    { title: "List edit commands", description: "The edit commands map_apply accepts, with parameters, plus the selection shapes and options. Call once before editing.", inputSchema: {} },
    guarded(async () => ({ content: [text(await session.call("describe"))] }))
  );

  const runEdit = async (cmd: string, p: Record<string, unknown>, view?: boolean): Promise<ToolResult> => {
    await history.pushBefore(cmd);
    let result: { changed?: number };
    try {
      result = await session.call<{ changed?: number }>("apply", cmd, p);
    } catch (err) {
      // A plain validation error changed nothing; any other failure may have left the map half-edited.
      const dirty = await session.call<boolean>("lastFailureLeftMapDirty").catch(() => true);
      if (dirty) {
        await history.rollback();
        throw new Error(`${cleanError(err)} (the map was restored to its state before this edit)`);
      }
      history.dropLast();
      throw err;
    }
    if (result.changed === 0) history.dropLast();
    else await autosave();
    const content: Content[] = [text({ result, history: history.state() })];
    if (view) {
      await settle();
      content.unshift(await viewContent());
    }
    return { content };
  };

  server.registerTool(
    "map_apply",
    {
      title: "Edit the map",
      description:
        "Run an edit command (see map_commands) on a selection or entity. The previous state is saved first (map_undo reverts it) and the new state is autosaved. Returns exact before/after figures, skipped cells (water, capitals...) and warnings. Set view=true to also get a screenshot.",
      inputSchema: { command: z.string(), params: z.record(z.string(), z.unknown()), view: z.boolean().optional() }
    },
    guarded(async ({ command, params, view }) => runEdit(command, params, view))
  );

  server.registerTool(
    "map_legend",
    {
      title: "Legend boxes",
      description:
        "Show or hide a legend box on the map: it explains the colours of a layer and is saved with the map (so it is in exports). layer: states, provinces (state = keep one state), cultures, religions, biomes, zones, heightmap (elevation bands), temperature, precipitation, population, routes, goods, markets, trade, or custom (items = \"#aa3355=Dry lands;#3355aa=Wet lands\"). Several boxes can be on at once; title names a box (default: the layer name) and is how it is hidden again (action hide, or hide_all). Placement: corner (top-left, top-right, bottom-left, bottom-right) or x/y = where the box's bottom-right corner sits in % of the map; columns (items per column) and opacity (background) apply to every box. Undoable with map_undo. view=true also returns a screenshot.",
      inputSchema: {
        action: z.enum(["show", "hide", "hide_all"]),
        layer: z.enum(["states", "provinces", "cultures", "religions", "biomes", "zones", "heightmap", "temperature", "precipitation", "population", "routes", "goods", "markets", "trade", "custom"]).optional(),
        title: z.string().optional(),
        items: z.string().optional(),
        state: z.number().int().min(1).optional(),
        corner: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
        x: z.number().min(0).max(100).optional(),
        y: z.number().min(0).max(100).optional(),
        columns: z.number().int().min(1).max(100).optional(),
        opacity: z.number().min(0).max(1).optional(),
        view: z.boolean().optional()
      }
    },
    guarded(async ({ view, ...params }) => {
      const given = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
      return runEdit("legend", given, view);
    })
  );

  server.registerTool(
    "map_undo",
    {
      title: "Undo / redo",
      description: "Revert the last map_apply (undo) or re-apply it (redo), or list what can be undone. Restores the exact saved map; the browser reloads it (about 2 s). Selections survive (their cells are found again by position); check with map_view before editing. On undo, an automatic rescue snapshot of the map right before reverting is saved to maps/rescue-before-undo.map so uncheckpointed human edits are never lost (reloaded via map_file load name=rescue-before-undo).",
      inputSchema: { action: z.enum(["undo", "redo", "list"]) }
    },
    guarded(async ({ action }) => {
      if (action === "list") return { content: [text(history.state())] };
      const entry = action === "undo" ? await history.undo() : await history.redo();
      await autosave();
      const details: Record<string, unknown> = { done: action, step: entry.label, history: history.state() };
      if ("rescueFile" in entry && entry.rescueFile) {
        details.rescueSnapshot = "maps/rescue-before-undo.map (reload with map_file load name=rescue-before-undo)";
      }
      return { content: [text(details)] };
    })
  );

  server.registerTool(
    "map_layers",
    {
      title: "Show / hide map layers",
      description:
        "Layers are what the person sees: states, borders, provinces, cultures, religions, biomes, heightmap, relief, temperature, rivers, routes, burgIcons, labels, cells, grid... Call with no arguments to list active and available layers; pass show and/or hide (arrays of layer ids) to change them, or only (exactly these layers, all others hidden; [] hides everything). save_preset {name} remembers the layers now shown; preset {name} restores them (kept in maps/layer-presets.json). Built-in presets: topography, biomes, political (config layerPresets); a saved preset of the same name replaces a built-in. Edits to relief, cultures, religions or provinces are only visible when their layer is on.",
      inputSchema: {
        show: z.array(z.string()).optional(),
        hide: z.array(z.string()).optional(),
        only: z.array(z.string()).optional(),
        save_preset: z.string().optional(),
        preset: z.string().optional()
      }
    },
    guarded(async ({ show, hide, only, save_preset, preset }) => {
      const presets = loadPresets();
      if (save_preset) {
        const now = await session.call<{ active: string[] }>("layers");
        writePresets({ ...loadSavedPresets(), [safeName(save_preset)]: now.active });
        return { content: [text({ savedPreset: save_preset, layers: now.active })] };
      }
      if (preset) {
        const layers = presets[safeName(preset)];
        if (!layers) throw new Error(`Unknown preset "${preset}". Saved: ${Object.keys(presets).join(", ") || "none"}`);
        return { content: [text(await session.call("setLayers", { only: layers }))] };
      }
      if (!show?.length && !hide?.length && !only) return { content: [text({ ...(await session.call<object>("layers")), presets: Object.keys(presets) })] };
      return { content: [text(await session.call("setLayers", { show, hide, only }))] };
    })
  );

  server.registerTool(
    "map_camera",
    {
      title: "Move the camera",
      description: "Zoom/pan the view (what the person sees). x,y = map units to centre on (default: map centre), scale 1 = whole map, higher = closer. The map clamps the scale to its own limits: the reply gives the scale really applied and a warning when it differs from the one asked. duration_ms animates the move.",
      inputSchema: { x: z.number().optional(), y: z.number().optional(), scale: z.number().min(cfg.limits.zoomMin).max(cfg.limits.zoomMax).optional(), duration_ms: z.number().int().min(0).max(cfg.limits.cameraMsMax).optional() }
    },
    guarded(async ({ x, y, scale, duration_ms }) => {
      const camera = await session.call<{ scale: number }>("setCamera", { x, y, scale, duration: duration_ms });
      // The map clamps the zoom silently: tell the AI when the scale it asked for is not the one it got.
      const warning = scale !== undefined && Math.abs(camera.scale - scale) > cfg.limits.scaleTolerance ? `Requested scale ${scale} but the map applied ${camera.scale}: the real limits depend on the map size relative to the window.` : undefined;
      return { content: [text(warning ? { ...camera, warning } : camera)] };
    })
  );

  server.registerTool(
    "map_file",
    {
      title: "Save / load / new map",
      description:
        "save: write the current map to maps/<name>.map. load: replace the current map with maps/<name>.map (undoable; selections are dropped), or with the .map file at an absolute `path` anywhere on this computer (e.g. a notes vault). list: saved maps with path, size and modification date, newest first. new: generate a fresh random map (optionally with seed, width, height, and options = generation settings such as {states:{limit:12},template:\"archipelago\"}, see map_options); history is cleared and the current map is lost unless saved. The map is also autosaved after every edit and reloaded at start.",
      inputSchema: { action: z.enum(["save", "load", "list", "new"]), options: z.record(z.string(), z.unknown()).optional(), name: z.string().optional(), path: z.string().optional(), seed: z.string().optional(), width: z.number().int().min(cfg.limits.mapSizeMin).max(cfg.limits.mapSizeMax).optional(), height: z.number().int().min(cfg.limits.mapSizeMin).max(cfg.limits.mapSizeMax).optional() }
    },
    guarded(async ({ action, name, path, seed, width, height, options }) => {
      mkdirSync(cfg.mapsDir, { recursive: true });
      if (action === "list") return { content: [text({ maps: readdirSync(cfg.mapsDir).filter(f => f.endsWith(".map")).map(f => { const info = statSync(join(cfg.mapsDir, f)); return { name: f.replace(/\.map$/, ""), path: join(cfg.mapsDir, f), sizeBytes: info.size, modified: info.mtime.toISOString() }; }).sort((a, b) => b.modified.localeCompare(a.modified)) })] };
      if (action === "new") {
        if (options) await session.call("setSettings", { section: "generation", values: options }); // validated by Azgaar; kept for the generation below
        await session.openNew({ seed, width, height });
        history.reset();
        await autosave();
        return { content: [text(await session.call("summary"))] };
      }
      if (path !== undefined) {
        if (action !== "load") throw new Error(`map_file ${action}: "path" only works with load (save writes to maps/<name>.map)`);
        if (!isAbsolute(path) || !/\.map$/i.test(path)) throw new Error('map_file load: "path" must be an absolute path to a .map file');
      } else if (!name) throw new Error(`map_file ${action}: "name" is required`);
      const file = path ?? join(cfg.mapsDir, `${safeName(name as string)}.map`);
      name ??= file;
      if (action === "save") {
        writeFileSync(file, await session.call<string>("exportMap"));
        return { content: [text({ saved: file })] };
      }
      const content = readFileSync(file, "utf8"); // fails here, before anything is touched, if the file is missing
      await history.pushBefore(`load ${name}`);
      try {
        await session.call("importMap", content);
      } catch (err) {
        await history.rollback();
        throw err;
      }
      await autosave();
      return { content: [text({ loaded: file, summary: await session.call("summary") })] };
    })
  );

  if (cfg.allowEval) {
    server.registerTool(
      "map_eval",
      {
        title: "Run JavaScript in the page (advanced)",
        description: "Escape hatch: evaluates a JavaScript expression/function body in the map page and returns its JSON result. The previous state is saved first (undoable). Prefer map_apply.",
        inputSchema: { code: z.string() }
      },
      guarded(async ({ code }) => {
        await history.pushBefore("map_eval");
        const page = await session.ensure();
        try {
          const value = await page.evaluate(src => new Function(`return (async () => { ${src} })()`)(), code);
          await autosave();
          return { content: [text({ result: value ?? null })] };
        } catch (err) {
          await history.rollback(); // arbitrary code may have changed anything before failing
          throw err;
        }
      })
    );
  }

  registerExtraTools({ server, cfg, session, history, guarded, text, viewContent, settle, autosave, loadPresets, safeName });
}
