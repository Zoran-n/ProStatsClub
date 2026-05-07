#!/usr/bin/env node
/**
 * npm run bump
 * Increments the patch version in package.json, tauri.conf.json, and Cargo.toml.
 * No git operations — used by CI before build.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), "utf8"));
}
function writeJson(rel, obj) {
  writeFileSync(resolve(ROOT, rel), JSON.stringify(obj, null, 2) + "\n", "utf8");
}

const bump = (process.argv[2] ?? "patch").toLowerCase();
if (!["patch", "minor", "major"].includes(bump)) {
  process.stderr.write(`Invalid bump type: "${bump}". Use patch, minor or major.\n`);
  process.exit(1);
}

const pkg = readJson("package.json");
const [maj, min, pat] = pkg.version.split(".").map(Number);
const newVersion =
  bump === "major" ? `${maj + 1}.0.0` :
  bump === "minor" ? `${maj}.${min + 1}.0` :
                    `${maj}.${min}.${pat + 1}`;

pkg.version = newVersion;
writeJson("package.json", pkg);

const tauriConf = readJson("src-tauri/tauri.conf.json");
tauriConf.version = newVersion;
writeJson("src-tauri/tauri.conf.json", tauriConf);

const cargoPath = resolve(ROOT, "src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
writeFileSync(cargoPath, cargo.replace(/^version = ".*"/m, `version = "${newVersion}"`), "utf8");

// Print the new version for shell capture: NEW_VERSION=$(node scripts/bump-version.js)
process.stdout.write(newVersion);
