#!/usr/bin/env node
/**
 * Full (or capped) Congress.gov bill ingest → Supabase `processed_votes`.
 *
 * Usage:
 *   node scripts/sync-all-bills.js
 *   node scripts/sync-all-bills.js --max=50
 *   node scripts/sync-all-bills.js --congress=119 --offset=0
 *   node scripts/sync-all-bills.js --max=20 --force
 *   node scripts/sync-all-bills.js --delay-ms=1000
 *
 * Loads keys from .env.local / .env.
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filename) {
  const full = path.join(process.cwd(), filename);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

async function main() {
  const missing = [];
  if (!process.env.CONGRESS_API_KEY && !process.env.API_KEY) {
    missing.push("CONGRESS_API_KEY (or API_KEY)");
  }
  if (
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.CLAUDE_API_KEY &&
    !process.env.OPENAI_API_KEY
  ) {
    missing.push("ANTHROPIC_API_KEY (or OPENAI_API_KEY)");
  }
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length) {
    console.error("Missing required secrets in .env.local:");
    for (const key of missing) console.error(`  - ${key}`);
    console.error("\nRe-run: node scripts/sync-all-bills.js");
    process.exit(1);
  }

  const { syncAllBills, DEFAULT_CONGRESS } = require("../lib/sync-bills");
  const congress = Number(getArg("congress", DEFAULT_CONGRESS)) || DEFAULT_CONGRESS;
  const offset = Math.max(0, Number(getArg("offset", 0)) || 0);
  const delayMs = Math.max(0, Number(getArg("delay-ms", 1000)) || 0);
  const force =
    args.includes("--force") ||
    String(getArg("force", "0")).toLowerCase() === "1" ||
    String(getArg("force", "0")).toLowerCase() === "true";
  const maxRaw = getArg("max", "");
  const max =
    maxRaw === "" || maxRaw == null
      ? undefined
      : Math.max(1, Number(maxRaw) || 1);

  console.log(
    `Syncing Congress ${congress} bills → processed_votes (delay=${delayMs}ms${
      max ? `, max=${max}` : ""
    }${force ? ", force" : ""})…`
  );

  const result = await syncAllBills({
    congress,
    max,
    offset,
    delayMs,
    force,
    log: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
