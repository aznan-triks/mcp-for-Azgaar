# Configuration Reference

> **Tested on:** Windows 10 with Google Chrome and a stdio MCP client. macOS, Linux, Microsoft Edge alone and the other AI programs named here follow the same standards and the installer is written for them, but they have not been tested yet.

This document is the complete reference for all settings, environment variables, bridge options, script flags, and configuration recipes for mcp-for-Azgaar.

## How to Change a Setting

You can customize the server in two ways:

1. **Edit `config/fmg-mcp.json`**:
   - Open `config/fmg-mcp.json` in any plain text editor (Notepad, VS Code, Zed, etc.).
   - Edit the values you want to change.
   - Save the file and restart your AI program (for example Claude Desktop, Cline, or Cursor). The server reads the file when it starts up.
   - Keep a backup copy of `config/fmg-mcp.json` before making changes so you can restore it if needed.

2. **Set an environment variable**:
   - You can pass environment variables in your AI client's configuration file (for example under the `env` section).
   - Environment variables take precedence over values in `config/fmg-mcp.json`.

### What happens on a typo

The server verifies configuration on startup using a strict schema validator (Zod). If you make a typo (such as misspelling a key, setting a port outside 0-65535, or passing text instead of a number), the server refuses to start and prints an error message to stderr describing the exact invalid field. If that happens, correct the typo or revert to your backup file.

## Configuration Keys (`config/fmg-mcp.json`)

The table below lists every configuration setting available in `config/fmg-mcp.json`. Dotted paths indicate nested settings inside configuration groups.

