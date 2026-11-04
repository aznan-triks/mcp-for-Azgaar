# Design: AI-driven Azgaar map editing with live visual monitoring

Status (2026-10-16, v0.12.0): TASK-01 to TASK-04 of `docs/plans/` were verified on Linux/Chromium (build, check, npm test, compat, 36 MCP tests). TASK-05 adds opt-in dyadic/Lanczos downsampling to bitmap exports and previews; `npm run build:azgaar`, `npm run check`, `npm test`, `npm run compat`, browser/screenshot tests and 36 MCP E2E tests passed on Linux/Chromium (3840×2160 → 1920×1080 in 77–88 ms). Vendored Azgaar is v1.154.1, pinned in `known-good.json` and upgraded through a guarded overlay pipeline. 18 MCP tools by default (19 with eval), 30+ bridge commands, PBR planetary diptychs, rescue checkpoints, spatial queries, menu/UI/settings control and text-only views. Historical audit details for earlier versions remain below.

## Goal
Natural-language instructions -> multimodal AI sees the map -> edits are applied in a frozen, fully local Azgaar FMG -> the user watches the result live in a visible browser window.

## Audit findings (upstream v1.153.1, commit 574861c583177ebfd078733d6eb43d67a9e4fb65)
- TypeScript + Vite, SVG rendering. World state lives in globals `pack` (packed graph) and `grid`; modules sit on `window` (`States`, `Burgs`, `Provinces`, `Rivers`, `Routes`, `Markers`, `Layers`, `Pack`, `Services`, `Controllers`). Data model: `docs/architecture/data-model.md` upstream.
- Editors mutate typed arrays (`pack.cells.state`, `.province`, `.culture`, `.religion`, `.h`, `.biome`, `.burg`) then call `Layers.draw("states","borders",...)`. Reference: `applyStatesPaint` in `src/controllers/states-editor.ts`.
- After a state change the editors rely on: `States.findNeighbors()`, `States.collectStatistics()`, `States.getPoles()`, plus province reconciliation (`adjustProvinces`, module-private).
- Burgs: `Burgs.add([x,y])`, `Burgs.remove(id)`, `Burgs.changeGroup`. Move logic lives in `src/controllers/burg-editor.ts`.
- Terrain: heightmap editor has modes erase / keep / risk. `erase` regenerates all politics (never use). `risk` (`restoreRiskedData`, module-private) keeps states/burgs, forces burg cells to stay land, rebuilds rivers/biomes.
- Persistence: `Services.Save.prepareMapData()` returns the exact `.map` text; `Services.Load.uploadMap(blob)` loads it. `Services` is a lazy registry: every method returns a Promise.
- Ready signal: `window.mapHistory` (grows when a map is generated/loaded). URL params: `seed`, `width`, `height`, `maplink`.
- Geometry: `#viewbox` carries the zoom transform; `viewbox.getScreenCTM().inverse()` converts screen pixels to map coordinates; `Pack.findCell(x, y)` gives the cell; `zoomTo(x, y, k, ms)` moves the camera.
- Upstream tests drive the app through `page.evaluate` on these same globals: the approach is the project's own.

## Verified (Windows 10 with Node 25.2.1 + Chrome; Linux with Chromium; 2026-10-08 v0.8.0)
- Build `--mode electron` succeeds (22 MB, relative base, no outside analytics or CDNs). Zero JavaScript errors.
- `npm run check`: script syntax validation, types, Biome lint, layer rules, hard-coded values, 150+ bridge checks in a real browser, browser selection/fallback, doctor diagnostics, session reopening, and 36 end-to-end tests with a real MCP client over stdio.
- Territory edit: state cells + unclaimed land always equal land cells; gains equal losses exactly; counters are fresh; capital cells are never taken; burgs change owner with their cell.
- Pixel -> cell round trip exact at zoom 1, 3, 6, 12.
- Undo/redo, rescue snapshot (`maps/rescue-before-undo.map`), save/load and restart-from-autosave restore states, provinces, burgs and names exactly. First reload of a .map shifts heights of ~15 % of cells (none crossing sea level on 3 seeds), stable afterwards.
- Offline: all ~40 web fonts bundled locally in `vendor/azgaar/public/fonts`; 0 external network requests attempted. Static server refuses path traversal.
- 3D rendering: relief plus a satellite/eroded PBR globe with aligned bump and ocean roughness, Fresnel atmospheric shell (default for globe captures), optional procedural clouds and a double-hemisphere diptych over a local starfield. Surface-only raycasting maps the camera's centre to a real cell; settings and GPU resources are restored/disposed after capture.

## Architecture
```
AI client (Claude Desktop / Claude Code / any MCP client)
   | MCP over stdio
server/  (Node, Playwright)  -- serves dist/ on 127.0.0.1, launches a VISIBLE Chromium (service workers blocked)
   | page.evaluate
window.FMG_AGENT  (src/agent/ inside the vendored Azgaar copy, typed, unit-tested)
   | same calls the UI editors make
Azgaar (pack / grid / Layers / States / Burgs ...)
```
Why a bridge compiled into the vendored source rather than injected scripts: it can import typed Azgaar methods (`States.adjustProvinces`, `restoreRiskedData`), is type-checked against Azgaar's types, and is testable. `scripts/azgaar.mjs` reapplies the tracked bridge and guarded patches to a candidate release; `scripts/update.mjs` replaces the current vendor only after TypeScript, Biome, Vite and a real-browser compatibility gate. Patch list and provenance: `vendor/PATCHES.md`.
Why MCP: one server works with every MCP-capable client; images returned as MCP image content give the model vision.
Note: claude.ai in the browser cannot reach a local MCP server; use Claude Desktop or Claude Code.

