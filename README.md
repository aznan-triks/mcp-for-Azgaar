[Lire en français](README.fr.md)

# mcp-for-Azgaar

mcp-for-Azgaar connects your AI assistant (Claude, Cline, Codex, Hermes, or any MCP-compatible program, with any model that can use tools) to [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator). It is an MCP server—think of MCP as a plug that lets Claude use other programs. The map opens live in a real web browser (Google Chrome or Microsoft Edge) on your computer. You can watch Claude analyze geography, inspect realms, and redraw borders in real time, while retaining full freedom to click and edit by hand. Everything runs 100% locally and offline once installed: no account, no API key, and nothing is ever sent over the internet.

What you can ask Claude:
- "Show me the map"
- "Make the Mouan Empire bigger to the west"
- "Found a new kingdom around this city"
- "Raise a mountain range here"
- "Undo that"

## What You Need

- Windows 10/11, macOS, or Linux.
- Google Chrome or Microsoft Edge.
- An AI program that supports MCP: Claude Desktop (free app from [claude.ai/download](https://claude.ai/download)) is the easiest, but Claude Code, Cline, Codex, Hermes Agent, Cursor, LM Studio and others work too (see "Other AI programs" below).
- Node.js 22.18 or newer (a free program; `install.bat` installs it for you if it is missing).
- An internet connection for installation only.

## Installation

### Windows (3 steps)

1. **Download the project**: Click the green **Code** button on the [GitHub page](https://github.com/aznan-triks/mcp-for-Azgaar) and choose **Download ZIP**. Unzip it anywhere you want, like your `Documents` folder (or use `git clone https://github.com/aznan-triks/mcp-for-Azgaar.git`).
   - *What you should see*: A folder named `mcp-for-Azgaar` with files including `install.bat`.
2. **Run the installer**: Double-click `install.bat`. If Node.js is missing, the installer downloads it automatically via Windows winget and asks you to double-click `install.bat` once more. Setup takes a few minutes to download Azgaar and finish installation. If Windows shows a blue "Windows protected your PC" screen, click **More info**, then **Run anyway** (the file simply comes from the internet).
   - *What you should see*: A console window displaying installation steps, ending with a self-test that reports "All good".
   - *Good to know*: if Claude Desktop is installed, the installer also connects it to the tool (a backup of its settings file is made first). To skip that, run `npm run setup -- --no-register` yourself instead of double-clicking. Command-line users who cloned the repository: `npm install`, then `npm run setup`.
3. **Restart Claude Desktop**: Fully exit Claude Desktop (right-click the Claude icon in your Windows system tray near the clock and select Exit), then reopen Claude Desktop. Start a chat and ask: `Show me the map`.
   - *What you should see*: A browser window opens displaying your map, and Claude describes it to you.

### macOS and Linux

1. Open a terminal inside the project folder.
2. Run `./install.sh`.
   - *What you should see*: Installation progress ending with an "All good" confirmation message.
3. Fully restart Claude Desktop (or open Claude Code) and ask: `Show me the map`.

## Using It

- **Automatic window**: The browser window opens automatically the first time Claude needs it. Leave this window open while chatting.
- **Collaborative editing**: You can watch Claude work in real time and still edit by hand using the map controls at any moment.
- **Visible or hidden window**: by default the window is visible, so you watch the AI work live. To run it hidden ("headless", no window), set `"headless": true` in `config/fmg-mcp.json` or the environment variable `FMG_HEADLESS=1` in your AI program's settings. Hidden mode is handy for servers and automatic tests; the AI still sees the map through screenshots.
- **Autosave**: Maps autosave every minute to the `maps` folder (`autosave.map`) and reload automatically at your next launch.
- **Undo**: Claude can undo any change. If an edit does not suit you, simply say "Undo that" (Claude triggers `map_undo`).

## Keeping Azgaar Up to Date

Keep Azgaar up to date with a single command:
- Double-click `update.bat` (or run `npm run update`). It downloads the latest official Azgaar release, tests it with the bridge, and switches only if all tests pass. If an update fails tests, it keeps your current version and explains why.
- To test the latest development version: `npm run update -- --edge`
- To revert to the known-good tested version: `npm run update -- --known-good`

## Other AI Programs (not only Claude)

This is a standard MCP server, so it works with any AI program that supports MCP: Claude Code, Cline, OpenAI Codex, Hermes Agent, Cursor, Continue, Gemini CLI, LM Studio, Zed, and others. The AI model behind it can be anything that supports "tool calling" (DeepSeek, a local model, ...).

1. Open a terminal in the project folder (on Windows: type `cmd` in the folder's address bar and press Enter).
2. Run `npm run register`. It prints, for each program, **the settings file and the exact block to paste**, with your real paths already filled in.
3. Or let it write the file for you (a backup is made first): `npm run register -- --client cline --write`. Names: `desktop`, `cline`, `cursor`, `gemini`, `lmstudio`, `zed` (see `npm run register -- --list`). Codex, Hermes, Continue and Claude Code are shown as text to paste.
4. Restart the program.

### My AI model cannot see images

Many small or local models (and some DeepSeek models) cannot look at pictures. Add `--text-only` to the register command, for example `npm run register -- --text-only`. Claude then gets the map **drawn in characters** (`~` sea, digits/letters = states, `*` capitals, with a key) instead of screenshots, and everything else works the same. You can also set the environment variable `FMG_TEXT_ONLY=1` in your program's settings, or ask for one text map with `map_view` and `text_map: true`.

Only one AI program should use the server at a time (they would fight over the same port and browser window).

## Troubleshooting

**Claude does not show the tools**
Fully close Claude Desktop (check the Windows notification tray near the clock) and start it again. If tools are still missing, run `npm run doctor` to diagnose.

**Port 8765 already in use**
Another copy of the server is running, or another AI client has bound the port. Close extra instances, or modify `server.port` in `config/fmg-mcp.json`.

**No browser found**
Install Google Chrome or Microsoft Edge in their default locations.

**Export fails, or the map window will not open again after a crash**
A Chrome window left over from a previous run may still hold the tool's browser profile. Close every Chrome window opened by the tool (Task Manager > Chrome), or delete the `.browser-profile` folder in the project, then ask again.

**install.bat window closes instantly**
Do not use "Run as administrator". Open the folder in a terminal (Command Prompt or PowerShell) and run `npm run setup` to see the error output.

**winget not found**
On older Windows setups lacking winget, manually download and install Node.js LTS from [nodejs.org](https://nodejs.org), then run `install.bat` again.

**The map is blank or a notes window covers it**
Run `npm run doctor` in the project folder: it says what is wrong. If it reports that Azgaar is not built, run `npm run setup -- --force` to reinstall it.

**Where are my maps?**
Saved maps are in the `maps/` directory (`autosave.map`). Claude can also save or load named map files using `map_file`.

*Note*: Running `npm run doctor` in your terminal tests your environment and explains how to resolve each issue.

## How It Works

Azgaar is downloaded during installation and augmented with a lightweight bridge. The MCP server directs the browser instance through automated commands. The bridge invokes Azgaar's built-in editor functions directly, keeping all internal counters, state boundaries, and geography in sync.

Available tools:
- `map_summary`: High-level world summary (size, states, cultures, religions, populations).
- `map_view`: Takes a screenshot of the map for Claude (with an optional coordinate grid and state numbers).
- `map_select`: Selects an area of the map (a state, a border strip, a rectangle, around a city...) and shows it in red before anything changes.
- `map_apply`: Applies a change to a selection or an entity: move borders, found states, provinces, cultures or religions, raise or lower land, move labels, restyle emblems.
- `map_undo`: Reverts previous modifications.
- `map_list`: Lists entities (states, provinces, cultures, religions, cities, markers, routes, labels).
- `map_locate`: Finds coordinates and details for map features.
- `map_camera`: Pans and zooms the browser viewport.
- `map_layers`: Shows or hides map layers, applies one of Azgaar's layer presets (political, cultural, heightmap, physical...), or shows exactly the layers you name.
- `map_file`: Saves, loads, lists and generates new maps (with seed, size and generation settings).
- `map_commands`: Returns available editing actions and parameters.
- `map_status`: Displays engine status and connection health.
- `map_export`: Exports to files, exactly like Azgaar's Export menu: pictures (SVG, PNG, JPEG, PNG tiles), data (JSON, GeoJSON, CSV) and the `.map` file. The AI can first choose what is drawn ("only the heightmap and cultures"), then export. Files land in the `exports` folder.
- `map_options`: Reads and sets how the next map is generated (number of states, cultures, religions, heightmap template, climate, units, calendar, map name...), checked by Azgaar's own rules.
- `map_menu`: Runs Azgaar's own actions: open any editor or overview, regenerate rivers, cities, cultures, religions, states, markers, military, economy..., open charts.
- `map_ui`: Operates Azgaar's screen like a person: dialogs, the side menu, any button, field or drop-down, even file pickers (for example importing a heightmap picture).

### Can the AI use 100% of Azgaar?

Practically yes, in three layers:
1. **Dedicated commands** (`map_apply`, `map_select`) for the map edits that need precision: borders, states, provinces, cultures, religions, cities, rivers, routes, markers, labels, emblems, terrain.
2. **Azgaar's own action menu and its screen** (`map_menu` + `map_ui`) for everything else the interface offers: every editor and overview, every regenerate button, styles, notes, units, biomes, diplomacy, zones, military, goods and markets, the image converter...
3. **Exports and settings** (`map_export`, `map_options`) for getting data and pictures out, and for generating maps the way you want.

Honest limits: free-hand drawing on the map with the mouse (brush strokes) is replaced by the terrain and selection commands; the 3D views and Azgaar's online features (its built-in chat assistant, cloud saves) are not supported; operating dialogs through `map_ui` is only as reliable as the dialog itself. For anything left, `allowEval` in `config/fmg-mcp.json` lets an AI run its own code inside the map page (off by default, advanced).

## For Developers

Run tests with:
```bash
npm run check
```

Folder structure:
- `install.bat`, `install.sh`, `update.bat`: the double-click installer and updater.
- `scripts/`: setup, update, compatibility check, diagnostic (`doctor`) and registration scripts.
- `server/`: Core MCP server implementation.
- `overlay/`: Azgaar bridge components (`overlay/agent/`, `overlay/fonts/`).
- `test/`: Test suites and mock environments.
- `config/fmg-mcp.json`: Server configuration file.

## Credits and Licence

- Distributed under the [MIT Licence](LICENSE).
- Created by aznan-triks ([GitHub repository](https://github.com/aznan-triks/mcp-for-Azgaar)).
- Powered by [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) by Azgaar (MIT Licence).
- Built on the Model Context Protocol (MCP).
