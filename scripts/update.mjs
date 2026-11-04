// Safely upgrade the checked-in Azgaar copy. A candidate is patched, built and smoke-tested
// before the current version is touched; any failed check leaves the current copy intact.
// npm run update -- [--known-good | --ref TAG_OR_COMMIT | --edge]; default: latest release.
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { distIndex, knownGood, latestRelease, prepare, root, run, vendorDir } from "./azgaar.mjs";
import { isSupportedNode, unsupportedNodeMessage } from "./node-version.mjs";

const args = process.argv.slice(2);
const usage = "Usage: npm run update -- [--known-good | --ref TAG_OR_COMMIT | --edge]";
if (!isSupportedNode()) { console.error(unsupportedNodeMessage()); process.exit(1); }
if (args.length > 2 || (args.length === 2 && args[0] !== "--ref") ||
    (args.length === 1 && !["--known-good", "--edge"].includes(args[0]))) {
  console.error(usage);
  process.exit(1);
}

// Candidate and backup live alongside the vendor checkout for atomic renames, even on Windows.
const candidate = join(root, "vendor", `.azgaar-candidate-${process.pid}`);
const backup = join(root, "vendor", `.azgaar-previous-${process.pid}`);
const failed = join(root, "vendor", `.azgaar-failed-${process.pid}`);
let backedUp = false;
try {
  if (existsSync(candidate) || existsSync(backup) || existsSync(failed)) throw new Error("A temporary update folder exists. Remove it only after checking no other update is running.");
  let ref;
  let label;
  if (args.includes("--known-good")) ({ ref, label } = knownGood());
  else if (args.includes("--edge")) [ref, label] = ["master", "Azgaar development branch"];
  else if (args[0] === "--ref" && args[1]) [ref, label] = [args[1], `Azgaar ${args[1]}`];
  else { ref = await latestRelease(); label = `Azgaar ${ref}`; }

  const marker = join(vendorDir, ".upstream-commit");
  const current = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "none";
  if (current === ref && existsSync(distIndex(vendorDir))) {
    console.log(`Already running ${label} (${ref}). Nothing to do.`);
    process.exit(0);
  }
  console.log(`Current: ${current}; preparing ${label} (${ref}) without touching the current map ...`);
  await prepare(ref, candidate);
  const test = run(process.execPath, [join(root, "scripts", "compat.mjs"), candidate], root);
  if (test.status !== 0) throw new Error("The candidate failed its real-browser compatibility check.");

  if (existsSync(vendorDir)) { renameSync(vendorDir, backup); backedUp = true; }
  renameSync(candidate, vendorDir);
  if (backedUp) { rmSync(backup, { recursive: true, force: true }); backedUp = false; }
  console.log(`\nUpdated to ${label}. Review and commit the vendor changes after npm run check.`);
} catch (err) {
  if (backedUp && existsSync(backup)) {
    if (existsSync(vendorDir)) renameSync(vendorDir, failed);
    renameSync(backup, vendorDir);
  }
  rmSync(candidate, { recursive: true, force: true });
  rmSync(failed, { recursive: true, force: true });
  console.error(`\nNot updated: ${err instanceof Error ? err.message : err}`);
  console.error("The previous Azgaar remains available. Do not accept an incompatible release as known-good.");
  process.exit(1);
}
