# Troubleshooting

> **Tested on:** Windows 10 with Google Chrome and a stdio MCP client. macOS, Linux, Microsoft Edge alone and the other AI programs named here follow the same standards and the installer is written for them, but they have not been tested yet.

Solutions for common problems when installing, connecting, or using mcp-for-Azgaar.

---

## Installation and Setup

### 1. "Node ... is too old: this server needs Node 22.18 or newer"
- **Symptom**: During setup, or in your AI program's log, you see:
  `Node 20.11.0 is too old: this server needs Node 22.18 or newer (24 recommended). Install it from https://nodejs.org, then restart your AI client.`
- **Cause**: Your computer has an outdated version of Node.js installed, or no Node.js at all.
- **Fix**: Install the current Long Term Support (LTS) release of Node.js. On Windows, run in PowerShell or Command Prompt:
  ```powershell
  winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  ```
  Or download and run the installer directly from [nodejs.org](https://nodejs.org). Afterward, close your terminal, open a new one, and run `install.bat` or `npm run setup` again.

### 2. winget is missing or not recognized
- **Symptom**: Running `install.bat` fails with a message that `winget` is not recognized as an internal or external command.
- **Cause**: Older Windows 10 installations lack the Windows Package Manager (`winget`).
- **Fix**: Manually download and run the Node.js installer from [nodejs.org](https://nodejs.org). Once installed, double-click `install.bat` once more.

### 3. The `install.bat` window closes instantly
- **Symptom**: You double-click `install.bat` and the window flashes open for a fraction of a second and immediately disappears.
- **Cause**: Windows was asked to "Run as administrator" (which changes the working directory to System32), or an early command failed before output could be read.
- **Fix**: Do not right-click and choose "Run as administrator". Instead, open a Command Prompt inside the project folder (type `cmd` in the File Explorer address bar and press Enter), then run:
  ```cmd
  npm run setup
  ```
  Any error message will stay visible in the terminal window.

### 4. Windows SmartScreen blocks `install.bat`
- **Symptom**: Windows displays a blue window saying "Windows protected your PC - Microsoft Defender SmartScreen prevented an unrecognized app from starting".
- **Cause**: `install.bat` was downloaded from the internet and does not carry a paid commercial digital signature.
- **Fix**: Click the small **More info** link underneath the warning text, then click the **Run anyway** button.

### 5. Download blocked by firewall or proxy
- **Symptom**: The installer fails while fetching Azgaar with:
  `GitHub answered 403 when asking for the latest Azgaar release. Check your internet connection and try again.`
  or:
  `Could not download https://codeload.github.com/Azgaar/Fantasy-Map-Generator/tar.gz/... (HTTP 403). Check your internet connection.`
- **Cause**: Your internet connection, corporate firewall, or VPN blocks access to GitHub API or codeload archives.
- **Fix**: Ensure your computer can reach `api.github.com` and `codeload.github.com`. If you use a corporate HTTP proxy, configure it in your terminal with:
  ```bash
  npm config set proxy http://proxy.company.com:8080
  npm config set https-proxy http://proxy.company.com:8080
  ```
  Then rerun `npm run setup`.

### 6. npm install fails with dependency errors
- **Symptom**: Setup halts with:
  `npm could not install Azgaar's dependencies (see the messages above).`
- **Cause**: An interrupted download, an incomplete `node_modules` folder, or an outdated npm cache.
- **Fix**: Clean your npm cache and re-run setup with the force flag:
  ```bash
  npm cache clean --force
  npm run setup -- --force
  ```

### 7. Disk space errors during installation
- **Symptom**: Setup fails with `ENOSPC: no space left on device` while downloading or compiling Azgaar.
- **Cause**: Building Azgaar and installing npm packages requires approximately 500 MB of temporary disk space.
- **Fix**: Free up space on your primary operating system drive (especially the `%TEMP%` directory on Windows) and run:
  ```bash
  npm run setup -- --force
  ```

### 8. Antivirus locks or deletes build files
- **Symptom**: Setup fails with `EPERM` or `EACCES` when writing to `upstream/azgaar` or `.browser-profile`.
- **Cause**: Real-time antivirus scanners can temporarily lock new JavaScript or binary files as they are unpacked and built.
- **Fix**: Add the `mcp-for-Azgaar` project directory to your antivirus software's exclusion list, then run `npm run setup -- --force`.

### 9. File path contains spaces or non-ASCII characters
- **Symptom**: Tools report file errors or setup fails when unpacking archives if the folder path has accents or special symbols.
- **Cause**: Certain third-party command-line utilities can misread paths with special characters.
- **Fix**: Move the `mcp-for-Azgaar` folder to a simpler path without spaces or accents (for example, `C:\projets\mcp-for-Azgaar` or `D:\mcp-for-Azgaar`), then re-run setup.

### 10. Archive extraction fails with tar errors
- **Symptom**: Setup halts with:
  `Could not unpack the download (tar): ...`
- **Cause**: A non-standard version of `tar` (such as an old GNU tar from a custom Git Bash path) was found before Windows System32's native `tar.exe`.
- **Fix**: On Windows, the installer defaults to `C:\Windows\System32\tar.exe`. If you have a custom PATH overriding it, ensure System32 comes first in your PATH or run the command directly from standard Windows PowerShell.

---

## Connecting Your AI Program

### 11. Claude Desktop does not list the map tools
- **Symptom**: In Claude Desktop, clicking the attachment or tools button shows no `map_view` or other map tools.
- **Cause**: Claude Desktop was not restarted, or the configuration file was not updated.
- **Fix**: Completely exit Claude Desktop (right-click the Claude icon in the Windows notification area near the clock and click **Exit**). Then run:
  ```bash
  npm run register -- --client desktop --write
  ```
  Restart Claude Desktop and check again.

### 12. "Server disconnected" in the AI client
- **Symptom**: Your AI program reports that the MCP server disconnected or exited unexpectedly.
- **Cause**: The Node process crashed on startup, usually because Node is missing or the project path changed.
- **Fix**: Run the doctor diagnostic to find the exact reason:
  ```bash
  npm run doctor
  ```

### 13. You moved the project folder to a new location
- **Symptom**: The AI assistant says it cannot start the server after moving the folder.
- **Cause**: AI configuration files store the absolute path to `scripts/start.mjs`. Moving the folder makes this path invalid.
- **Fix**: Open a terminal in the folder's new location and run:
  ```bash
  npm run register -- --client desktop --write
  ```
  Replace `desktop` with `cline`, `cursor`, or your client name if you use another app.

### 14. Two AI programs try to use the server at the same time
- **Symptom**: The second program fails to start or its log says:
  `Port 8765 is already in use: change server.port in config/fmg-mcp.json` (the self-test `npm run doctor` adds: `close the other copy of the server (another AI client may be using it) or change server.port`).
- **Cause**: Only one AI program may run the server at a time because they share the browser window and port 8765.
- **Fix**: Close the first AI program or disconnect its session before starting the other.

### 15. Settings change requires a full restart
- **Symptom**: You edited `config/fmg-mcp.json` or ran `npm run register`, but the AI assistant still behaves as before.
- **Cause**: AI programs only read their MCP server configurations once when launching.
- **Fix**: Fully quit and reopen your AI client (close system tray processes as well).

### 16. Setting up Claude Code
- **Symptom**: You want to use Claude Code in the terminal instead of Claude Desktop.
- **Cause**: Claude Code uses its own command line registration rather than `claude_desktop_config.json`.
- **Fix**: In your terminal inside the project directory, run:
  ```bash
  npm run register
  ```
  Copy the exact command printed under `Claude Code (run once):`, which looks like:
  ```bash
  claude mcp add azgaar -- node "D:/path/to/mcp-for-Azgaar/scripts/start.mjs"
  ```
  Run that command in your terminal.

### 17. Setting up Cline in VS Code
- **Symptom**: You want to register the server in the Cline extension for Visual Studio Code.
- **Cause**: Cline stores configuration in `cline_mcp_settings.json`.
- **Fix**: Run:
  ```bash
  npm run register -- --client cline --write
  ```
  Then reload your VS Code window.

### 18. Setting up Cursor
- **Symptom**: You want to use the server with Cursor AI editor.
- **Cause**: Cursor uses `.cursor/mcp.json`.
- **Fix**: Run:
  ```bash
  npm run register -- --client cursor --write
  ```
  Restart Cursor afterward.

### 19. Setting up LM Studio
- **Symptom**: You want to connect a local language model in LM Studio.
- **Cause**: LM Studio stores MCP configurations in `.lmstudio/mcp.json` and requires models that support tool calling.
- **Fix**: Run:
  ```bash
  npm run register -- --client lmstudio --write
  ```
  Ensure your loaded model in LM Studio supports function/tool calling. If the model cannot process images, add `--text-only`:
  ```bash
  npm run register -- --client lmstudio --write --text-only
  ```

### 20. Setting up Codex CLI or Hermes Agent
- **Symptom**: You want to configure OpenAI Codex CLI or Nous Research Hermes Agent.
- **Cause**: These tools use TOML or YAML configuration files instead of JSON.
- **Fix**: Run `npm run register` with no arguments. It prints ready-to-paste blocks:
  - For Codex: copy the TOML block into `~/.codex/config.toml`.
  - For Hermes: copy the YAML block into `~/.hermes/config.yaml`.

---

## Browser and Window

### 21. "No browser found"
- **Symptom**: The tool fails with:
  `No browser found (tried: chrome, msedge). Install Google Chrome or Microsoft Edge, or set browser.executablePath (or browser.channel) in config/fmg-mcp.json.`
- **Cause**: Neither Google Chrome nor Microsoft Edge is installed in their standard operating system locations.
- **Fix**: Install Google Chrome or Microsoft Edge. If you have a custom browser location, open `config/fmg-mcp.json` and set `browser.executablePath` to the absolute path of your browser executable.

### 22. Browser window closes immediately
- **Symptom**: The browser opens and closes right away.
- **Cause**: Another process may be holding the user profile lock, or the session was interrupted.
- **Fix**: Close any background Chrome or Edge processes in Windows Task Manager, or delete the `.browser-profile` folder in the project root.

### 23. You accidentally closed the map browser window
- **Symptom**: You closed the browser window with the 'X' button while chatting.
- **Cause**: The browser was manually closed.
- **Fix**: You do not need to do anything. The next time the AI executes a map tool, it calls `session.ensure()`, which automatically launches a fresh browser window and restores your map.

### 24. Leftover Chrome holds the profile
- **Symptom**: The tool fails with an error indicating the user data directory is in use by another browser instance.
- **Cause**: A previous browser process did not shut down cleanly.
- **Fix**: Open Task Manager (Ctrl+Shift+Esc), end any running `Google Chrome` or `Microsoft Edge` processes started by the tool, or delete the `.browser-profile` folder in the project folder.

### 25. The browser opens a blank white page
- **Symptom**: A browser window opens, but the screen stays entirely white and no map appears.
- **Cause**: Azgaar's frontend was not compiled, or `dist-electron/renderer/index.html` is missing.
- **Fix**: Rebuild the application with:
  ```bash
  npm run setup -- --force
  ```

### 26. Release-notes popup covers the map
- **Symptom**: A modal window with "Changelog" or release notes appears in the center of the map on launch.
- **Cause**: Browser local storage was cleared or did not receive the version seed.
- **Fix**: The server automatically injects `seedStorage` at startup. If the dialog appears, simply ask the AI: "Close all open dialogs", which invokes `map_ui` with `{"action": "close_dialogs"}`.

### 27. The map window is too small or too large
- **Symptom**: The browser window size does not fit your display screen.
- **Cause**: Default dimensions are set to 1280x720 in `config/fmg-mcp.json`.
- **Fix**: Open `config/fmg-mcp.json` in a text editor and adjust `browser.viewport.width` and `browser.viewport.height`.

---

## Map and Editing

### 28. Edits were applied but nothing changed on screen
- **Symptom**: The AI says it adjusted relief, cultures, or religions, but the map looks the same.
- **Cause**: The visual layer for that feature is currently turned off.
- **Fix**: Ask the AI: "Turn on the heightmap layer" or "Switch to the cultural preset". The AI calls `map_layers` to activate the layer.

### 29. State IDs or cell numbers changed after an undo or load
- **Symptom**: After undoing a terrain change, cell numbers or state indexes shifted.
- **Cause**: When terrain is edited with `scope: "all"`, coastlines move, which rebuilds the map grid and renumbers cells.
- **Fix**: If you want to raise or lower land without changing cell numbers or coastlines, ask the AI to edit terrain using `scope: "land"`, which modifies elevations in place.

### 30. Selection red highlight disappears after undo
- **Symptom**: You had a red selection on screen, asked the AI to undo a change, and the red highlight vanished.
- **Cause**: `map_undo` reloads the entire saved `.map` file in the browser (taking about 2 seconds), which resets temporary selection overlays.
- **Fix**: Selections do not survive reloads. Ask the AI to re-select the area before applying the next edit.

### 31. Editing is slow on very large maps
- **Symptom**: Edits take 5 to 10 seconds to respond.
- **Cause**: Maps generated with high point density (e.g. over 20,000 cells) or large canvas dimensions require heavy recalculation of Voronoi polygons and borders.
- **Fix**: For quick prototyping, generate maps with standard sizes (1280x720) and default density.

### 32. Autosave file cannot be restored
- **Symptom**: On startup, `map_status` lists a warning:
  `could not restore the previous map, a new one was generated: ...`
- **Cause**: `maps/autosave.map` was corrupted or interrupted during a previous system crash.
- **Fix**: The server safely generates a clean map. If you have an earlier named save, ask the AI to load it with `map_file load`.

### 33. Map resets to a random world on startup
- **Symptom**: Every time you start a new conversation, your previous world is replaced with a new random one.
- **Cause**: `startup` in `config/fmg-mcp.json` was changed from `"autosave"` to `"new"`.
- **Fix**: Open `config/fmg-mcp.json` and ensure `"startup": "autosave"`.

---

## Exports

### 34. Export fails with "nothing was downloaded"
- **Symptom**: The AI calls `map_export` and reports:
  `Azgaar did not produce a file (nothing was downloaded). If the browser window was closed or crashed, ask again (it reopens); if it keeps failing, close any leftover Chrome window from a previous run, or delete the .browser-profile folder.`
- **Cause**: The browser window crashed during rendering, or an open modal dialog blocked the export.
- **Fix**: Close any open dialogs with `map_ui close_dialogs`, or close the browser window so that the server reopens a clean instance on your next request.

### 35. Picture is not attached in the chat window
- **Symptom**: The AI says the export succeeded, but no picture appears in the chat message.
- **Cause**: The exported image exceeds `maxImageBytes` (default 900 KB) in `config/fmg-mcp.json`. The server returns:
  `The picture is too large to attach here; it is saved at the path above.`
- **Fix**: You will find the exported file saved directly inside the `exports/` folder in your project directory.

### 36. PNG export shows the wrong layers
- **Symptom**: You asked for a political map, but the exported image shows biomes or relief.
- **Cause**: `map_export` accepts `only_layers` and `layer_preset` parameters that override current screen layers during the export.
- **Fix**: Ask the AI to specify the exact layers or preset you want in the export, for example: "Export a PNG with layer preset political".

---

## Generation and Settings

### 37. `map_options` set is refused
- **Symptom**: The AI attempts to set options and receives:
  `settings: refused, nothing changed. ... Current values and choices: map_options get`
- **Cause**: The provided setting value violated Azgaar's options schema (for example, negative state counts or an unknown template name).
- **Fix**: Ask the AI to call `map_options` with `action: "get"` to inspect allowed choices and parameter ranges.

### 38. Preset settings are ignored on the next generated map
- **Symptom**: You set the template to archipelago, but a new map generates as a continent.
- **Cause**: The pins were released or `map_file new` was called without saving the pinned values first.
- **Fix**: Use `map_options` with `action: "set"` right before calling `map_file` with `action: "new"`. Do not call `release` until after the new map has generated.

---

## Updates and Compatibility

### 39. `npm run update` reports version is not compatible
- **Symptom**: Running `npm run update` prints:
  `This Azgaar version is not compatible yet (could not apply: ...).`
  or:
  `The new Azgaar did not pass the compatibility check.`
- **Cause**: Upstream Azgaar introduced structural code changes that do not match the bridge's patching patterns.
- **Fix**: The updater automatically rolls back:
  `Your current Azgaar was kept and keeps working. If you think this is a bug in the bridge, open an issue on GitHub and mention the line above.`
  Your existing map generator remains functional.

### 40. Reverting to the tested baseline version
- **Symptom**: You updated to an experimental release and want to return to the tested known-good version.
- **Cause**: An update created unwanted behavior.
- **Fix**: Run:
  ```bash
  npm run update -- --known-good
  ```
  This restores the exact release stored in `known-good.json`.

---

## Text-Only Models and Ports

### 41. Model cannot view screenshots
- **Symptom**: A local AI model or terminal client complains that it cannot process image attachments.
- **Cause**: Many smaller local models (and some command-line tools) only support text.
- **Fix**: Re-register your client with the `--text-only` flag:
  ```bash
  npm run register -- --client desktop --write --text-only
  ```
  Or ask the AI to call `map_view` with `{"text_map": true}`.

### 42. Local port 8765 is already in use
- **Symptom**: The doctor diagnostic or server log reports:
  `Port 8765 is already in use: change server.port in config/fmg-mcp.json` (shown by `npm run doctor` as a line starting with `FAIL`)
- **Cause**: Another copy of the server is running, or another application bound port 8765.
- **Fix**: Close any extra terminal or AI client running mcp-for-Azgaar. To use another port, edit `server.port` in `config/fmg-mcp.json` or set the `FMG_PORT` environment variable:
  Windows PowerShell: `$env:FMG_PORT="8790"`; Windows Command Prompt: `set FMG_PORT=8790`; macOS/Linux terminal: `export FMG_PORT=8790`. For an AI program, set `FMG_PORT` in its own environment settings (see [CONFIGURATION](CONFIGURATION.md)).

---

## Still Stuck?

If you have tried the steps above and the problem persists:

1. **Run the self-diagnostic tool**:
   Open a terminal in the project directory and run:
   ```bash
   npm run doctor
   ```
   Read the lines marked `FAIL`: each failure includes an arrow `->` explaining the exact fix.

2. **Check the server logs**:
   - In Claude Desktop: check the logs menu or inspect the stderr console output.
   - Inside any conversation: ask your AI to call `map_status`. It reports the local server URL, bridge version, startup warnings, and any page errors recorded by the browser.

3. **Open an issue on GitHub**:
   Visit [https://github.com/aznan-triks/mcp-for-Azgaar/issues](https://github.com/aznan-triks/mcp-for-Azgaar/issues).
   Copy and paste:
   - The output of `npm run doctor`
   - Your operating system (Windows, macOS, or Linux)
   - Your AI program name and version (e.g. Claude Desktop 0.8, Cline, Cursor)
   - The exact error text shown in your chat or terminal
