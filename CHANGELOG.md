# Changelog

Each entry has two parts: **Plain words** (what it means for you) and **Technical** (what changed and how it is verified).

## 1.0.0

**Plain words:** The first public release. Double-click `install.bat`, restart Claude, and ask it to show you the map. `update.bat` brings the newest Azgaar safely, and keeps your current one if the new one does not work.

**Technical:**
- MCP server (up to 13 tools; the raw-script one is off by default) driving a visible Chrome/Edge window on Azgaar's Fantasy Map Generator; a typed in-page bridge (`window.FMG_AGENT`) with 32 edit commands, 10 selection shapes, screenshots with annotations, undo/redo, autosave and automatic rollback of a failed edit.
- Azgaar is no longer copied into the repository: `npm run setup` downloads the tested version (`known-good.json`), applies the patches by pattern (`scripts/azgaar.mjs`: bridge, six exported internals, two small upstream fixes, offline fonts) and builds it. A patch the bridge needs that cannot be applied marks that Azgaar version as incompatible instead of producing a broken build.
- `npm run update` builds the newest release (or `--edge`, `--ref X`) beside the current one, runs `npm run compat` (seed-independent end-to-end check of the bridge) and swaps only on success; otherwise the current version stays. Verified against the tested version and against Azgaar's development branch on Windows 10 (Node 25, Chrome).
- `npm run doctor` self-test, `npm run register` (Claude Desktop config with backup, Claude Code command), `npm run check` (types, lint, layer and hard-coded-value rules, 19 end-to-end tests with a real MCP client).
- Not verified: macOS and Linux installers (`install.sh`), Microsoft Edge as the only browser.
