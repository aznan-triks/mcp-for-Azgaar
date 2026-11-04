# Troubleshooting

Start with `npm run doctor`: it checks Node, the Azgaar build, the browser (it launches one and generates a map), the local port and the folders, and prints what to fix. `map_status` then reports page errors and any outside request that was blocked.

## The window never opens, or a tool hangs

```bash
npm run doctor
npm run build:azgaar      # the tests and the server read vendor/azgaar/dist-electron/renderer
```

- The browser opens at the **first tool that needs the map**, not when the AI client starts (`browser.openOnStart`). A `map_status` answer with `browserOpen: false` is normal before any map call.
- `Azgaar is not built: run npm run build:azgaar before the tests` means exactly that: `npm run check` refuses to run against a missing or stale build. Changes in `vendor/azgaar/src` are invisible to every test until you rebuild.
- Two AI clients configured at once start two servers: they collide on port `8765` and on the browser profile. Give the second `FMG_PORT` and `FMG_PROFILE_DIR`, or close the first.
- A Chrome window killed mid-run leaves a profile lock: `SingletonLock`. The server removes a lock whose process is gone and otherwise tells you what to close.

## "Failed to launch browser" or a Chromium that dies

```bash
FMG_TEST_CHROMIUM=/path/to/chromium npm run check
FMG_TEST_ARGS=--no-sandbox npm run check
```

`browser.channel` defaults to `chrome` with a fallback to `msedge`; without either installed, point `browser.executablePath` (or `FMG_EXECUTABLE_PATH`) at a Chromium. In a container or a sandbox, `--no-sandbox` is required. Memory is the other usual cause: a 3D globe with satellite texture, erosion and clouds runs close to 3 GB, and a killed server with no error message is a process the OS stopped — watch `free -m` while a run goes badly. Do not add graphics flags to "fix" WebGL: software rendering already works with `--no-sandbox` alone, and `--use-gl=angle` makes screenshots time out.

## Edits

- **"The map was restored" in the answer** — the mutation broke halfway (a native editor refused it). The rollback is the server's own doing; read the message, fix the parameters and try again.
- **A change you cannot see** — its layer is off: `map_layers {"show": ["relief"]}`. Relief, cultures, religions, provinces and rivers are edits to data first, and the picture only follows when the layer is drawn.
- **`map_undo` says nothing to undo** — the edit changed nothing, and an empty edit deliberately creates no history entry.
- **A cell id seems wrong after a terrain edit** — `scope: "all"` rebuilds and renumbers the grid; your earlier selection ids are invalid. In-place edits (`scope: "land"`, the default) never renumber.
- **Selections vanished** — loading or generating a map drops them, as in Azgaar. Re-create them after the load.

## Views and pictures

- The screenshot shows a corner of the world because the camera was zoomed: the answer carries a `coverageNote`; ask for `whole_map: true` or reset with `map_camera {"scale": 1}`.
- The camera scale you asked for is not the scale you get: the map clamps it so the window never shows beyond the map. The reply says what was applied.
- An image heavier than `view.maxImageBytes` comes back as a smaller JPEG preview; the file in `exports/` is the full one. `inset` previews keep the cartouche when they are shrunk.
- `map_export {"inset": ...}` refuses `supersample`/`filter` and `map_view {"inset": ...}` refuses framing, overlays and text: an inset is its own off-screen render, so the combinations are not offered rather than half-applied.
- A release-notes window covering the map: the server pre-fills the page's local storage with the pinned Azgaar version and the tooltip switch, so it stays off even in a fresh profile. If it appears anyway, `browser.seedStorage` was changed or the pinned `known-good.json` disagrees with `vendor/azgaar/package.json`.

## Network claims

`map_status` must list **zero** blocked outside requests. If one appears, the offline bundle is broken (a font, a tile server, a star field): that is a bug, not your configuration. The only things legitimately online are a Google font you added to the style yourself and a link inside the emblem editor.

## Documentation errors from the test suite

`npm run check` fails with `docs out of date: docs/TOOLS.md` after you changed a tool description or a command schema: the reference is generated from the running server, so run `npm run docs` and commit the result. The same gate runs in CI (`npm run docs:check`).
