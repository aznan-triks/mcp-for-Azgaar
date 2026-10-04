// `npm run setup` (also run by install.bat / install.sh): one command that makes everything work.
//   1. downloads the Azgaar version this bridge is tested with  2. adds the bridge  3. builds it
//   4. connects it to Claude Desktop (if installed)  5. runs a self-test
// Options: --force (redo even if already installed), --no-register (do not touch Claude Desktop), --no-doctor
import { existsSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { join } from "node:path";
import { desktopConfigPath } from "./register.mjs";
import { distIndex, knownGood, prepare, readState, root, run, upstreamDir, writeState } from "./azgaar.mjs";
import { isSupportedNode, unsupportedNodeMessage } from "./node-version.mjs";

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const step = (n, text) => console.log(`\n[${n}/4] ${text}`);

if (!isSupportedNode()) {
  console.error(`\n${unsupportedNodeMessage()}`);
  process.exit(1);
}

try {
  step(1, "Getting Azgaar's Fantasy Map Generator and adding the AI bridge (a few minutes the first time) ...");
  if (existsSync(distIndex) && !flag("--force")) console.log(`Already installed (${readState()?.label ?? "unknown version"}). Use --force to redo it.`);
  else {
    const good = knownGood();
    rmSync(upstreamDir, { recursive: true, force: true });
    await prepare(good.ref, upstreamDir);
    writeState(upstreamDir, good.ref, good.label);
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
