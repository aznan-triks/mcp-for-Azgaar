# Removing it

Nothing this project writes is needed by anything else on your machine, and it never writes outside its own folders except where you point it.

## In the AI client

Remove the server entry: `npm run register` prints the exact command for each client. For Claude Desktop the entry lives in its config file (`claude_desktop_config.json`); if you used `npm run register -- --desktop`, a timestamped backup of that file was made next to it before the change — restore that backup, or delete only the `mcpServers.map-of-trois` block.

## On the disk

```bash
rm -rf <project>            # code, server, bridge, scripts
```

Your work is **not** inside the project unless you left it there:

| What | Where | Keeps working without the project? |
|---|---|---|
| Your maps | `maps/` in the project (or `FMG_MAPS_DIR`) | yes, if you move the folder first |
| Autosave and rescue checkpoints | `maps/autosave.map`, `maps/rescue-before-undo*.map`, `maps/pre-submap.map` | same |
| Exported pictures and data | `exports/` (or `FMG_EXPORTS_DIR`) | yes |
| Browser window state | `.browser-profile/` in the project | safe to delete |
| Legend presets | `maps/layer-presets.json` | safe to delete |
| The map itself, if you also used Azgaar in a browser | your own `.map` files | the generator is not installed by this project |

The Chromium profile folder belongs to this project only: it never touches your own browser's profile, bookmarks or passwords. Removing the project removes it.

## Leftovers to check

- A running server keeps a Chrome window and a listening port on `127.0.0.1`. Quitting the AI client stops it; otherwise `pkill -f "scripts/start.mjs"` is enough, and the map is autosaved before the process dies.
- If you pinned the folder in a shell profile or a task, drop that too. No service, daemon, start-up item or registry key is ever installed.
