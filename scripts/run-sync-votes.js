#!/usr/bin/env node
/**
 * One-shot local runner for vote sync (no Next.js / npm run dev needed).
 *
 * Usage:
 *   node scripts/run-sync-votes.js
 *   node scripts/run-sync-votes.js --limit=5
 *
 * Loads keys from .env.local / .env, then process.env.
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
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length) {
    console.error("Missing required secrets in .env.local:");
    for (const key of missing) console.error(`  - ${key}`);
    console.error(
      "\nAdd them to .env.local, then re-run: node scripts/run-sync-votes.js"
    );
    process.exit(1);
  }

  const { syncVotes } = require("../lib/sync-votes");
  const limit = Number(getArg("limit", 5));
  const congress = Number(getArg("congress", 119));
  console.log(`Syncing up to ${limit} House votes (congress ${congress})…`);
  const result = await syncVotes({ limit, congress, skipExisting: true });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
