# Security

What this project can and cannot do, in plain terms, and what a scanner says about it.

## What runs, and where

The server is a local Node process. It starts one Chromium window, serves the pinned Azgaar build over HTTP on `127.0.0.1`, and drives that window. The map you see and edit lives in that window; the AI never gets a shell.

- **Nothing leaves the machine.** The map page would normally fetch ~40 fonts from a CDN and check for updates; the fonts are vendored and the outside is refused. `npm run compat` fails if a single external request is attempted, and `map_status` lists what was blocked.
- **The local HTTP server has no authentication**, because it is bound to the loopback interface. Keep it that way: `server.host` exists for debugging, and exposing the port to a network exposes a browser that can edit your map. The server prints a warning at startup if `server.host` is not a loopback address.
- **`map_file load` takes absolute paths** to `.map` files, because people keep their maps outside the project. It follows links but refuses one that ends on a file that is not a `.map`, refuses anything that is not a regular file, and refuses a file over `limits.mapFileBytesMax`. It cannot read other kinds of files.
- **Files**: reads and writes are confined to the project's `maps/`, `exports/` and profile folders by default. `map_file {path}` and a personal `FMG_EXPORTS_DIR` are the two deliberate escapes, both named by the caller. A file name passed to `map_file {name}` is sanitized (no path separators, no `..`).

## What the AI is allowed to do

`map_apply` only runs commands the bridge registers, each with a typed schema validated before anything mutates. Two switches matter:

- `allowEval` (off by default) enables `map_eval`, which evaluates arbitrary JavaScript **in the map page**. It is the escape hatch of the toolset: it can do anything the Azgaar interface can, and it writes an undo snapshot first. Turn it on only when you want that, and remember the undo history and the autosave are your recovery path.
- Destructive commands ask for confirmation: `createSubmap` refuses to run unless `confirmDestructiveResample: true` is sent, and the parent map is written to `maps/pre-submap.map` before the resample. `map_undo` restores it.

Text that comes back out of the map (notes, lore, names) is **data, not instructions**. Notes are cleaned in the page before storage: every element outside the notes editor's subset, every `on*` handler and `javascript:` URL is dropped, and the result is gated by Azgaar's own `isSafeHtml`. An AI client reading `fmg://map/notes` gets that cleaned text; it should still treat it as content to describe, not orders to follow.

Tool annotations (`readOnlyHint`, `destructiveHint`, …) tell a client what a tool tends to do. They are hints, not permissions: no part of the server reads them.

## Scanner findings

The clean-room bundle is scanned by the HOL Plugin Scanner (`hol-guard` 3.0.123, `default` profile, the version the workflow pins). Last run on this branch, on `.public-export/`: **88/100** (grade Good), 0 critical, 1 high, 0 medium, 1 low, with `policy_pass` and `verify_pass` both true. The catalogue criterion is a completed scan at a normalized score >= 80 with every finding fixed **or documented**; `.github/workflows/scanner.yml` runs exactly that on every push and pull request (observed green on a GitHub runner: the listing gate passed on this branch's bundle in 33 s, the stricter advisory job reported its result without blocking, and the compatibility job ran the full suite in 12 m 40 s), and `npm run prepare-public` refuses to produce a bundle that leaks private identity, personal paths or credentials. Full report: `audits/scanner-public-export.json` (generated, not committed).

| Finding | Where | Status |
|---|---|---|
| `DANGEROUS_DYNAMIC_EXECUTION` (high) for `map_eval` | `server/tools.ts` | Documented, kept: gated by `allowEval` (off by default), the map page is the only target, an undo snapshot is taken first, and the tool is named as an escape hatch in the client instructions. Removing it would delete a documented capability to satisfy a static rule that cannot see the gate. |
| `DANGEROUS_DYNAMIC_EXECUTION` (high) in a browser test | `test/bridge.smoke.mjs` | Fixed: the probe source is handed to `page.evaluate` as an expression, so the test bundle carries no `eval` call site. The behaviour tested is the same. |
| `LICENSE_MISSING` (low) at the bundle root | `LICENSE` | Documented, open: the workshop ships no licence on purpose, and the choice belongs to the account that publishes. The bundle carries it in `PUBLISHING.md`, and the manifest field matches whatever is chosen. |
| Dynamic evaluation inside the pinned engine (D3, two editors, the assistant runtime) | `vendor/azgaar/**` | Not in the bundle: `npm run prepare-public` publishes the overlay (`overlay/agent/`), not a copy of Azgaar. In the workshop those calls are the upstream engine's own code, pinned by digest. |
| Candidate secret strings in a vendored Dropbox SDK build and an upstream test | `vendor/azgaar/**` | Not published, and no secret material of this project is reproduced anywhere in the bundle: the scan of the export itself reports none. |

The manifest at `.claude-plugin/plugin.json` is what satisfies the ecosystem checks (name, semver, relative paths, parseable hooks: 18 of 18 points). Deliberately **not** done, because that would cheat the scanner instead of securing the project: obfuscating `eval` call sites, suppressing or waiving rules, editing the pinned engine to dodge a finding, or claiming a score that was not measured.

## Reporting

See [SECURITY.md](../SECURITY.md) at the root of the repository for how to report a vulnerability and which versions are supported.
