// Azgaar vendor pipeline. The committed vendor/azgaar/src/agent/ is the canonical bridge;
// updates overlay it, the offline fonts and the local 3D patches on a fresh upstream archive.
// A candidate is never promoted until it has compiled and passed scripts/compat.mjs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const vendorDir = join(root, "vendor", "azgaar");
export const distIndex = dir => join(dir, "dist-electron", "renderer", "index.html");
export const knownGood = () => JSON.parse(readFileSync(join(root, "known-good.json"), "utf8"));
const REPO = "Azgaar/Fantasy-Map-Generator";
const read = file => readFileSync(file, "utf8");
const digest = text => createHash("sha256").update(text).digest("hex");
const slug = family => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const identicalTree = (source, target) => {
  if (!existsSync(source) || !existsSync(target)) return false;
  if (statSync(source).isDirectory() !== statSync(target).isDirectory()) return false;
  if (!statSync(source).isDirectory()) return readFileSync(source).equals(readFileSync(target));
  const names = readdirSync(source).sort();
  const other = readdirSync(target).sort();
  return names.length === other.length && names.every((name, i) => name === other[i] && identicalTree(join(source, name), join(target, name)));
};

export function run(cmd, args, cwd, quiet = false) {
  if (!quiet) console.log(`> ${cmd} ${args.join(" ")}`);
  return spawnSync(cmd, args, { cwd, stdio: quiet ? "pipe" : "inherit", shell: false, encoding: "utf8" });
}

function npmCli() {
  const bin = dirname(process.execPath);
  const candidates = [process.env.npm_execpath, join(bin, "node_modules", "npm", "bin", "npm-cli.js"), join(bin, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")];
  const found = candidates.find(file => file && existsSync(file));
  if (!found) throw new Error("npm was not found next to Node. Run this through npm run update.");
  return found;
}

// Node's fetch does not honour HTTPS_PROXY on every supported Node version. curl is
// available on Windows, macOS and most Linux systems; use it if direct fetch is blocked.
async function downloadFile(url, target) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "map-of-trois" } });
    if (!response.ok) throw new Error(`GitHub responded HTTP ${response.status} for ${url}`);
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    if (!(err instanceof TypeError)) throw err; // an HTTP error must not be mistaken for a proxy issue
    const work = dirname(target);
    const result = run("curl", ["-fLsS", "--retry", "2", "-A", "map-of-trois", url, "-o", target], work, true);
    const curlProblem = result.error?.code === "ENOENT" ? "curl is not installed" : result.stderr || result.error;
    if (result.status !== 0) throw new Error(`Could not download from GitHub (fetch: ${err.message}; curl: ${curlProblem}). Check your network or proxy, or install curl.`);
  }
}

export async function latestRelease() {
  const work = mkdtempSync(join(tmpdir(), "fmg-azgaar-release-"));
  try {
    const file = join(work, "release.json");
    await downloadFile(`https://api.github.com/repos/${REPO}/releases/latest`, file);
    const tag = JSON.parse(read(file)).tag_name;
    if (typeof tag !== "string") throw new Error("The release has no tag.");
    return tag;
  } finally { rmSync(work, { recursive: true, force: true }); }
}

