# Questions

**Does the AI get a shell on my machine?**
No. It talks to the MCP tools; the tools call one bridge object inside a Chromium window (`window.FMG_AGENT`). There is no shell tool and no file tool except the two named ones (`map_file` for `.map` files, `map_export` for the export folder). `map_eval`, which does run JavaScript in the page, is off until you switch `allowEval` on.

**Can I lose a map?**
The map you were editing is autosaved to `maps/autosave.map` after every edit, every `autosave.intervalSec` and on shutdown, and reloaded at start. `map_undo` writes `maps/rescue-before-undo.map` first, so edits you made by hand in the window between two AI calls survive an undo; the two checkpoints before it stay as `rescue-before-undo-1.map` and `rescue-before-undo-2.map`, so undoing twice in a row does not erase them. `createSubmap` additionally saves `maps/pre-submap.map` before resampling. The one thing that is not undoable is deleting the folder.

**Why is the vendored copy of Azgaar frozen?**
The bridge calls Azgaar's internals, so it is pinned to one version (v1.154.1, `known-good.json`) and the patches are guarded by their exact digests. `npm run update` tests a newer release end to end in a browser and keeps the current one if anything fails — including a renderer that changed under a local patch, which stops the update rather than being overwritten.

**Is this the same thing as `mcp-for-Azgaar`?**
Same project, two repositories: this one is the workshop (full history, plans, internal notes, vendored engine), the other is the clean publication. `npm run prepare-public` assembles the bundle the publishing account pushes; the two histories are never merged, and nothing is ever pushed to the public account from here.

**Why does the map look different from what I asked?**
Usually a layer is off, or the camera was still zoomed. Ask for `map_view {"whole_map": true, "grid": true}`: the graticule is labelled in map units, so the numbers in a request and the picture line up.

**Can I script it myself?**
Yes, that is the design: any new action is a new entry in the bridge's command registry (schema + function), and the server discovers it through `map_commands` without a line of transport code being written. The 24 export formats and the layer presets are tables, not branches.

**What is measured about "100 % offline"?**
`npm run compat` opens a real browser, generates a map and fails if a single request tries to leave the machine; `npm run check` runs it as part of the suite. The CI job runs the same suite on a runner with no credentials.

**Does a passing scanner run mean the project is safe?**
No. The HOL scan is a static, community-scale review of a published bundle: it catches hardcoded secrets, unpinned actions, missing policy files and dynamic-execution patterns. It cannot see that `allowEval` defaults to false or that a vendored engine is pinned. The findings and their status are in [SECURITY.md](SECURITY.md); read them instead of the badge.

**Can two people or two agents use one server?**
One server, one browser window, one exclusive request queue: calls are serialised, so two clients on one server take turns rather than corrupting each other. That is still a fight over one map — run a second server with its own `FMG_PORT`, `FMG_MAPS_DIR` and `FMG_PROFILE_DIR`.

```bash
FMG_PORT=8766 FMG_MAPS_DIR=$HOME/maps-b FMG_PROFILE_DIR=$HOME/profile-b npm start
```

**Which Node?**
22.18 or newer; 24 and 25 are what the project is verified with. On an older Node the server refuses to start with a clear message rather than failing inside TypeScript.