| Setting | Type | Default | What it does | When to change it |
|---|---|---|---|---|
| `azgaarDist` | string | `"upstream/azgaar/dist-electron/renderer"` | Path to the built Azgaar static web assets folder containing `index.html`. | Change if you install or build Azgaar in a custom directory. |
| `azgaarPackage` | string | `"upstream/azgaar/package.json"` | Path to the Azgaar `package.json` file used to detect the installed version. | Change if your Azgaar source tree lives in a different folder. |
| `mapsDir` | string | `"maps"` | Folder where user map files, autosave files, and undo history snapshots are stored. | Change to store your maps in another directory or a synchronized cloud folder. |
| `exportsDir` | string | `"exports"` | Folder where images, data files, and exported `.map` files are written. | Change to direct exported files to another directory. |
| `profileDir` | string | `".browser-profile"` | Directory holding the browser user data and local storage between launches. | Change if you want a separate browser profile or want it stored on a specific drive. |
| `startup` | string (`"autosave"` or `"new"`) | `"autosave"` | Action performed when the browser opens: `"autosave"` restores the last session map; `"new"` creates a fresh random map. | Change to `"new"` if you prefer starting with a new procedural world on every launch. |
| `allowEval` | boolean | `false` | Enables the `map_eval` tool, which allows the AI to run arbitrary JavaScript in the map page. | Change to `true` only for advanced debugging or custom automation where direct page scripting is required. |
| `server` | object | `{ host: "127.0.0.1", port: 8765 }` | Group settings for the local static HTTP web server. | Change when you need to configure local network binding or port allocation. |
| `server.host` | string | `"127.0.0.1"` | IP address on which the local static server listens (loopback only). | Keep as `"127.0.0.1"` for security; only change if your environment requires a specific loopback address. |
| `server.port` | integer (0 to 65535) | `8765` | TCP port used by the local static web server. | Change if port 8765 is already used by another application on your system. |
| `browser` | object | `{ ... }` | Group settings for browser launching and window management. | Change when customizing browser binaries, window options, or browser channels. |
| `browser.channel` | string or null | `"chrome"` | Primary browser distribution channel used by Playwright (`"chrome"` or `"msedge"`). Set to `null` when specifying `browser.executablePath`. | Change to `"msedge"` if you do not have Google Chrome installed, or `null` if using a custom binary. |
| `browser.executablePath` | string or null | `null` | Absolute path to a specific browser executable binary. | Set this if your browser is installed in a non-standard location or if you use Chromium. |
| `browser.headless` | boolean | `false` | Runs the browser without a visible window when `true`. | Change to `true` to run silently in the background on servers or when visual feedback is not needed. |
| `browser.viewport` | object | `{ width: 1280, height: 720 }` | Viewport dimensions in screen pixels for the browser window. | Change to customize the browser view size. |
| `browser.viewport.width` | integer (min 320) | `1280` | Width of the browser viewport in pixels. | Change if you want a wider map display or higher resolution screenshots. |
| `browser.viewport.height` | integer (min 240) | `720` | Height of the browser viewport in pixels. | Change if you want a taller map display or higher resolution screenshots. |
| `browser.readyTimeoutMs` | integer (min 1000) | `120000` | Maximum time in milliseconds to wait for Azgaar and the bridge to finish loading. | Increase on slower computers if startup times out during initial map generation. |
| `browser.args` | array of strings | `[]` | Extra command-line arguments passed directly to the browser process. | Add flags if your environment needs specific Chromium arguments (e.g. `--no-sandbox` in containers). |
| `browser.fallbackChannels` | array of strings | `["msedge"]` | Fallback browser channels to attempt if the primary `browser.channel` is not installed. | Change to add or reorder fallback browsers. |
| `browser.seedStorage` | object (key-value strings) | `{"fmg-disable-click-arrow-tooltip": "true"}` | Key-value pairs inserted into browser `localStorage` before the page loads. | Use to suppress welcome modals, update popups, or preset Azgaar settings in storage. |
| `map` | object | `{ seed: null, width: 1280, height: 720 }` | Default dimensions and seed for new procedural maps. | Change to set standard dimensions or a fixed seed for freshly generated maps. |
| `map.seed` | string or null | `null` | Seed string used when generating a fresh map. If `null`, a random seed is selected. | Set to a fixed text (for example `"abc"`; a bare number is refused) to generate reproducible worlds. |
| `map.width` | integer (min 100) | `1280` | Default map width in internal map coordinate units. | Change if you want newly generated maps to have a different default width. |
| `map.height` | integer (min 100) | `720` | Default map height in internal map coordinate units. | Change if you want newly generated maps to have a different default height. |
| `history` | object | `{ maxEntries: 30 }` | Group settings for undo and redo history. | Change when tuning how many undo states are retained. |
| `history.maxEntries` | integer (min 1) | `30` | Maximum number of undo states kept on disk in `maps/history`. | Increase for deeper undo history, or decrease to save disk space. |
| `autosave` | object | `{ intervalSec: 60 }` | Group settings for periodic map saves. | Change when adjusting how often background saves occur. |
| `autosave.intervalSec` | number (min 0) | `60` | Interval in seconds between periodic background saves of `autosave.map`. Set to `0` to disable periodic saves. | Increase to reduce disk writes, or set to `0` to disable periodic background saves (edits are still saved). |
| `view` | object | `{ ... }` | Group settings for screenshot capture and map visualization. | Change when adjusting visual format, quality, or text-mode rendering. |
| `view.format` | string (`"png"` or `"jpeg"`) | `"png"` | Image format used when taking screenshots for the AI. | Switch to `"jpeg"` if PNG screenshots consume too much bandwidth or token context. |
| `view.jpegQuality` | integer (1 to 100) | `85` | Compression quality used when JPEG screenshots are generated. | Lower to reduce image size, or increase for sharper image details. |
| `view.settleMs` | integer (min 0) | `200` | Pause in milliseconds to let the browser DOM settle after changes before taking a screenshot. | Increase if screenshot captures occur before map animations or re-renders complete. |
| `view.maxImageBytes` | integer (min 10000) | `900000` | Maximum screenshot size in bytes before PNG automatically falls back to JPEG compression. | Adjust if your AI client rejects images exceeding a specific payload size. |
| `view.textOnly` | boolean | `false` | When `true`, returns maps as character grids (ASCII art) instead of images. | Enable when using AI models that cannot accept image inputs. |
| `bridge` | object | `{}` | Key-value overrides applied to the in-page bridge (`AgentConfig`). | Use to customize bridge visual styles, timeouts, and limits without modifying source files. |
| `limits` | object | `{ ... }` | Operational limits and safety thresholds for tools. | Change when adjusting tool pagination, zoom ranges, or timeout ceilings. |
| `limits.listMax` | integer | `1000` | Hard cap on items returned by entity listing tools (`map_list`). | Change if you need to fetch larger batches of entities in a single tool call. |
| `limits.zoomMin` | number | `0.5` | Minimum allowable zoom scale factor in `map_camera`. | Lower if you need to zoom out farther than the default minimum. |
| `limits.zoomMax` | number | `80` | Maximum allowable zoom scale factor in `map_camera`. | Increase if you need closer zoom magnification for micro-regions. |
| `limits.cameraMsMax` | integer | `5000` | Maximum camera transition animation time in milliseconds in `map_camera`. | Adjust if you want to allow longer animated pans across the map. |
| `limits.mapSizeMin` | integer | `100` | Minimum allowed width or height in map units when creating a new map with `map_file`. | Adjust to enforce custom lower bounds on new map sizes. |
| `limits.mapSizeMax` | integer | `8000` | Maximum allowed width or height in map units when creating a new map with `map_file`. | Adjust to enforce custom upper bounds on new map sizes. |
| `limits.exportTimeoutMs` | integer (min 1000) | `120000` | Maximum time in milliseconds to wait for a file export or file chooser operation. | Increase if large vector SVG or zip tile exports take longer than two minutes. |