/** Download into an empty candidate directory. Only GitHub references, never URLs or tar options. */
export async function download(ref, dest) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(ref)) throw new Error(`Invalid Azgaar ref: ${ref}`);
  if (existsSync(dest)) throw new Error(`The candidate directory is not empty: ${dest}`);
  console.log(`Downloading Azgaar ${ref} ...`);
  const work = mkdtempSync(join(tmpdir(), "fmg-azgaar-download-"));
  try {
    await downloadFile(`https://codeload.github.com/${REPO}/tar.gz/${ref}`, join(work, "archive.tar.gz"));
    mkdirSync(dest, { recursive: true });
    const winTar = join(process.env.SystemRoot ?? "C:/Windows", "System32", "tar.exe");
    const tar = run(process.platform === "win32" && existsSync(winTar) ? winTar : "tar", ["-xzf", "archive.tar.gz", "-C", dest, "--strip-components=1"], work, true);
    if (tar.status !== 0) throw new Error(`Could not unpack Azgaar: ${tar.stderr || tar.error}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Keep the same lean vendored layout (including Azgaar's licence) as the original checkout.
function prune(dir) {
  for (const path of [".git", ".github", ".docker", ".claude", ".serena", "AGENTS.md", "CLAUDE.md", "tests", join("docs", "updates")])
    rmSync(join(dir, path), { recursive: true, force: true });
}

const exportsNeeded = {
  "controllers/states-editor.ts": ["mergeStates"],
  "controllers/heightmap-editor.ts": ["restoreRiskedData"],
  "controllers/provinces-editor.ts": ["collectStatistics"],
  "controllers/cultures-editor.ts": ["culturesCollectStatistics"],
  "controllers/religions-editor.ts": ["religionsCollectStatistics"]
};
// These upstream files are guarded by their exact v1.154.1 digests. Never
// overwrite a changed future 3D renderer, schema, controller or satellite
// texture pipeline: stop the update and port the patch first.
const upstream3d = {
  "renderers/view-3d-renderer.ts": "bd51deaf23875296bc6d1b8484f0ac347dbf47a1d6495b5792a0610bdcc46e71",
  "renderers/draw-satellite-texture.ts": "10055308b8b1efb168d7dc6fefdb448e0f1fbd1c4d821304078dddf64c8550b3",
  "data/view-3d-options.ts": "a20d399527303e675df00e33793d08a893f37a2326c90d0da6a41503861246aa",
  "components/options-schema.ts": "8a40ffee530615dc0485c1e122307000d17f59ab60e601178ef2f7c34d656bed",
  "controllers/view-3d.ts": "43dfeb55e49f910c423fa664fa22628b0b1696d7e756c1d3c124d061f4599df4"
};

/** Idempotently overlay local changes; a missing REQUIRED patch rejects the candidate. */
export function applyPatches(dir, source = vendorDir) {
  const results = [];
  const note = (id, status, required = true) => results.push({ id, status, required });
  const src = join(dir, "src");
  if (!existsSync(join(src, "main.ts")) || !existsSync(join(source, "src", "agent", "index.ts")))
    throw new Error("The Azgaar source or the tracked bridge is missing.");
  prune(dir);

  for (const [rel, expected] of Object.entries(upstream3d)) {
    const target = join(src, rel);
    const local = join(source, "src", rel);
    if (!existsSync(target) || !existsSync(local)) { note(`3D patch: ${rel}`, "missing"); continue; }
    const original = read(target);
    const patched = read(local);
    if (original === patched) note(`3D patch: ${rel}`, "already");
    else if (digest(original) === expected) { writeFileSync(target, patched); note(`3D patch: ${rel}`, "applied"); }
    else note(`3D patch: ${rel} (upstream changed; port the local patch before upgrading)`, "missing");
  }

  const bridge = join(src, "agent");
  const localBridge = join(source, "src", "agent");
  if (identicalTree(localBridge, bridge)) note("bridge", "already");
  else { cpSync(localBridge, bridge, { recursive: true }); note("bridge", "applied"); }
  const localFonts = join(source, "public", "fonts");
  const fontsDir = join(dir, "public", "fonts");
  if (!existsSync(localFonts)) note("offline font files and licences", "missing");
  else if (identicalTree(localFonts, fontsDir)) note("offline font files and licences", "already");
  else { cpSync(localFonts, fontsDir, { recursive: true }); note("offline font files and licences", "applied"); }

  const main = join(src, "main.ts");
  const mainText = read(main);
  if (/import\s+["']@\/agent["']/.test(mainText)) note("load bridge in main.ts", "already");
  else {
    const imports = [...mainText.matchAll(/^import\s.+;[ \t]*$/gm)];
    if (!imports.length) note("load bridge in main.ts", "missing");
    else {
      const last = imports.at(-1);
      const at = last.index + last[0].length;
      writeFileSync(main, `${mainText.slice(0, at)}\nimport "@/agent";${mainText.slice(at)}`);
      note("load bridge in main.ts", "applied");
    }
  }

  for (const [rel, names] of Object.entries(exportsNeeded)) {
    const file = join(src, rel);
    for (const name of names) {
      if (!existsSync(file)) { note(`export ${name}`, "missing"); continue; }
      const body = read(file);
      const declaration = new RegExp(`^((?:async\\s+)?function\\s+${name}\\s*[(<])`, "m");
      const exported = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\s*[(<]`, "m");
      if (exported.test(body)) note(`export ${name}`, "already");
      else if (declaration.test(body)) { writeFileSync(file, body.replace(declaration, "export $1")); note(`export ${name}`, "applied"); }
      else note(`export ${name}`, "missing");
    }
  }

  // Newer Azgaar moved adjustProvinces from the editor to a typed method on States.
  const statesGen = join(src, "generators", "states-generator.ts");
  if (!existsSync(statesGen)) note("expose States.adjustProvinces", "missing");
  else {
    const body = read(statesGen);
    if (/\bprivate\s+adjustProvinces\s*\(/.test(body)) {
      writeFileSync(statesGen, body.replace(/\bprivate\s+adjustProvinces\s*\(/, "adjustProvinces("));
      note("expose States.adjustProvinces", "applied");
    } else note("expose States.adjustProvinces", /^\s+adjustProvinces\s*\(/m.test(body) ? "already" : "missing");
  }

  const statesEditor = join(src, "controllers", "states-editor.ts");
  if (existsSync(statesEditor)) {
    const body = read(statesEditor);
    const refresh = body.match(/function refreshStatesEditor\(\)[^{]*\{[^}]*\}/);
    if (refresh && /if \(document\.getElementById\("statesFooter"\)\) statesTable\.refresh\(\);/.test(refresh[0]))
      note("refresh state editor only when open", "already");
    else if (refresh && /statesTable\.refresh\(\);/.test(refresh[0])) {
      writeFileSync(statesEditor, body.replace(refresh[0], refresh[0].replace("statesTable.refresh();", 'if (document.getElementById("statesFooter")) statesTable.refresh();')));
      note("refresh state editor only when open", "applied");
    } else note("refresh state editor only when open", "missing");
  } else note("refresh state editor only when open", "missing");

  const religions = join(src, "generators", "religions-generator.ts");
  if (existsSync(religions)) {
    const body = read(religions);
    const unsafe = /\bdeity\.split\((\/[^)]*\/)\)\[0\]/;
    if (unsafe.test(body)) { writeFileSync(religions, body.replace(unsafe, 'deity?.split($1)[0] ?? ""')); note("null-safe religion name", "applied"); }
    else note("null-safe religion name", /deity\?\.split\(/.test(body) ? "already" : "missing");
  } else note("null-safe religion name", "missing");

  const fontsFile = join(src, "services", "fonts.ts");
  if (!existsSync(fontsFile)) note("offline font URLs", "missing");
  else {
    // An upstream font may use another family's file (Tapestry uses Macondo).
    // Follow the existing vendor mapping rather than guessing from the display name.
    const mapping = new Map([...read(join(source, "src", "services", "fonts.ts"))
      .matchAll(/family:\s*"([^"]+)",\s*src:\s*"url\(\.\/fonts\/([^)]+\.woff2)\)"/g)]
      .map(match => [match[1], match[2]]));
    let count = 0;
    const body = read(fontsFile).replace(/(family:\s*"([^"]+)",\s*src:\s*)"url\(https:\/\/fonts\.gstatic\.com[^)]+\)"/g, (all, head, family) => {
      const file = mapping.get(family) ?? `${slug(family)}.woff2`;
      if (!existsSync(join(fontsDir, file))) return all;
      count++;
      return `${head}"url(./fonts/${file})"`;
    });
    if (count) writeFileSync(fontsFile, body);
    const localCount = [...body.matchAll(/url\(\.\/fonts\/[^)]+\.woff2\)/g)].length;
    const remote = body.includes("fonts.gstatic.com");
    note(`offline font URLs (${localCount} local, ${count} rewritten)`, localCount >= 40 && !remote ? (count ? "applied" : "already") : "missing");
  }
  return results;
}

