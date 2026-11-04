# Configuration

Everything is in one JSON file. Nothing is read from your personal folders, and no setting points at the internet: the map page is served from your own disk.

## The config file

`config/fmg-mcp.json` is the whole configuration; another file can be pointed at with `FMG_CONFIG`. Every value is checked against the schema when the server starts (a wrong type or an out-of-range number stops it with a readable message); a key the server does not know is ignored, never merged in, so a misspelled name silently keeps the default.

| Setting | Default | Meaning |
|---|---|---|
| `azgaarDist` | `vendor/azgaar/dist-electron/renderer` | Where the built Azgaar lives (the folder the local server serves). Relative to the project. |
| `mapsDir` | `maps` | Folder for `.map` files: autosave, rescue checkpoints, `map_file` saves. Git-ignored. |
| `presetsFile` | `layer-presets.json` | File where `map_legend` stores your custom legend presets. |
| `layerPresets` | `{"topography":["lakes","heightmap","rivers","ice","scaleBar"],"biomes":["lakes","biomes","rivers","ice","scaleBar"],"political":["lakes","rivers","states","provinces","borders","ice","labels","burgIcons","scaleBar"],"lore-clean":["lakes","biomes","rivers","labels","scaleBar"],"topographic":["heightmap","rivers","relief","routes","burgIcons","labels","scaleBar"]}` | Named layer groups `map_layers {preset}` and `map_export {layer_preset}` accept, on top of Azgaar's own presets. |
| `layerPresets.topography` | `["lakes","heightmap","rivers","ice","scaleBar"]` | Lakes, heightmap, rivers, ice, scale bar: reading the land itself. |
| `layerPresets.biomes` | `["lakes","biomes","rivers","ice","scaleBar"]` | Lakes, biomes, rivers, ice, scale bar. |
| `layerPresets.political` | `["lakes","rivers","states","provinces","borders","ice","labels","burgIcons","scaleBar"]` | Borders, states, provinces, labels, burgs, water, scale bar. |
| `layerPresets.lore-clean` | `["lakes","biomes","rivers","labels","scaleBar"]` | Biomes, rivers, labels, scale bar: a map for a book, no politics. |
| `layerPresets.topographic` | `["heightmap","rivers","relief","routes","burgIcons","labels","scaleBar"]` | TASK-10 atlas group: heightmap, rivers, relief, routes, burg icons, labels, scale bar (seven real layers). |
| `exportsDir` | `exports` | Where `map_export` and `map_3d` write files. Override with `FMG_EXPORTS_DIR`. |
| `profileDir` | `.browser-profile` | Chrome profile folder, so the window keeps its own state and never touches your browser. |
| `startup` | `autosave` | What to show when the server starts: `autosave` reloads the last map, `new` generates one. |
| `allowEval` | `false` | Master switch for `map_eval`, the tool that runs JavaScript in the page. Off by default; see docs/SECURITY.md. |
| `server` | `{"host":"127.0.0.1","port":8765}` | The local HTTP server that serves Azgaar to the browser. |
| `server.host` | `127.0.0.1` | Bind address. Keep 127.0.0.1: the map and the tools are unauthenticated by design. Any other value prints a warning at startup. |
| `server.port` | `8765` | Preferred port; `npm run doctor` falls back to an ephemeral one when it is taken. |
| `browser` | `{"channel":"chrome","executablePath":null,"headless":true,"viewport":{"width":1920,"height":1080},"readyTimeoutMs":120000,"args":[],"fallbackChannels":["msedge"],"seedStorage":{"fmg-disable-click-arrow-tooltip":"true"},"openOnStart":false}` | How the visible browser window is launched. |
| `browser.channel` | `chrome` | Playwright channel of the browser to use (`chrome`, `msedge`, …). |
| `browser.executablePath` | `null` | Explicit browser binary, used when no channel is installed (CI, sandbox, portable Chromium). |
| `browser.headless` | `true` | false shows you the map being edited; true is for tests and servers. |
| `browser.viewport` | `{"width":1920,"height":1080}` | Window size, and therefore the pixel size of `map_view` and `map_3d` pictures. |
| `browser.viewport.width` | `1920` | Width in pixels (1920 by default). |
| `browser.viewport.height` | `1080` | Height in pixels (1080 by default). |
| `browser.readyTimeoutMs` | `120000` | How long to wait for Azgaar to boot before failing with a clear message. |
| `browser.args` | `[]` | Extra Chromium arguments (e.g. `--no-sandbox` in a container). |
| `browser.fallbackChannels` | `["msedge"]` | Channels to try, in order, when the first one is not installed. |
| `browser.seedStorage` | `{"fmg-disable-click-arrow-tooltip":"true"}` | Local-storage values written before the page loads, to skip first-run dialogs. |
| `browser.openOnStart` | `false` | false (default) opens the browser at the first tool that needs the map, not at server start. |
| `map` | `{"seed":null,"width":1920,"height":1080}` | The map the server generates when there is nothing to reload. |
| `map.seed` | `null` | Generation seed. A fixed seed means a reproducible test map; your own maps come from `mapsDir`. |
| `map.width` | `1920` | Width in map units for a new map. |
| `map.height` | `1080` | Height in map units for a new map. |
| `history` | `{"maxEntries":30}` | Undo system. |
| `history.maxEntries` | `30` | How many `map_undo` / `map_redo` steps are kept. |
| `view` | `{"format":"png","jpegQuality":85,"settleMs":200,"maxImageBytes":900000,"textOnly":false}` | Defaults of `map_view`. |
| `view.format` | `png` | png or jpeg for a screenshot. |
| `view.jpegQuality` | `85` | Quality of the jpeg fallback when a PNG is too heavy for the client. |
| `view.settleMs` | `200` | Pause between framing and the shot, so layers finish drawing. |
| `view.maxImageBytes` | `900000` | Above this size a PNG is replaced by a smaller JPEG preview; the file on disk is untouched. |
| `view.textOnly` | `false` | true answers with the ASCII map instead of a picture (`map_view {text_map:true}`). |
| `export` | `{"format":"png","jpegQuality":92,"maxPixels":10000,"maxSourcePixels":8192,"clean":false,"cleanHide":["#burgIcons [data-group=\"anchors\"]","#routes","#markers","#ice"]}` | Defaults of `map_export`. |
| `export.format` | `png` | Format used when the call does not name one. |
| `export.jpegQuality` | `92` | JPEG quality for the picture after any filtering (92). |
| `export.maxPixels` | `10000` | Largest requested width accepted (10000). |
| `export.maxSourcePixels` | `8192` | Ceiling of the temporary high-resolution capture used by `supersample` (8192). |
| `export.clean` | `false` | Default for the `clean` switch (hide port anchors, routes, markers, ice). |
| `export.cleanHide` | `["#burgIcons [data-group=\"anchors\"]","#routes","#markers","#ice"]` | CSS selectors hidden by `clean`. |
| `bridge` | `{}` | Overrides handed to `FMG_AGENT.configure()` at startup (colours, limits of the bridge). See the table of bridge defaults below. |
| `limits` | `{"listMax":1000,"zoomMin":0.5,"zoomMax":80,"cameraMsMax":5000,"scaleTolerance":0.01,"imageBytesMin":10000,"imageBytesMax":5000000,"mapSizeMin":100,"mapSizeMax":8000,"exportTimeoutMs":60000,"mapFileBytesMax":200000000}` | Hard limits the tools validate against. |
| `limits.listMax` | `1000` | Maximum `limit` accepted by `map_list` (default answer is cut at 50 rows). |
| `limits.zoomMin` | `0.5` | Lowest camera scale. |
| `limits.zoomMax` | `80` | Highest camera scale. |
| `limits.cameraMsMax` | `5000` | Longest animated camera move. |
| `limits.scaleTolerance` | `0.01` | How much the applied camera scale may differ from the asked one before a warning is returned. |
| `limits.imageBytesMin` | `10000` | Smallest image size limit a call may ask for. |
| `limits.imageBytesMax` | `5000000` | Largest image size limit a call may ask for. |
| `limits.mapSizeMin` | `100` | Smallest `mapSize` a generation setting may pin. |
| `limits.mapSizeMax` | `8000` | Largest `mapSize` a generation setting may pin. |
| `limits.exportTimeoutMs` | `60000` | How long to wait for a browser download (native export). |
| `limits.mapFileBytesMax` | `200000000` | Largest `.map` file `map_file load` will read (bytes). A bigger file is refused with a message instead of filling the memory. |
| `azgaarPackage` | `vendor/azgaar/package.json` | Where to read the pinned Azgaar version (used to silence its release notes on first run). |
| `autosave` | `{"intervalSec":60}` | Background saving of the live map. |
| `autosave.intervalSec` | `60` | Seconds between autosaves (0 disables them). Changes you make by hand are captured too. |
| `view3d` | `{"format":"png","quality":92,"hemisphereOffset":0.25,"presets":{"satellite":{"satellite":true,"erosion":false},"heightmap":{"layerPreset":"topography"},"biomes":{"layerPreset":"biomes"}}}` | Defaults of `map_3d`. |
| `view3d.format` | `png` | png, jpeg or webp. |
| `view3d.quality` | `92` | Quality for the lossy formats. |
| `view3d.hemisphereOffset` | `0.25` | Fraction of the map's longitude span (0–0.5) between the centres of the west and east views of a diptych plate. |
| `view3d.presets` | `{"satellite":{"satellite":true,"erosion":false},"heightmap":{"layerPreset":"topography"},"biomes":{"layerPreset":"biomes"}}` | Named 3D looks `map_3d {preset}` accepts. |
| `view3d.presets.satellite` | `{"satellite":true,"erosion":false}` | Procedural satellite texture with baked relief detail. |
| `view3d.presets.satellite.satellite` | `true` | Use the satellite material instead of a flat colour. |
| `view3d.presets.satellite.erosion` | `false` | Bake erosion detail into the bump and roughness maps. |
| `view3d.presets.heightmap` | `{"layerPreset":"topography"}` | Wrap the flat heightmap layer on the sphere. |
| `view3d.presets.heightmap.layerPreset` | `topography` | Which layer group is rendered into that texture. |
| `view3d.presets.biomes` | `{"layerPreset":"biomes"}` | Same, with the biome colours. |
| `view3d.presets.biomes.layerPreset` | `biomes` | Layer group rendered into that texture (`biomes`). |

