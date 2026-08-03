#!/usr/bin/env node
/**
 * Seed representative_profiles from the politicians roster (federal House/Senate).
 *
 * Usage:
 *   node scripts/seed-scorecard-profiles.js
 *   node scripts/seed-scorecard-profiles.js --state=TX
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or .env.local).
 */

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const stateArg = process.argv.find((arg) => arg.startsWith("--state="));
  const state = stateArg ? stateArg.split("=")[1] : null;

  const {
    syncProfilesFromPoliticians,
    getSupabaseAdmin,
  } = require("../lib/services/scorecardService");

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)."
    );
    process.exit(1);
  }

  const rows = await syncProfilesFromPoliticians(supabase, { state });
  console.log(
    `Seeded ${rows.length} representative_profiles${
      state ? ` for ${state}` : ""
    }.`
  );
  for (const row of rows.slice(0, 20)) {
    console.log(
      ` - ${row.chamber} ${row.state}${
        row.district ? `-${row.district}` : ""
      }: ${row.name} (${row.bioguide_id || "no bioguide"})`
    );
  }
  if (rows.length > 20) console.log(` …and ${rows.length - 20} more`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
