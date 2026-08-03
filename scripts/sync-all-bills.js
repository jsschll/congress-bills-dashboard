#!/usr/bin/env node
/**
 * Sync recent House + Senate roll-call votes into Supabase `processed_votes`
 * with Claude Haiku plain-English fields:
 *   short_title, plain_summary, yea_impact, nay_impact
 *
 * Usage:
 *   node scripts/sync-all-bills.js
 *   node scripts/sync-all-bills.js --limit=50
 *   node scripts/sync-all-bills.js --limit=20 --chamber=senate
 *   node scripts/sync-all-bills.js --force
 *
 * Loads keys from .env.local / .env, then process.env.
 * --force re-formats rows even if they already exist in processed_votes.
 *
 * This is the bulk runner companion to lib/sync-votes.js
 * (scripts/run-sync-votes.js is the lighter one-shot variant).
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
    console.error(
      "\nAdd them to .env.local, then re-run: node scripts/sync-all-bills.js"
    );
    process.exit(1);
  }

  const { syncVotes } = require("../lib/sync-votes");
  const limit = Number(getArg("limit", 100));
  const congress = Number(getArg("congress", 119));
  const chamber = String(getArg("chamber", "both")).toLowerCase();
  const force =
    args.includes("--force") ||
    String(getArg("force", "0")).toLowerCase() === "1" ||
    String(getArg("force", "0")).toLowerCase() === "true" ||
    String(getArg("skipExisting", "1")).toLowerCase() === "0" ||
    String(getArg("skipExisting", "1")).toLowerCase() === "false";

  console.log(
    `Syncing up to ${limit} ${chamber} roll-call vote(s) (congress ${congress}${
      force ? ", force re-format" : ""
    })…`
  );
  console.log(
    "Claude fields persisted: short_title, plain_summary, yea_impact, nay_impact"
  );

  const result = await syncVotes({
    limit,
    congress,
    chamber,
    skipExisting: !force,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
