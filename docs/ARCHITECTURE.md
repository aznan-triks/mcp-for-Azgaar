# Architecture

```
AI client (Claude)  --MCP over stdio-->  server/  --Playwright-->  Chrome/Edge window
                                                                      |
                                                    Azgaar (built)  + bridge  =  window.FMG_AGENT
```

## Three layers, one direction

| Layer | Folder | May use | Must not use |
|---|---|---|---|
| MCP server | `server/` | the bridge's public methods (`FMG_AGENT.*`), Playwright, the filesystem | Azgaar's data structures (`pack`, `grid`...) |
| Bridge | `overlay/agent/` (copied into Azgaar's `src/agent` at install) | Azgaar's own code and globals | Playwright, MCP, the server |
| Azgaar | `upstream/azgaar` (downloaded, gitignored) | - | - |

`npm run check` enforces the two "must not" rules.

## Why a bridge compiled into Azgaar

It can import Azgaar's internal editor functions, so every edit repeats the exact recalculation steps of the interface (neighbours, statistics, labels) instead of leaving stale counters. It is type-checked against Azgaar's types and tested in a real browser.

## Following new Azgaar versions

Azgaar is not stored here. `scripts/azgaar.mjs` downloads a tag/commit and applies a short list of patches **by pattern**, not by line number:

1. copy `overlay/agent` to `src/agent` and `overlay/fonts` to `public/fonts`;
2. add `import "@/agent"` to `src/main.ts`;
3. add `export` to six internal functions, wherever Azgaar keeps them (so file moves do not matter);
4. two small upstream fixes (States editor refresh with the dialog closed; null deity in the religion name generator);
5. point bundled fonts to local files (fully offline).

Required patches missing = "not compatible yet" (clear message, nothing replaced). `npm run update` also builds the new version beside the old one and runs `scripts/compat.mjs` before switching. `known-good.json` is the version everything was last tested against.

## Reaching all of Azgaar

Dedicated commands cover precise edits. Everything else goes through Azgaar's own code paths: `menu.ts` runs its action list (`MAP_COMMANDS`) and picture exports, `ui.ts` operates its dialogs and fields like a person, `settings.ts` pins generation settings after validating them with its schema. The server collects file downloads (`captureDownload`) into `exports/`.

## Adding a command

Add an entry to the command registry in `overlay/agent/commands/` (name, parameter schema, function) and a test. The server discovers it through `FMG_AGENT.describe()`; no server change is needed.

## Configuration

`config/fmg-mcp.json` (port, browser, window size, folders, history, limits, `allowEval`). Environment overrides: `FMG_HEADLESS`, `FMG_EXECUTABLE_PATH`, `FMG_PORT`, `FMG_MAPS_DIR`, `FMG_PROFILE_DIR`, `FMG_ALLOW_EVAL`, `FMG_TEXT_ONLY`, `FMG_CONFIG`.
