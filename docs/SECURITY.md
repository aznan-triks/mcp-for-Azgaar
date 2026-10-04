# Security and Privacy Reference

> **Tested on:** Windows 10 with Google Chrome and a stdio MCP client. macOS, Linux, Microsoft Edge alone and the other AI programs named here follow the same standards and the installer is written for them, but they have not been tested yet.

This document explains what mcp-for-Azgaar does on your computer, what it downloads, where it writes files, and the boundaries that keep your data private and safe.

## What Runs on Your Computer

When your AI program uses mcp-for-Azgaar, three components run locally on your machine:

1. **The MCP server process**: A Node.js background process (`server/index.ts` via `scripts/start.mjs`). It speaks the Model Context Protocol (MCP) over standard input/output (stdio) with your AI client (for example Claude Desktop). It never listens for incoming connections from the outside internet.
2. **A local web server**: An internal HTTP server (`server/static.ts`) that serves Azgaar's web files. It binds exclusively to the loopback address (`127.0.0.1`), meaning it is accessible only from your own computer.
3. **A browser instance**: A local browser window (Google Chrome or Microsoft Edge) controlled through Playwright. The browser displays the map and runs the AI bridge (`overlay/agent/`).

## Network Access and Offline Guarantee

Once installed, mcp-for-Azgaar is designed to operate 100% offline.

- **Outside requests are blocked**: In `server/browser.ts`, network routing intercepts every HTTP and HTTPS request from the browser context (`context.route("**/*")`). Only requests to `data:` URLs, `blob:` URLs, and local loopback hosts (`127.0.0.1`, `localhost`, `[::1]`) are allowed to load.
- **Outside requests are logged**: Any attempt by the page or any embedded script to contact an outside server is immediately aborted and added to an internal list.
- **Auditing blocked requests**: You or the AI can call the `map_status` tool at any time. It returns `blockedOutsideRequests`, listing every external URL that the browser attempted to reach and was denied.

## What Is Downloaded and From Where

Internet access is used only during installation and explicit updates.

- **At installation time**:
  - The setup script (`scripts/azgaar.mjs`) queries the official GitHub API (`https://api.github.com/repos/Azgaar/Fantasy-Map-Generator/releases/latest`) or downloads a specific source archive from GitHub codeload (`https://codeload.github.com/Azgaar/Fantasy-Map-Generator/tar.gz/<ref>`).
  - Standard npm packages required to build Azgaar and run the server are installed via `npm ci --ignore-scripts --no-audit --no-fund` and `npm install`.
  - Nothing else is downloaded.
- **No background updates**: The software never checks for updates or downloads code in the background. New versions of Azgaar are downloaded only when you manually run `npm run update` or double-click `update.bat`.

## Where Files Are Written

All permanent files created by mcp-for-Azgaar stay inside the project directory, with the exception of configuration backups made in your AI client's settings folder:

| Folder / File | Location | Content and Purpose |
|---|---|---|
| `maps/` | Project root | Stores saved map files (`.map`) and the automatic background save (`autosave.map`). |
| `maps/history/` | Project root | Stores numbered `.map` snapshots used for undo and redo operations. |
| `exports/` | Project root | Stores exported image files (`.png`, `.svg`, `.jpeg`), zipped tiles, and exported data (`.json`, `.geojson`, `.csv`). |
| `upstream/` | Project root | Stores the downloaded Azgaar source code, compiled web assets (`upstream/azgaar/dist-electron/renderer/`), and version metadata (`upstream/state.json`). |
| `.browser-profile/` | Project root | Stores the browser user profile, cache, and `localStorage` used by the automated browser instance. |
| Client config backups | Client settings directory | When `scripts/register.mjs` updates a client configuration file (e.g. Claude Desktop settings), it saves a timestamped backup copy with extension `.bak-<timestamp>` in the same folder first. |
| Temporary directories | OS temporary folder | Short-lived folders prefixed with `azgaar-compat-`, `azgaar-docs-` or `azgaar-dl-`, used during setup, updates and documentation generation. These are deleted after use. The self-test (`npm run doctor`) uses a `.browser-profile-doctor` folder next to `.browser-profile`, which it removes when it finishes. |

