#!/usr/bin/env node
/**
 * notify-discord.js  (ESM — compatible with "type": "module" in package.json)
 * Called by GitHub Actions on build success or failure.
 *
 * Usage:
 *   node scripts/notify-discord.js \
 *     --log build.log \
 *     --status fail \
 *     --tag v1.2.3 \
 *     --commit abc1234 \
 *     --run-url https://github.com/…/actions/runs/123
 *
 * Env:
 *   DISCORD_WEBHOOK_URL  — required
 */

import fs    from "node:fs";
import https from "node:https";
import { URL } from "node:url";

// ── Parse CLI args ─────────────────────────────────────────────────────────
function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const logFile    = arg("log")     || "build.log";
const status     = arg("status")  || "fail";
const tag        = arg("tag")     || process.env.TAG     || "unknown";
const commit     = arg("commit")  || process.env.COMMIT  || "unknown";
const runUrl     = arg("run-url") || process.env.RUN_URL || "";
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!webhookUrl) {
  console.error("[notify-discord] DISCORD_WEBHOOK_URL is not set — skipping.");
  process.exit(0); // non-fatal
}

// ── Extract meaningful error lines from build.log ──────────────────────────
function extractErrors(logPath) {
  if (!fs.existsSync(logPath)) return ["(build.log not found)"];

  const lines = fs.readFileSync(logPath, "utf8").split("\n");

  const errorLines = lines.filter((l) =>
    /error(\[E\d+\])?:/i.test(l) ||
    /^error\s/i.test(l)          ||
    /panic!/i.test(l)            ||
    /\bFAILED\b/.test(l)         ||
    /Cannot find module/i.test(l)||
    /TS\d{4}:/i.test(l)
  );

  const source = errorLines.length > 0
    ? errorLines
    : lines.filter(Boolean).slice(-30); // fallback: last 30 lines

  // Deduplicate
  const seen = new Set();
  return source
    .filter((l) => { const t = l.trim(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, 20);
}

const errorLines   = extractErrors(logFile);
const shortCommit  = commit.slice(0, 7);
const isSuccess    = status === "success";

// ── Build Discord embed ────────────────────────────────────────────────────
const fields = [
  { name: "Commit",  value: `\`${shortCommit}\``, inline: true },
  { name: "Version", value: `\`${tag}\``,         inline: true },
  ...(runUrl ? [{ name: "Workflow", value: `[Voir les logs](${runUrl})`, inline: true }] : []),
];

if (!isSuccess && errorLines.length > 0) {
  let snippet = errorLines.join("\n");
  // Discord field value limit is 1024 chars; embed total limit is 6000
  if (snippet.length > 900) snippet = snippet.slice(0, 897) + "…";
  fields.push({
    name:   "🔍 Erreurs détectées",
    value:  `\`\`\`\n${snippet}\n\`\`\``,
    inline: false,
  });
}

const embed = {
  title:     isSuccess ? `✅ Build réussi — ${tag}` : `❌ Build échoué — ${tag}`,
  color:     isSuccess ? 0x23a559 : 0xda373c,
  fields,
  footer:    { text: "ProStatClub CI · GitHub Actions" },
  timestamp: new Date().toISOString(),
};

const payload = JSON.stringify({ embeds: [embed] });

// Guard: Discord total payload must be < 8 MB and content < 6000 chars
if (payload.length > 5800) {
  // Remove error snippet if over-limit and retry
  fields.pop();
  fields.push({ name: "🔍 Erreurs", value: "*(trop long — télécharge l'artifact build.log)*", inline: false });
}

const finalPayload = JSON.stringify({ embeds: [embed] });

// ── Send via native https (zero dependencies) ──────────────────────────────
const parsed  = new URL(webhookUrl);
const options = {
  hostname: parsed.hostname,
  path:     parsed.pathname + parsed.search,
  method:   "POST",
  headers:  {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(finalPayload),
    "User-Agent":     "ProStatClub-CI/1.0",
  },
};

console.log(`[notify-discord] status=${status}  tag=${tag}  commit=${shortCommit}  payload=${finalPayload.length}B`);

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    console.log(`[notify-discord] Discord API → HTTP ${res.statusCode}`);
    if (body) console.log(`[notify-discord] Response body: ${body}`);

    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log("[notify-discord] ✅ Notification envoyée.");
      return;
    }
    // Diagnostic hints
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.error("[notify-discord] ⚠️  Webhook invalide ou révoqué (401/403). Régénère-le dans Discord et mets à jour le secret DISCORD_WEBHOOK_URL.");
    } else if (res.statusCode === 400) {
      console.error("[notify-discord] ⚠️  Payload rejeté (400 Bad Request). Vérifie la structure de l'embed ci-dessus.");
    } else {
      console.error(`[notify-discord] ⚠️  Réponse inattendue : ${res.statusCode}.`);
    }
    // Always exit 0 — notification failure must not fail CI
    process.exit(0);
  });
});

req.on("error", (err) => {
  console.error(`[notify-discord] Network error: ${err.message}`);
  process.exit(0); // non-fatal
});

req.write(finalPayload);
req.end();
