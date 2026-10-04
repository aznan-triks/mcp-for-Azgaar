[Lire en français](README.fr.md)

# mcp-for-Azgaar

mcp-for-Azgaar connects your AI assistant (Claude Desktop or Claude Code) to [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator). It is an MCP server—think of MCP as a plug that lets Claude use other programs. The map opens live in a real web browser (Google Chrome or Microsoft Edge) on your computer. You can watch Claude analyze geography, inspect realms, and redraw borders in real time, while retaining full freedom to click and edit by hand. Everything runs 100% locally and offline once installed: no account, no API key, and nothing is ever sent over the internet.

What you can ask Claude:
- "Show me the map"
- "Make the Mouan Empire bigger to the west"
- "Found a new kingdom around this city"
- "Raise a mountain range here"
- "Undo that"

## What You Need

- Windows 10/11, macOS, or Linux.
- Google Chrome or Microsoft Edge.
- Claude Desktop (free app from [claude.ai/download](https://claude.ai/download)) or Claude Code.
- An internet connection for installation only.

## Installation

### Windows (3 steps)

1. **Download the project**: Click the green **Code** button on the [GitHub page](https://github.com/aznan-triks/mcp-for-Azgaar) and choose **Download ZIP**. Unzip it anywhere you want, like your `Documents` folder (or use `git clone https://github.com/aznan-triks/mcp-for-Azgaar.git`).
   - *What you should see*: A folder named `mcp-for-Azgaar` with files including `install.bat`.
2. **Run the installer**: Double-click `install.bat`. If Node.js is missing, the installer downloads it automatically via Windows winget and asks you to double-click `install.bat` once more. Setup takes a few minutes to download Azgaar and finish installation. If Windows shows a blue "Windows protected your PC" screen, click **More info**, then **Run anyway** (the file simply comes from the internet).
   - *What you should see*: A console window displaying installation steps, ending with a self-test that reports "All good".
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
- **Autosave**: Maps autosave every minute to the `maps` folder (`autosave.map`) and reload automatically at your next launch.
- **Undo**: Claude can undo any change. If an edit does not suit you, simply say "Undo that" (Claude triggers `map_undo`).

## Keeping Azgaar Up to Date

Keep Azgaar up to date with a single command:
- Double-click `update.bat` (or run `npm run update`). It downloads the latest official Azgaar release, tests it with the bridge, and switches only if all tests pass. If an update fails tests, it keeps your current version and explains why.
- To test the latest development version: `npm run update -- --edge`
- To revert to the known-good tested version: `npm run update -- --known-good`

## Claude Code Users

- Run `npm run register` to display the exact command to paste:
  `claude mcp add azgaar -- ...`
- Run `npm run register -- --desktop` to write the Claude Desktop configuration file directly (creates a backup first).

## Troubleshooting

**Claude does not show the tools**
Fully close Claude Desktop (check the Windows notification tray near the clock) and start it again. If tools are still missing, run `npm run doctor` to diagnose.

**Port 8765 already in use**
Another copy of the server is running, or another AI client has bound the port. Close extra instances, or modify `server.port` in `config/fmg-mcp.json`.

**No browser found**
Install Google Chrome or Microsoft Edge in their default locations.

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
- `map_list`: Lists entities (states, burgs, rivers, markers).
- `map_locate`: Finds coordinates and details for map features.
- `map_camera`: Pans and zooms the browser viewport.
- `map_layers`: Toggles map visual layers (heightmap, routes, borders).
- `map_file`: Saves, loads, and exports map files.
- `map_commands`: Returns available editing actions and parameters.
- `map_status`: Displays engine status and connection health.

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