## Accounts, Keys, and Telemetry

- **No accounts or registration**: You do not need to create an account or sign in to any service to use this software.
- **No API keys or tokens**: The server requires no API keys, credentials, or secrets.
- **No telemetry or tracking**: There is zero telemetry, usage analytics, or crash reporting in mcp-for-Azgaar. In addition, when Azgaar is compiled during setup, it is built with `--mode electron`, which deactivates the web analytics included in Azgaar's default web build.

## What the AI Can and Cannot Do

The AI interacts with Azgaar strictly through the registered MCP tools.

### What the AI can do
- Inspect map geography, states, cities, relief, biomes, and populations.
- Take screenshots or generate character-based text maps of the active viewport.
- Select regions, shift borders, found states, raise terrain, and adjust labels.
- Trigger Azgaar menu commands and click dialog buttons via `map_menu` and `map_ui`.
- Save maps to `maps/` and export visual or tabular data to `exports/`.
- Undo any modifications made during the active session.

### What the AI cannot do
- **Writing stays inside the project**: map tools write only to `maps/` (saves, autosave, undo snapshots) and `exports/` (exports). Reading is limited to saved maps in `maps/`, with one exception described next.
- **Safe file export**: In `server/browser.ts` and `server/tools-extra.ts`, export file names are sanitized: path traversal characters (`..`) and directory slashes are removed. All exported files are written strictly inside the `exports/` folder.
- **Local file upload boundary**: The `map_ui` tool provides an `upload` action that can pass a file path into an in-page file picker (for example to load a custom heightmap image or `.map` file). It only checks that the path exists on your computer; it does **not** restrict it to the project folder. So an AI can hand any file it knows the path of (for example a picture in your Downloads folder) to Azgaar's page. That page is offline and cannot send the content anywhere, but keep it in mind, and decline an `upload` you did not expect.
- **JavaScript evaluation is disabled by default**: The `map_eval` tool is disabled by default (`"allowEval": false` in `config/fmg-mcp.json`). If manually enabled, the AI can execute arbitrary JavaScript within the browser page context. It is protected by an undo snapshot before execution, but can alter in-memory page structures.

## Port Collisions and Multi-Instance Risks

By default, the internal static web server listens on TCP port `8765` on `127.0.0.1`.

- **Port in use error**: If another program (or a second running instance of mcp-for-Azgaar) is already using port 8765, the server fails to start with the message `Port 8765 is already in use: change server.port in config/fmg-mcp.json`.
- **Profile locking**: Running multiple AI clients connected to mcp-for-Azgaar simultaneously can cause Playwright to fail because the `.browser-profile` folder is locked by the first running browser process.
- **Recommendation**: Run one AI client at a time with mcp-for-Azgaar, or configure distinct ports (`server.port`) and distinct profile directories (`profileDir`) in `config/fmg-mcp.json` if running multiple instances.

## Technical Limits

- The Node.js server process runs with the privileges of the local user who launched the AI client. It does not run in a low-privilege operating system sandbox.
- Loopback isolation protects against external network access, but any program already running locally on your computer with user permissions could connect to `http://127.0.0.1:8765` while the server is active.

## Reporting a Vulnerability

If you discover a security issue or vulnerability in mcp-for-Azgaar:

- Open an issue on GitHub: [https://github.com/aznan-triks/mcp-for-Azgaar/issues](https://github.com/aznan-triks/mcp-for-Azgaar/issues).
- Please describe the issue clearly and include steps to reproduce.
- Do not publish sensitive personal credentials, API keys, or uncoordinated exploit details in public issue trackers.