## Tool surface (18 tools by default, plus optional map_eval)
- `map_view`: screenshot + legend (state id / name / colour) + camera, or text-only ASCII map via `text_map: true` / `FMG_TEXT_ONLY=1`; optional temporary annotations (graticule in map units, state id badges, cell ids when few are visible), zoom region `{x0, y0, x1, y1}`, and zoomed-in `coverageNote` guard.
- `map_summary`, `map_locate` (pixel, map point or cell), `map_list`: structured facts from data; `map_list` supports name substring and spatial querying (`rect`, `near` + `within`, `direction`).
- `map_select`: shapes circle, rect, polygon, cells, state, province, border, ring, rim, flood; options land_only, only_state, combine_op/combine_with. The selection is previewed in red in the visible window at once.
- `map_commands` / `map_apply`: command registry in the bridge (`describe()` lists it). Each apply: closes open UI dialogs (`closeDialogs`), snapshots state, validates, mutates with the same steps as the interface's editor, recomputes statistics, redraws affected layers (including vector labels for rivers), returns before/after figures, skipped cells and warnings. A failed or empty apply restores the map automatically.
- `map_undo`: undo and redo with automatic rescue snapshot (`maps/rescue-before-undo.map`) before undo to preserve user manual edits.
- `map_file`: save, load (supporting relative names and absolute vault paths), list, new.
- `map_camera`: moves and scales camera with tolerance reporting.
- `map_layers`: 33 layers toggleable, exclusive mode (`only`), and preset management (`topography`, `biomes`, `political`, `lore-clean`, custom).
- `map_legend`: titled colour key for any map layer or custom item list, persisted in the SVG.
- `map_export`: 24 formats including dimensioned PNG/JPEG up to 9600px width (resolution 4 or 5), `clean` mode hiding game icons, SVG, tiles, .map, JSON, GeoJSON and CSV. Optional `supersample: 1..4` and `filter: lanczos3 | stepdown | fast` capture vector content at higher resolution and reduce it in-page; `map_view` supports the same opt-in filter. Temporary source canvas sides are capped by `export.maxSourcePixels` (8192px), while the unsupersampled path remains untouched. File destinations are confined to `exportsDir`.
- `map_3d`: 3D relief perspective, orbital globe, or planetary diptych plate (`hemispheres: "diptych"`).
- `map_menu`: discover/run Azgaar actions; undo only on map changes, rollback on partial failure, prevent destructive new-map actions.
- `map_ui`: discover/read/click/set/close interface controls and upload files via native pickers. `map_options`: inspect, validate and apply generation settings.
- `map_status`: offline and error diagnostics; `map_eval` is available only when opted in via `allowEval` / `FMG_ALLOW_EVAL=1`, and runs async expressions in the page, not dynamic server code.

## Rules the bridge must follow
- Mirror the UI editor for each entity; never skip recompute hooks.
- Never take a state's capital cell away from it (the UI paint tool filters it).
- Burg cells must stay land when height is edited.
- Economy (markets, deals) is not rebuilt by small edits, same as in the UI; report it in warnings when territory changes are large.
- Dry-run preview (selection highlighted) before large commits; the user sees it live.

## Offline and pinned
- Vendor the official Azgaar v1.154.1 release commit `6d69387f79cff630f0a9eaa45ba5108eb7f65335` into `vendor/azgaar` (no submodule tracking). `known-good.json` pins this ref; `scripts/azgaar.mjs` overlays the bridge, offline fonts and local patches. Upgrades are optional, fail closed on incompatible upstream renderer changes, and are gated by `scripts/compat.mjs`. Keep the upstream MIT licence.
- Build with `vite build --mode electron`. Default build uses base `/Fantasy-Map-Generator/` and breaks locally.
- Fonts: all fonts bundled into `public/fonts/`; 0 requests to fonts.gstatic.com.
- Block service workers in the Playwright context (production non-Electron build registers one).
- Node: upstream asks >= 24; builds on 22, 24, and 25 verified.

## Fixed defects (v0.1.0 to v0.8.0)
- D-001 to D-007: default viewport 1920x1080, stale client warnings, stale lock cleanup, absolute map loading.
- D-008 to D-015: comprehensive map legends for political, biome, cultural, and trade layers.
- D-016 to D-017: river renaming, SVG annotations group (`#annotations`).
- D-018 to D-021: high-res export (resolution 5), 3D relief/globe engine, globe centering and local starfield, `clean` export mode.
- D-022 to D-026: planetary diptych plate (`hemispheres: "diptych"`), relief rebuild glitch fix, unpiloted modules audit (S-026).
- D-027 to D-031: rescue snapshot on undo (`rescue-before-undo.map`), preventive modal teardown (`closeDialogs`), coverage note on manual zoom, resilient export cleanup, river vector label redraw, doctor ephemeral port fallback.

## Open suggestions (backlog)
- S-025: Atlas multi-map nesting / inset compositing (`map_composite` / `map_inset`).
- S-026: Contours / hachures elevation profiles and planetary climate/winds pilotage (`setClimate`).