## Environment variables

Every variable is an override of the same settings, for the cases where editing the file is not wanted (a second client, a container, CI).

| Variable | Meaning |
|---|---|
| `FMG_AGENT` | Not a variable: the bridge object `window.FMG_AGENT` that the tools call inside the page (mentioned here so the name is documented). |
| `FMG_ALLOW_EVAL` | Overrides `allowEval` (`1` turns `map_eval` on). |
| `FMG_CONFIG` | Path of an alternative JSON config instead of `config/fmg-mcp.json`. |
| `FMG_EXECUTABLE_PATH` | Browser binary to launch (what `npm run doctor` sets from `FMG_TEST_CHROMIUM`). |
| `FMG_EXPORTS_DIR` | Absolute folder for exports, on your machine. |
| `FMG_HEADLESS` | `1` or `0` to force headless or a visible window. |
| `FMG_MAPS_DIR` | Absolute folder for `.map` files. |
| `FMG_PORT` | Local port for the map page: a whole number from 0 to 65535, anything else stops the start with a clear message. |
| `FMG_PROFILE_DIR` | Absolute Chrome profile folder for this project. |
| `FMG_TEST_ARGS` | Tests only: comma-separated browser arguments (e.g. `--no-sandbox`). |
| `FMG_TEST_CHANNEL` | Tests only: browser channel to use. |
| `FMG_TEST_CHROMIUM` | Tests and CI only: path to a Chromium binary when no Chrome is installed. |
| `FMG_TEST_HEADED` | Tests only: run with a visible window (needs a display, e.g. `xvfb-run -a`). |
| `FMG_TEXT_ONLY` | `1` makes every view answer with the ASCII map. |

