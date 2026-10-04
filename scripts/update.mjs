// `npm run update`: moves to a newer Azgaar without risk.
// The new version is downloaded, patched, built and tested next to the current one; only if the compatibility check
// passes does it replace the current one. Otherwise the current Azgaar is left untouched and the reason is printed.
//   (default)   latest official Azgaar release        --edge   newest development version       --ref X   a tag, branch or commit
//   --known-good   go back to the version this project was tested with
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { knownGood, latestRelease, prepare, readState, root, run, upstreamDir, writeState } from "./azgaar.mjs";
import { isSupportedNode, unsupportedNodeMessage } from "./node-version.mjs";

const args = process.argv.slice(2);
const opt = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

if (!isSupportedNode()) {
  console.error(unsupportedNodeMessage());
  process.exit(1);
}

const fresh = `${upstreamDir}.new`;
const previous = `${upstreamDir}.prev`;
try {
  let ref;
  let label;
  if (args.includes("--known-good")) ({ ref, label } = knownGood());
  else if (args.includes("--edge")) [ref, label] = ["master", "Azgaar development version"];
  else if (opt("--ref")) [ref, label] = [opt("--ref"), `Azgaar ${opt("--ref")}`];
  else {
    ref = await latestRelease();
    label = `Azgaar ${ref}`;
  }
  const current = readState();
  if (current && current.ref === ref) {
    console.log(`Already on ${label}. Nothing to do.`);
    process.exit(0);
  }
  console.log(`Current: ${current?.label ?? "none"}   ->   Trying: ${label}\n`);

  rmSync(fresh, { recursive: true, force: true });
  await prepare(ref, fresh);

  console.log("\nTesting the new version with the bridge ...");
  const test = run(process.execPath, [join(root, "scripts", "compat.mjs"), fresh], root);
  if (test.status !== 0) throw new Error("The new Azgaar did not pass the compatibility check.");

  rmSync(previous, { recursive: true, force: true });
  if (existsSync(upstreamDir)) renameSync(upstreamDir, previous);
  renameSync(fresh, upstreamDir);
  writeState(upstreamDir, ref, label);
  rmSync(previous, { recursive: true, force: true });
  console.log(`\nUpdated to ${label}. Restart your AI client (Claude) to use it.`);
} catch (err) {
  rmSync(fresh, { recursive: true, force: true });
  if (existsSync(previous) && !existsSync(upstreamDir)) renameSync(previous, upstreamDir);
  console.error(`\nNot updated: ${err instanceof Error ? err.message : err}`);
  console.error("Your current Azgaar was kept and keeps working. If you think this is a bug in the bridge, open an issue on GitHub and mention the line above.");
  process.exit(1);
}
