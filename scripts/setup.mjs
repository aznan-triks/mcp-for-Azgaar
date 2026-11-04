// `npm run setup` (also run by install.bat / install.sh): one command that makes everything work.
//   1. downloads the Azgaar version this bridge is tested with  2. adds the bridge (overlay/)  3. builds it
//   4. connects it to Claude Desktop (if installed)  5. runs a self-test
// Options: --force (redo even if already installed), --no-register (do not touch Claude Desktop), --no-doctor
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { desktopConfigPath } from "./register.mjs";
import { applyPatches, distIndex, download, incompatible, install, knownGood, root, run, vendorDir } from "./azgaar.mjs";
import { isSupportedNode, unsupportedNodeMessage } from "./node-version.mjs";

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const step = (n, text) => console.log(`\n[${n}/4] ${text}`);
const marker = join(vendorDir, ".upstream-commit");
const installedRef = () => (existsSync(marker) ? readFileSync(marker, "utf8").trim() : null);

/** overlay/ is the published form of the bridge, the guarded upstream patches and the fonts; azgaar.mjs expects the layout of a vendor checkout. */
function assembleOverlay(dest) {
  const overlay = join(root, "overlay");
  for (const [from, to] of [
    [join(overlay, "agent"), join(dest, "src", "agent")],
    [join(overlay, "azgaar", "src"), join(dest, "src")],
    [join(overlay, "fonts"), join(dest, "public", "fonts")]
  ]) {
    if (!existsSync(from)) throw new Error(`${from} is missing: this copy of the project is incomplete, download it again.`);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
  }
}

if (!isSupportedNode()) {
  console.error(`\n${unsupportedNodeMessage()}`);
  process.exit(1);
}

try {
  step(1, "Getting Azgaar's Fantasy Map Generator and adding the AI bridge (a few minutes the first time) ...");
  const good = knownGood();
  if (existsSync(distIndex(vendorDir)) && installedRef() === good.ref && !flag("--force")) console.log(`Already installed (${good.label}). Use --force to redo it.`);
  else {
    // Build next to the current copy and swap only when it works: a failed run never destroys a working install.
    const candidate = join(dirname(vendorDir), ".azgaar-setup");
    const overlay = mkdtempSync(join(tmpdir(), "fmg-overlay-"));
    rmSync(candidate, { recursive: true, force: true });
    try {
      assembleOverlay(overlay);
      await download(good.ref, candidate);
      const results = applyPatches(candidate, overlay);
      for (const r of results) console.log(`  ${r.status === "missing" ? "FAIL" : "ok  "}  ${r.id} (${r.status})`);
      const broken = incompatible(results);
      if (broken.length) throw new Error(`Azgaar is incompatible: ${broken.map(r => r.id).join("; ")}`);
      writeFileSync(join(candidate, ".upstream-commit"), `${good.ref}\n`);
      install(candidate);
      rmSync(vendorDir, { recursive: true, force: true });
      renameSync(candidate, vendorDir);
    } finally {
      rmSync(overlay, { recursive: true, force: true });
      rmSync(candidate, { recursive: true, force: true });
    }
  }

  step(2, "Connecting to Claude Desktop ...");
  const desktop = desktopConfigPath();
  if (flag("--no-register")) console.log("Skipped (--no-register).");
  else if (!existsSync(dirname(desktop))) console.log("Claude Desktop does not seem to be installed here: skipped. (For Claude Code, see the README.)");
  else run(process.execPath, [join(root, "scripts", "register.mjs"), "--desktop"], root);

  step(3, "Self-test (opens a hidden browser, makes a map, checks that the bridge answers) ...");
  if (flag("--no-doctor")) console.log("Skipped (--no-doctor).");
  else {
    const doctor = run(process.execPath, [join(root, "scripts", "doctor.mjs")], root);
    if (doctor.status !== 0) {
      console.error("\nThe self-test found a problem: read the lines marked FAIL above, they say what to do.");
      process.exit(1);
    }
  }

  step(4, "Done.");
  console.log("\nNext: completely close and reopen Claude Desktop, then ask Claude: \"Show me the map\".");
  console.log("Keep Azgaar up to date any time with:  npm run update");
} catch (err) {
  console.error(`\nSetup stopped: ${err instanceof Error ? err.message : err}`);
  console.error("Nothing else was changed. Fix the problem above and run the setup again (it is safe to repeat).");
  process.exit(1);
}
