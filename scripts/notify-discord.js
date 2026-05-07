#!/usr/bin/env node
/**
 * notify-discord.js
 * Called by GitHub Actions on build failure.
 * Reads build.log, extracts the real error lines, sends a Discord embed.
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

const fs   = require("fs");
const https = require("https");
const url  = require("url");

// ── Parse args ────────────────────────────────────────────────────────────────
function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const logFile  = arg("log")     || "build.log";
const status   = arg("status")  || "fail";
const tag      = arg("tag")     || process.env.TAG      || "unknown";
const commit   = arg("commit")  || process.env.COMMIT   || "unknown";
const runUrl   = arg("run-url") || process.env.RUN_URL  || "";
const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!webhookUrl) {
  console.error("[notify-discord] DISCORD_WEBHOOK_URL is not set — skipping.");
  process.exit(0); // non-fatal: don't break CI
}

// ── Extract meaningful error lines from build.log ─────────────────────────────
function extractErrors(logPath) {
  if (!fs.existsSync(logPath)) return ["(build.log not found)"];

  const lines = fs.readFileSync(logPath, "utf8").split("\n");

  // Collect lines that look like Rust errors, panics, or TS/Vite errors
  const errorLines = lines.filter((l) =>
    /error(\[E\d+\])?:/i.test(l) ||
    /^error\s/i.test(l) ||
    /panic!/i.test(l) ||
    /FAILED/i.test(l) ||
    /Cannot find module/i.test(l) ||
    /TS\d{4}:/i.test(l)
  );

  if (errorLines.length === 0) {
    // Fallback: last 30 lines
    return lines.filter(Boolean).slice(-30);
  }

  // Deduplicate and limit
  const seen = new Set();
  return errorLines
    .filter((l) => { const t = l.trim(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, 20);
}

const errorSnippet = extractErrors(logFile).join("\n");
const shortCommit  = commit.slice(0, 7);
const isSuccess    = status === "success";

// ── Build embed ───────────────────────────────────────────────────────────────
const embed = {
  title: isSuccess
    ? `✅ Build réussi — ${tag}`
    : `❌ Build échoué — ${tag}`,
  color: isSuccess ? 0x23a559 : 0xda373c,
  fields: [
    { name: "Commit",  value: `\`${shortCommit}\``, inline: true },
    { name: "Version", value: `\`${tag}\``,         inline: true },
    ...(runUrl ? [{ name: "Workflow", value: `[Voir les logs](${runUrl})`, inline: true }] : []),
  ],
  footer: { text: "ProStatClub CI · GitHub Actions" },
  timestamp: new Date().toISOString(),
};

if (!isSuccess && errorSnippet) {
  const snippet = errorSnippet.length > 1000
    ? errorSnippet.slice(0, 997) + "…"
    : errorSnippet;
  embed.fields.push({
    name: "🔍 Erreurs détectées",
    value: `\`\`\`\n${snippet}\n\`\`\``,
    inline: false,
  });
}

const payload = JSON.stringify({ embeds: [embed] });

// ── Send via native https (no dependencies needed) ────────────────────────────
const parsed   = url.parse(webhookUrl);
const options  = {
  hostname: parsed.hostname,
  path:     parsed.path,
  method:   "POST",
  headers:  {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "User-Agent":     "ProStatClub-CI/1.0",
  },
};

console.log(`[notify-discord] Sending embed to Discord (status=${status}, tag=${tag}, commit=${shortCommit})`);

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    console.log(`[notify-discord] Discord API response — status: ${res.statusCode}`);
    if (body) console.log(`[notify-discord] Response body: ${body}`);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.error(`[notify-discord] ⚠️  Discord rejected the payload (${res.statusCode}).`);
      if (res.statusCode === 401 || res.statusCode === 403) {
        console.error("[notify-discord] 👉 Webhook URL invalide ou révoquée. Régénère-la dans Discord et mets à jour le secret DISCORD_WEBHOOK_URL.");
      }
      if (res.statusCode === 400) {
        console.error("[notify-discord] 👉 Payload malformé (400 Bad Request). Vérifie la structure de l'embed.");
      }
      // Exit 0 — a notification failure must never fail the CI job
      process.exit(0);
    }
    console.log("[notify-discord] ✅ Notification Discord envoyée.");
  });
});

req.on("error", (err) => {
  console.error(`[notify-discord] Network error: ${err.message}`);
  process.exit(0); // non-fatal
});

req.write(payload);
req.end();
