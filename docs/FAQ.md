# Frequently Asked Questions (FAQ)

> **Tested on:** Windows 10 with Google Chrome and a stdio MCP client. macOS, Linux, Microsoft Edge alone and the other AI programs named here follow the same standards and the installer is written for them, but they have not been tested yet.

Short answers to common questions about mcp-for-Azgaar.

---

### 1. What is mcp-for-Azgaar?
It is a bridge that connects your AI assistant (such as Claude, Cline, or Cursor) to Azgaar's Fantasy Map Generator. It allows an AI to view, analyze, and edit fantasy maps inside a real web browser while you watch and participate.

### 2. Is it free to use?
Yes. Both Azgaar's Fantasy Map Generator and this bridge are free, open-source software. You do not need any subscription, account, or API key to run this server.

### 3. Does it run completely offline?
Yes. Once installed, the map runs entirely on your local machine using an internal web server. The browser profile blocks all outside network requests. Nothing from your map is ever sent to the internet.

### 4. Which AI programs can I use?
It works with any program that supports the Model Context Protocol (MCP) over standard input/output (`stdio`). Ready-made settings are provided for Claude Desktop, Claude Code, Cline, Cursor, Gemini CLI, LM Studio, OpenAI Codex CLI, Nous Research Hermes Agent, Continue.dev and Zed; only a stdio MCP client on Windows 10 has been tested so far, the others follow the same standard. See [README.md](../README.md) for setup details.

### 5. Which AI models work with this tool?
Any model capable of tool calling (also known as function calling) can use this server. This includes Anthropic Claude models, OpenAI GPT-4 models, Google Gemini, DeepSeek, and local open-weights models run through LM Studio or Ollama.

### 6. Which operating systems are supported?
It is written for Windows 10/11, macOS and Linux. Only Windows 10 (with Chrome) has been tested so far. On Windows, double-click `install.bat`; on macOS and Linux, run `./install.sh` (not tested yet).

### 7. How is this different from using the Azgaar website directly?
The website requires you to click every button and adjust every border by hand. With mcp-for-Azgaar, you can tell an AI what you want in plain words (for example, "merge these two states" or "create a mountain ridge"), and the AI executes the exact calculations while you watch. You still keep full control to edit by hand in the same browser window at any time.

### 8. Can I use my existing `.map` files from the website?
Yes. Copy any `.map` file created on the Azgaar website into the `maps/` folder of this project. You can then ask your AI assistant to load it by name using `map_file load`.

### 9. Does it modify or overwrite Azgaar's original code?
No. Azgaar is downloaded into the `upstream/azgaar/` folder during installation. The bridge patches a small set of functions by pattern so they can be exported, and adds bridge files in a separate folder. The original repository is never modified directly.

### 10. How are updates handled and how is compatibility kept?
You can update Azgaar at any time by double-clicking `update.bat` or running `npm run update`. The updater downloads the new version, applies patches, and runs a compatibility test (`scripts/compat.mjs`). If any test fails, it automatically rolls back to your current working version without breaking your setup.

### 11. What is the `--known-good` version?
`known-good.json` stores the exact release version of Azgaar against which all tools and automated tests were verified. If an experimental update causes issues, running `npm run update -- --known-good` brings you back to this stable baseline.

### 12. Can the AI break or ruin my map?
No. Every editing command automatically creates a backup snapshot of your map before making changes. If an edit fails midway, the server automatically restores the map. In addition, you can undo any change by telling the AI "Undo that".

### 13. How does undo work?
When the AI calls `map_undo`, the server restores the previous map state and reloads the browser window (taking about two seconds). Up to 30 past editing steps are kept as full map files on disk, in `maps/history/` (the number is `history.maxEntries` in the configuration).

### 14. Where are my saved maps and exported files stored?
- Saved maps are stored in the `maps/` directory as `.map` files.
- Exported images (PNG, JPEG, SVG) and data files (GeoJSON, JSON, CSV) are stored in the `exports/` directory.

### 15. How does the autosave work?
The map automatically saves every 60 seconds and after every successful edit to `maps/autosave.map`. When you restart the server or reopen your AI assistant, your last map reloads automatically.

### 16. Can two AI assistants use the tool at the same time?
No. Only one AI program should connect to the server at a time. Multiple programs running simultaneously would compete for the same local port (8765) and the same browser user profile.

### 17. Does it work on a smartphone or tablet?
No. The server requires Node.js, Google Chrome or Microsoft Edge, and a desktop operating system (Windows, macOS, or Linux).

### 18. How does it perform on large maps with many cells?
Standard maps (around 10,000 cells) respond quickly within one to two seconds. Very large maps (over 20,000 cells) require more computation for border polygons and Voronoi recalculations, which can take several seconds per edit.

### 19. What can the AI NOT do?
The AI cannot draw freehand mouse brushstrokes (it uses precision geometric shapes and terrain algorithms instead), cannot run 3D globe views, and cannot access Azgaar's cloud saves or built-in web chat. For full details on all available tools, see [TOOLS.md](TOOLS.md) and [COMMANDS.md](COMMANDS.md).

### 20. Can I still click and edit the map by hand while chatting with the AI?
Yes. You can click on the map, open editors, change layer settings, and move markers with your mouse. The periodic autosave captures your manual changes so the AI always sees the current state.

### 21. Can I use an AI model that cannot view images?
Yes. If your model cannot process screenshots, you can register your client with `npm run register -- --text-only`. The server then provides map overviews drawn with text characters instead of image screenshots. Individual text views can also be requested with `map_view` using `text_map: true`.

### 22. Can I run the browser hidden in the background without a window?
Yes. In `config/fmg-mcp.json`, set `"headless": true` under `"browser"`, or set the environment variable `FMG_HEADLESS=1`. The browser runs invisibly while the AI still sees the map via internal screenshots.

### 23. Why does the AI sometimes take two seconds to answer after an edit?
When an edit changes territory, coastlines, or relief, Azgaar recalculates labels, country statistics, and visual layers. The server waits a short settling period (200 milliseconds by default) to ensure graphics finish rendering before capturing a screenshot.

### 24. What open source license is this project released under?
mcp-for-Azgaar is distributed under the MIT Licence. Azgaar's Fantasy Map Generator is also licensed under the MIT Licence.

### 25. How do I contribute or report a bug?
You can report bugs or suggest enhancements on GitHub at [https://github.com/aznan-triks/mcp-for-Azgaar/issues](https://github.com/aznan-triks/mcp-for-Azgaar/issues). For troubleshooting steps before opening an issue, check [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

### 26. How do I uninstall mcp-for-Azgaar?
1. Remove the server registration from your AI program by running:
   ```bash
   npm run register -- --client desktop --remove
   ```
   (Replace `desktop` with your client name, such as `cline` or `cursor`).
2. Delete the `mcp-for-Azgaar` folder from your computer. No background services or system files remain. For step-by-step instructions, see [UNINSTALL.md](UNINSTALL.md).

### 27. Where can I find more examples and command details?
- For practical prompt recipes, see [USAGE-EXAMPLES.md](USAGE-EXAMPLES.md).
- For complete parameter listings of every tool, see [TOOLS.md](TOOLS.md).
- For all editing commands and selection shapes, see [COMMANDS.md](COMMANDS.md).
- For server and browser settings, see [CONFIGURATION.md](CONFIGURATION.md).
- For offline guarantees and security policies, see [SECURITY.md](SECURITY.md).
- For internal architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).
- For troubleshooting and diagnostics, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
- For uninstallation instructions, see [UNINSTALL.md](UNINSTALL.md).
