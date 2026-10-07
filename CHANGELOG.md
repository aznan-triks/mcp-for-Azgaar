# Changelog

Each entry has two parts: **Plain words** (what it means for you) and **Technical** (what changed and how it is verified).

## 1.4.0

**Plain words:** You can now export a composite dual-hemisphere planetary diptych with orbital cartouche and atmospheric Rayleigh limb glow, uncheckpointed manual edits are automatically protected by a rescue snapshot before any undo, the AI can filter entities spatially (by bounding box, compass direction, or distance to a city or river), dialogs close automatically before edits, and diagnostic checks gracefully fall back to an available port when the default port is busy.

**Technical:**
- `map_3d` diptych mode (`hemispheres: "diptych"`): renders both hemispheres side-by-side with procedural continuous starfields, atmospheric Rayleigh limb glow gradients, orbital title banners, and closing ocean statistics.
- Safeguard manual edits (`map_undo` rescue snapshot): automatically writes `maps/rescue-before-undo.map` prior to reverting state so human modifications are never lost.
- Spatial queries in `map_list`: added `spatial.ts` engine supporting `rect` bounding boxes, `near` references ({burg, river, x, y}), `within` radius limits, and `direction` compass bearings (N, NE, E, SE, S, SW, W, NW).
- Dialog safety: `uiCloseDialogs()` called prior to applying edits to prevent conflicting UI states.
- Clean export isolation: wrapped cleanup calls in `finally` blocks with isolated exception handlers.
- River labelling: `addRiver` automatically redraws river labels alongside river paths.
- Relief rebuild glitch fix: clears relief and feature paths before heightmap recalculation.
- Diagnostic resiliency: `doctor` falls back to an ephemeral port (port 0) when the configured server port is occupied.
- Verified via `npm run check` (types, lint, architecture rules, smoke tests, and 27 e2e tests).

## 1.3.0

**Plain words:** The AI can now render 3D scenes of your map (relief landscapes and a full planetary globe that preserves its longitude span), display persistent legend boxes explaining map colors, export clean cartography without game pictograms, rename rivers, and start without opening the browser window until the first map tool is requested.

**Technical:**
- `map_3d`: 3D picture rendering using Azgaar's built-in 3D engine in relief or globe modes, supporting camera rotation, dual hemispheres, texture presets, and procedural local starfields without network requests.
- `map_legend`: on-screen legend boxes explaining colors of states, provinces, biomes, cultures, religions, elevation, trade routes, or custom items.
- Clean exports: `clean: true` in `map_export` and `map_3d` forces port anchors, trade routes, markers, and ice pictograms off during rendering.
- River renaming supported via `map_apply rename` (`kind: "river"`).
- Lazy browser launch: `browser.openOnStart` (defaults to `false`) defers browser launch until the first map-interacting tool.
- Upstream 3D globe layout patch: respect longitude span without distortion, procedural offline starfield.
- Diagnostic check updated: `doctor` detects stale client entries pointing to other repository paths.
- Verified via `npm run check` (smoke tests, e2e tests, docs integrity).

## 1.2.5

**Plain words:** Crashed browsers no longer lock you out on the next launch, and the AI can now load maps from anywhere on your computer by their absolute file path.

**Technical:**
- Stale profile lock handling: on Linux/macOS, stale process lock links left after crashes are automatically removed at launch; on Windows, clear guidance is provided to close leftover background processes.
- `map_file load` accepts an absolute `path` to load `.map` files from external folders (e.g. notes vaults).
- Generated documentation updated (`docs/TOOLS.md`, `docs/COMMANDS.md`).
- Verified via `npm run check`.

## 1.2.4

**Plain words:** Your selection now survives undo and redo, the AI is warned when the map did not apply the zoom it asked for, saved maps can be told apart by size and date, and one call can frame the whole map before a screenshot.