export const incompatible = results => results.filter(r => r.required && r.status === "missing");

export function install(dir) {
  const npm = npmCli();
  for (const [name, cli, args] of [
    ["dependencies", npm, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]],
    ["types", join(dir, "node_modules", "typescript", "bin", "tsc"), ["--noEmit"]],
    ["bridge lint", join(dir, "node_modules", "@biomejs", "biome", "bin", "biome"), ["check", "src/agent", "src/main.ts"]],
    ["build", join(dir, "node_modules", "vite", "bin", "vite.js"), ["build", "--mode", "electron"]]
  ]) {
    const r = run(process.execPath, [cli, ...args], dir);
    if (r.status !== 0) throw new Error(`Azgaar ${name} failed (see the messages above).`);
  }
  if (!existsSync(distIndex(dir))) throw new Error("The Azgaar build has no renderer/index.html.");
}

/** Download, overlay, typecheck and build next to the still-working vendor checkout. */
export async function prepare(ref, dest) {
  await download(ref, dest);
  const results = applyPatches(dest);
  for (const r of results) console.log(`  ${r.status === "missing" ? "FAIL" : "ok  "}  ${r.id} (${r.status})`);
  const broken = incompatible(results);
  if (broken.length) throw new Error(`Azgaar is incompatible: ${broken.map(r => r.id).join("; ")}`);
  writeFileSync(join(dest, ".upstream-commit"), `${ref}\n`);
  install(dest);
}