## Environment Variables

Environment variables allow overriding settings without modifying `config/fmg-mcp.json`. They are especially useful in multi-client setups or containerized environments.

| Variable | Overrides / Affects | Description |
|---|---|---|
| `FMG_CONFIG` | Config file path | Specifies an alternate path to the configuration file (default is `config/fmg-mcp.json`). |
| `FMG_HEADLESS` | `browser.headless` | Overrides headless browser mode. Accepts `1`, `true`, or `yes` to hide the window; `0`, `false`, or `no` to show it. |
| `FMG_EXECUTABLE_PATH` | `browser.executablePath` | Overrides the path to the browser binary executable. |
| `FMG_PORT` | `server.port` | Overrides the port on which the local static web server listens. |
| `FMG_MAPS_DIR` | `mapsDir` | Overrides the folder path where map files and autosaves are stored. |
| `FMG_PROFILE_DIR` | `profileDir` | Overrides the folder path where the browser user profile is stored. |
| `FMG_TEXT_ONLY` | `view.textOnly` | When set to `1`, `true`, or `yes`, forces the server to return character-based maps instead of screenshots. |
| `FMG_ALLOW_EVAL` | `allowEval` | When set to `1`, `true`, or `yes`, registers the `map_eval` tool. |
| `FMG_TEST_CHROMIUM` | Test browser binary | Used by test scripts and diagnostics to force a specific Chromium executable path. |
| `FMG_TEST_ARGS` | Test browser arguments | Comma-separated command line arguments passed to the browser during tests. |
| `FMG_TEST_CHANNEL` | Test browser channel | Specifies the browser channel (`chrome`, `msedge`) used during tests (defaults to `chrome`). |
| `FMG_TEST_HEADED` | Test browser visibility | When set to `1`, runs browser tests with a visible window instead of headless mode. |
| `npm_execpath` | npm executable path | Environment variable provided by Node.js identifying the active `npm-cli.js` path used during setup and update scripts. |
| `SystemRoot` | Windows directory | Windows system directory (e.g. `C:\Windows`), used to locate the native `System32\tar.exe` archive utility. |
| `APPDATA` | Application data folder | Windows Roaming Application Data folder, used by `scripts/register.mjs` to locate client configuration files. |
| `XDG_CONFIG_HOME` | Linux config folder | User configuration base folder on Linux (defaults to `~/.config`), used by `scripts/register.mjs` to find client settings. |
| `HOME` | User home directory | User home directory path (also resolved via Node's `os.homedir()`), used by `scripts/register.mjs` to locate config directories on macOS and Linux. |

## Bridge Settings (`overlay/agent/config.ts`)

The bridge runs inside the web page and handles map queries, selections, and editing commands. You can override any bridge setting by adding its name and desired value inside the `"bridge"` object of `config/fmg-mcp.json`.

| Setting | Type | Default | Meaning |
|---|---|---|---|
| `gridDivisions` | number | `8` | Number of coordinate graticule lines drawn across the longest side of the visible area. |
| `maxCellLabels` | number | `500` | Maximum number of visible cells above which individual cell IDs are omitted from view annotations. |
| `maxSelectionCells` | number | `40000` | Safety limit on the number of cells that can be selected in a single operation. |
| `maxSelections` | number | `20` | Maximum number of active selections remembered before the oldest ones are discarded. |
| `selectionFill` | string | `"rgba(255, 40, 40, 0.38)"` | CSS color used to fill selected cells in the visual preview overlay. |
| `selectionStroke` | string | `"rgba(200, 0, 0, 0.9)"` | CSS color used for the boundary outline of selected cells. |
| `gridStroke` | string | `"rgba(0, 0, 0, 0.45)"` | CSS color used for coordinate grid lines in annotated views. |
| `labelColor` | string | `"#111111"` | CSS text color used for coordinate and entity labels. |
| `labelHalo` | string | `"#ffffff"` | CSS halo outline color around labels to ensure legibility over varying backgrounds. |
| `labelFont` | string | `"monospace"` | CSS font family used for coordinate graticule labels. |
| `badgeFill` | string | `"#ffffffcc"` | CSS background color for state ID badges. |
| `badgeStroke` | string | `"#000000"` | CSS border color for state ID badges. |
| `overlayZIndex` | number | `50` | CSS z-index applied to the bridge's SVG annotation and selection overlay layer. |
| `labelPx` | number | `12` | Font size in screen pixels for annotation labels, regardless of current zoom level. |
| `settleMs` | number | `600` | Delay in milliseconds to wait after a map file import before querying world state. |
| `importTimeoutMs` | number | `60000` | Maximum time in milliseconds allowed for an imported map file to load into memory. |
| `listLimit` | number | `50` | Default number of items returned by entity listing bridge methods. |
| `regionMargin` | number | `0.08` | Margin padding kept around a focused region in `showRegion`, expressed as a fraction of region size. |
| `defaultRiverFlux` | number | `30` | Default water flux assigned to hand-drawn river cells that lack sufficient natural drainage (controls river width). |
| `textMapCols` | number | `100` | Default width (columns) for character-based text maps generated for non-visual AI models. |
| `textMapRows` | number | `40` | Default height (rows) for character-based text maps generated for non-visual AI models. |
| `textMapMax` | number | `200` | Maximum allowable dimension (columns or rows) for character-based text maps. |
| `uiOptionsMax` | number | `40` | Maximum number of selectable options returned per input field when querying dialog controls. |
| `uiTextMax` | number | `1500` | Maximum characters of dialog text returned when inspecting open dialog windows. |
| `menuListMax` | number | `200` | Default maximum number of actions returned when querying Azgaar's action menu with `map_menu list`. |

## Script Command-Line Options

The project includes several command-line helper scripts in the `scripts/` folder, runnable via `npm run <name>`.

### `npm run setup` (`scripts/setup.mjs`)

Downloads the tested Azgaar release, patches it with the AI bridge, builds it, registers it with Claude Desktop if present, and runs a self-test.

| Option | Meaning |
|---|---|
| `--force` | Re-downloads, re-patches, and rebuilds Azgaar even if an installation is already detected. |
| `--no-register` | Skips automatic registration with Claude Desktop. |
| `--no-doctor` | Skips running the diagnostic self-test after installation. |

### `npm run update` (`scripts/update.mjs`)

Updates the local Azgaar build to a newer version. It downloads, patches, builds, and verifies the new version before replacing the working copy. If checks fail, your current installation is preserved.

| Option | Meaning |
|---|---|
| _(no options)_ | Updates to the latest official Azgaar release tag from GitHub. |
| `--edge` | Downloads and builds the latest development version (`master` branch). |
| `--ref <ref>` | Updates to a specific git commit, branch, or tag (e.g. `--ref v1.99.00`). |
| `--known-good` | Reverts Azgaar to the known-good baseline version tested with this project. |

### `npm run register` (`scripts/register.mjs`)

Generates or writes configuration blocks to connect the MCP server to your AI programs.

| Option | Meaning |
|---|---|
| _(no options)_ | Prints configuration snippets for all supported AI clients without altering any files. |
| `--client <name>` | Selects a specific client (`desktop`, `cline`, `cursor`, `gemini`, `lmstudio`, `zed`). |
| `--write` | Writes the configuration directly into the selected client's settings file (creates a backup first). |
| `--desktop` | Convenience shortcut equivalent to `--client desktop --write`. |
| `--remove` | Removes the server entry from the selected client's settings file. |
| `--text-only` | Configures the entry to run with `FMG_TEXT_ONLY=1` (for AI models that cannot view images). |
| `--name <name>` | Sets a custom name for the MCP server entry (defaults to `azgaar`). |
| `--config <file>` | Targets a custom configuration file path instead of the client's default location. |
| `--list` | Lists all client identifiers accepted by `--client`. |

### `npm run doctor` (`scripts/doctor.mjs`)

Runs system diagnostics: verifies Node version, checks config validity, checks built assets, tests folder write permissions, verifies port availability, launches a hidden browser session, and checks Claude Desktop registration.

| Option | Meaning |
|---|---|
| `--headed` | Runs the test browser in a visible window instead of the default headless mode. |

### `npm run compat` (`scripts/compat.mjs`)

Runs a compatibility suite against an Azgaar build to verify that bridge exports, state modifications, selection overlays, undo mechanisms, and screenshot captures function properly.

| Option | Meaning |
|---|---|
| `[azgaar folder]` | Optional positional path to the Azgaar build directory to test (defaults to `upstream/azgaar`). |

### `npm run check` (`scripts/check.mjs`)

The project verification command. Verifies TypeScript types for the server and bridge, runs Biome linter checks, scans for architecture layer violations, verifies that no hard-coded values exist in logic, runs all automated test suites, and checks documentation freshness.

| Option | Meaning |
|---|---|
| _(no options)_ | Runs the complete verification process and exits with code 0 on success, or 1 on failure. |

### `npm run docs` (`scripts/gen-docs.mjs`)

Generates `docs/TOOLS.md` and `docs/COMMANDS.md` directly from the running server and bridge schemas.

| Option | Meaning |
|---|---|
| _(no options)_ | Connects to a temporary local server instance and writes updated documentation pages. |
| `--check` | Dry-run check: verifies whether files on disk match the current server schemas without writing changes (used by `npm run check`). |

### `npm run start` (`scripts/start.mjs`)

Starts the MCP server. Can be invoked directly using `node scripts/start.mjs` or `npm run start`. It validates the Node.js runtime version, verifies that Azgaar is built, and launches the server communicating over stdio.

| Option | Meaning |
|---|---|
| _(no options)_ | Starts the server process. |

## Recipes

Here are ready-to-paste configuration examples for common requirements.

> **Important:** the snippets below show only the part to change. **Merge them into your existing `config/fmg-mcp.json`** (keep every other key); do not replace the whole file with a snippet, or the server will refuse to start because required settings are missing.
>
> Note: `FMG_AGENT` that you may see in the code is not an environment variable: it is the name of the bridge object inside the map page (`window.FMG_AGENT`).

### 1. Hide the browser window (headless mode)

If you want the server to run in the background without opening a visible browser window:

In `config/fmg-mcp.json`:
```json
{
  "browser": {
    "headless": true
  }
}
```

Or set the environment variable in your AI client settings:
```json
"env": {
  "FMG_HEADLESS": "1"
}
```

### 2. Change the local server port

If port 8765 is already in use by another application:

In `config/fmg-mcp.json`:
```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 9000
  }
}
```

Or set the environment variable:
```json
"env": {
  "FMG_PORT": "9000"
}
```

### 3. Use Microsoft Edge only

If you do not have Google Chrome installed and wish to use Microsoft Edge exclusively:

In `config/fmg-mcp.json`:
```json
{
  "browser": {
    "channel": "msedge",
    "fallbackChannels": []
  }
}
```

### 4. Make the window bigger

To capture higher resolution screenshots and view a larger workspace:

In `config/fmg-mcp.json`:
```json
{
  "browser": {
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  },
  "map": {
    "width": 1920,
    "height": 1080
  }
}
```

### 5. Turn autosave off

To stop periodic background writes to `maps/autosave.map` (note: maps are still saved right after explicit editing commands):

In `config/fmg-mcp.json`:
```json
{
  "autosave": {
    "intervalSec": 0
  }
}
```

### 6. Allow `map_eval` and what the risk is

To enable the `map_eval` tool for arbitrary page scripting:

In `config/fmg-mcp.json`:
```json
{
  "allowEval": true
}
```

Or set the environment variable:
```json
"env": {
  "FMG_ALLOW_EVAL": "1"
}
```

**Security Risk**: `map_eval` grants the AI direct execution of arbitrary JavaScript inside the map web page. The AI can inspect, mutate, or delete internal objects, overwrite global functions, bypass the safety checks built into the bridge, or crash the browser tab. The server takes an undo snapshot before running `map_eval`, but complex side effects in the page may not be completely reversible. Keep this option disabled unless you are developing custom bridge features.