**Technical:**
- Selections survive undo/redo: the bridge remembers the cells' map positions and finds them again after the reload (`importMap(text, keepSelections)`); loading a different file still drops them.
- `map_camera` returns the scale really applied and a `warning` when it differs from the request by more than `limits.scaleTolerance` (new setting, documented in English and French).
- `map_file list` returns name, path, size and modification date, newest first. `map_view` accepts `whole_map`.
- Ported from the private working repository; its own layer presets were not ported (Azgaar's built-in `preset` already covers it).
- Verified on Windows 10 (Node 25, real Chrome): `npm run check` passes in full, including the bridge tests for selections kept/dropped.
## 1.2.3

**Plain words:** The documentation is now complete: every tool, command, setting and script is explained, there are 16+ ready-made recipes, a troubleshooting guide, a FAQ, security and uninstall pages, all in English and French, and a test fails if anything is ever left undocumented.

**Technical:**
- New pages: `docs/TOOLS.md` and `docs/COMMANDS.md` (generated from the running server by `npm run docs`, checked for staleness by `npm run check`), `CONFIGURATION`, `SECURITY`, `UNINSTALL`, `USAGE-EXAMPLES`, `TROUBLESHOOTING`, `FAQ`, each also in `docs/fr/`.
- `test/docs.test.mjs` fails when a setting of `config/fmg-mcp.json`, an environment variable, a bridge setting, an npm script, a tool or an export format has no explanation, when a relative link is broken, when a page is not linked from the README, or when a French page is missing or differs in structure.
- Drafted by Antigravity (Gemini 3.8 Flash, medium) and translated the same way, then fact-checked by a second Antigravity pass (high effort, read-only). The 19 discrepancies it found were fixed: a quoted error message that did not exist, a wrong seed type, an environment variable that was a page global, undo history described as in memory (it is on disk), claims about untested systems (a "Tested on" note now heads each page), an `export` command that fails on Windows, and the `npm run build:azgaar` hint in two error messages (now `npm run setup`). `npm run doctor` now removes its own throw-away browser profile.
- Not verified: macOS and Linux instructions in the new pages (marked untested).

## 1.2.2

**Plain words:** The README now explains that the map window is visible by default (you watch the AI work live) and how to hide it.

**Technical:**
- Documentation only: `browser.headless` (config) / `FMG_HEADLESS` (environment), default visible.

## 1.2.1

**Plain words:** Fixes found by an independent test run: the Claude Code command now carries the text-only setting, the installer no longer prints a security warning, and the README says more about Node, Claude Desktop and a stuck browser window.

**Technical:**
- `claude mcp add` printed by `npm run register -- --text-only` now includes `--env FMG_TEXT_ONLY=1` (test added). The installer starts npm and vite through Node, without a shell (no DEP0190 warning, no argument quoting). The failed-download error now says what to try. README: Node version, automatic Claude Desktop connection and `--no-register`, command-line install, leftover-Chrome troubleshooting.
- Checked independently by Antigravity (Gemini 3.8 Flash, medium effort) on a fresh clone of the published repository: 43 checks, all passed, including exports (svg, png, jpeg, json, geojson, csv, map, tiles), settings, regenerate + undo, interface tools and rapid concurrent calls. The installer now unpacks with Windows' own `tar.exe` and a relative archive name (found while re-testing from Git Bash, where Git's GNU tar read `C:` as a machine name). Its fourth finding (paths with spaces unquoted) did not reproduce: they are quoted.

## 1.2.0

**Plain words:** The AI can now do much more than edit borders: it can choose which layers are drawn (for example only the heightmap and the cultures) and export pictures and data to files, set how new maps are generated, run any of Azgaar's own actions, and operate Azgaar's screens like a person, so almost everything Azgaar offers is within its reach.