## Bridge defaults (`bridge`)

The bridge (the code compiled into Azgaar, `vendor/azgaar/src/agent/config.ts`) has its own defaults. Anything here can be overridden without touching the source, through the `bridge` object of the config file. They are internal tuning (limits, colours, timeouts), so the table gives the current value only.

| Setting | Value |
|---|---|
| `gridDivisions` | 8 |
| `maxCellLabels` | 500 |
| `maxSelectionCells` | 40000 |
| `maxSelections` | 20 |
| `selectionFill` | "rgba(255, 40, 40, 0.38)" |
| `selectionStroke` | "rgba(200, 0, 0, 0.9)" |
| `gridStroke` | "rgba(0, 0, 0, 0.45)" |
| `labelColor` | "#111111" |
| `labelHalo` | "#ffffff" |
| `labelFont` | "monospace" |
| `badgeFill` | "#ffffffcc" |
| `badgeStroke` | "#000000" |
| `overlayZIndex` | 50 |
| `labelPx` | 12 |
| `settleMs` | 600 |
| `importTimeoutMs` | 60000 |
| `listLimit` | 50 |
| `regionMargin` | 0.08 |
| `defaultRiverFlux` | 30 |
| `textMapCols` | 100 |
| `textMapRows` | 40 |
| `textMapMax` | 200 |
| `uiOptionsMax` | 40 |
| `uiTextMax` | 1500 |
| `menuListMax` | 200 |
| `legendMarginPct` | 1 |
| `legendHeightSteps` | [20, 30, 40, 50, 60, 70, 80, 90, 100] |
| `legendLongItems` | 40 |
| `legendSeaSteps` | [0, 10] |
| `legendRainSamples` | [0.25, 0.5, 1] |
| `legendPopulationBarPx` | 10 |
| `legendMarketColor` | "#dababf" |
| `legendTradeLandColor` | "#8c6a3b" |
| `legendTradeWaterColor` | "#3b6a8c" |
| `annotationHaloColor` | "#ffffff" |
| `annotationColor` | "#c0392b" |
| `annotationMarkerRadius` | 3 |
| `annotationFontSize` | 6 |
| `annotationStrokeWidth` | 1 |
| `annotationAreaOpacity` | 0.35 |
| `annotationTextMax` | 120 |
| `temperatureMin` | -50 |
| `temperatureMax` | 50 |
| `view3dPollMs` | 400 |
| `view3dStableReads` | 2 |
| `view3dTimeoutMs` | 30000 |
| `view3dStableDiff` | 2 |
| `view3dSampleSize` | 32 |
| `view3dTextureMax` | 8192 |
| `view3dDefaultDistance` | { relief: 640, globe: 3 } |
| `view3dSunVectorLength` | 1000 |
| `downsampleMaxDimension` | 8192 |
| `downsampleMaxSupersample` | 4 |
| `downsampleJpegQuality` | 0.92 |
| `downsampleBlobLifetimeMs` | 5000 |
| `minContourInterval` | 2 |
| `insetBackground` | "#fff9ed" |
| `insetInk` | "#342b22" |
| `insetCover` | 0.4 |
| `insetMargin` | 0.02 |
| `insetTitleMax` | 120 |
| `diptychBgColor` | "#01040a" |
| `diptychTextColor` | "#ffffff" |
| `diptychSubtextColor` | "#94a3b8" |
| `diptychAtmosphereColor` | "rgba(80, 160, 255, 0.45)" |
| `diptychAtmosphereMidColor` | "rgba(60, 130, 240, 0.15)" |
| `diptychAtmosphereEndColor` | ? |

## Two clients at once?

One server owns one browser profile and one port. Running a second AI client at the same time collides on both (`8765` and the profile lock): give the second one its own `FMG_PORT` and `FMG_PROFILE_DIR`, or close the first client.
