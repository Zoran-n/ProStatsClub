#!/usr/bin/env node
/**
 * npm run release [-- patch|minor|major]
 *
 * 1. Bumps version in package.json
 * 2. Syncs src-tauri/tauri.conf.json
 * 3. Syncs src-tauri/Cargo.toml (first version = line)
 * 4. git commit + git tag + git push --follow-tags
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), "utf8"));
}
function writeJson(rel, obj) {
  writeFileSync(resolve(ROOT, rel), JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// ── Determine bump type ────────────────────────────────────────────────────
const bump = (process.argv[2] ?? "patch").toLowerCase();
if (!["patch", "minor", "major"].includes(bump)) {
  console.error(`❌  Type invalide : "${bump}". Utilise patch, minor ou major.`);
  process.exit(1);
}

// ── Read current version from package.json ────────────────────────────────
const pkg = readJson("package.json");
const [maj, min, pat] = pkg.version.split(".").map(Number);

let newVersion;
if (bump === "major") newVersion = `${maj + 1}.0.0`;
else if (bump === "minor") newVersion = `${maj}.${min + 1}.0`;
else newVersion = `${maj}.${min}.${pat + 1}`;

const newTag = `v${newVersion}`;

// ── Check tag doesn't already exist locally ───────────────────────────────
try {
  execSync(`git rev-parse ${newTag}`, { stdio: "pipe" });
  // If we reach here the tag exists
  console.error(`❌  Le tag ${newTag} existe déjà. Abort.`);
  process.exit(1);
} catch {
  // tag doesn't exist — good
}

console.log(`\n🔢  ${pkg.version}  →  ${newVersion}  (${bump})\n`);

// ── Update package.json ───────────────────────────────────────────────────
pkg.version = newVersion;
writeJson("package.json", pkg);
console.log("  ✅  package.json mis à jour");

// ── Update tauri.conf.json ────────────────────────────────────────────────
const tauriConf = readJson("src-tauri/tauri.conf.json");
tauriConf.version = newVersion;
writeJson("src-tauri/tauri.conf.json", tauriConf);
console.log("  ✅  src-tauri/tauri.conf.json mis à jour");

// ── Update Cargo.toml (first `version = "…"` line only) ──────────────────
const cargoPath = resolve(ROOT, "src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const updatedCargo = cargo.replace(/^version = ".*"/m, `version = "${newVersion}"`);
writeFileSync(cargoPath, updatedCargo, "utf8");
console.log("  ✅  src-tauri/Cargo.toml mis à jour");

// ── git commit + tag + push ───────────────────────────────────────────────
const run = (cmd) => execSync(cmd, { stdio: "inherit", cwd: ROOT });

run(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
run(`git commit -m "chore: release ${newTag}"`);
run(`git tag ${newTag}`);
run(`git push --follow-tags`);

console.log(`\n🚀  Release ${newTag} poussée — le workflow GitHub Actions va démarrer.\n`);