**Technical:**
- `map_export`: SVG, PNG, JPEG, PNG tiles, `.map`, JSON (4 kinds), GeoJSON (5), CSV (9), by calling Azgaar's own export code and collecting the browser download in `exports/` (new `exportsDir`, `limits.exportTimeoutMs` in config). `only_layers` / `layer_preset` choose what is drawn; `map_layers` gained `only` and `preset`.
- `map_menu`: Azgaar's own action list (`MAP_COMMANDS`: editors, overviews, `regenerate*`, charts), run with the interface's confirmation skipped because the undo snapshot is taken first (dropped when nothing changed). Actions that need a file picker or replace the map are refused with a pointer to the right tool.
- `map_ui`: list/find/get/click/set/close_dialogs/upload on dialogs, the side menu or the whole page, by reference, id, selector or visible text (best match: exact own text, then control label, then shortest partial); `upload` answers file pickers (tried by hand with the Heightmap image converter).
- `map_options` and `map_file new options`: Azgaar's typed settings, validated by its own schema; values are **pinned** the way its lock icons do, because a new map re-rolls unpinned settings (found by test: asking for 5 states gave 17). `release` forgets pins.
- Verified on Windows 10: 25 end-to-end tests with a real MCP client cover exports (each family, with the layers on screen), layer presets, regenerate + undo, editors and fields, choosing a template through its dialog, validated and pinned generation settings. Not covered by automated tests: the image converter upload, PNG tiles, the 3D views.

## 1.1.0

**Plain words:** It now works with any AI program that supports MCP (Cline, Codex, Hermes, Cursor, LM Studio...) and any model, including models that cannot see images: they get the map drawn in characters.

**Technical:**
- `npm run register` prints ready-to-paste settings (JSON, TOML, YAML, command line) for Claude Desktop, Claude Code, Cline, Cursor, Gemini CLI, LM Studio, Zed, Codex, Hermes Agent and Continue, with absolute paths; `--client <name> --write` edits the JSON ones (backup first, refuses files that are not plain JSON); `--text-only` adds `FMG_TEXT_ONLY=1`. Locations and syntax come from each client's documentation (researched, not tested on those clients).
- Text-only mode (`view.textOnly`, `FMG_TEXT_ONLY=1`, or `text_map: true` on `map_view`): no tool returns an image; `map_view` and `map_apply view` return a character map (`FMG_AGENT.textMap`: sea, lake, one symbol per state, capitals, key, coordinates of the area). Covered by an end-to-end test (no image part, requested size, key, bad size refused) and register tests (TOML/YAML/JSON output).
- Tests no longer depend on one map: the fixed seed is now `333`, and the test states are picked from the generated map instead of being found by name. `npm run check` and the compatibility CI pass with it.

## 1.0.0

**Plain words:** The first public release. Double-click `install.bat`, restart Claude, and ask it to show you the map. `update.bat` brings the newest Azgaar safely, and keeps your current one if the new one does not work.

**Technical:**
- MCP server (up to 13 tools; the raw-script one is off by default) driving a visible Chrome/Edge window on Azgaar's Fantasy Map Generator; a typed in-page bridge (`window.FMG_AGENT`) with 32 edit commands, 10 selection shapes, screenshots with annotations, undo/redo, autosave and automatic rollback of a failed edit.
- Azgaar is no longer copied into the repository: `npm run setup` downloads the tested version (`known-good.json`), applies the patches by pattern (`scripts/azgaar.mjs`: bridge, six exported internals, two small upstream fixes, offline fonts) and builds it. A patch the bridge needs that cannot be applied marks that Azgaar version as incompatible instead of producing a broken build.
- `npm run update` builds the newest release (or `--edge`, `--ref X`) beside the current one, runs `npm run compat` (seed-independent end-to-end check of the bridge) and swaps only on success; otherwise the current version stays. Verified against the tested version and against Azgaar's development branch on Windows 10 (Node 25, Chrome).
- `npm run doctor` self-test, `npm run register` (Claude Desktop config with backup, Claude Code command), `npm run check` (types, lint, layer and hard-coded-value rules, 19 end-to-end tests with a real MCP client).
- Not verified: macOS and Linux installers (`install.sh`), Microsoft Edge as the only browser.
