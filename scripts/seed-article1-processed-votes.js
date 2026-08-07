#!/usr/bin/env node
/**
 * Upsert Article 1 theme-showcase bills into Supabase `processed_votes`.
 *
 * Usage:
 *   node scripts/seed-article1-processed-votes.js
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or ANON key with write access).
 * Seeds Finance, Judiciary, Authorization, and Regulation examples so
 * /api/bills-feed can serve them for Bento / Editorial / Pipeline routing.
 */
const { createClient } = require("@supabase/supabase-js");
const {
  seedFederalAndStateBills,
  seedProcessedVoteRows,
} = require("../lib/bills-feed-seed");

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function main() {
  const url = env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const key =
    env("SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_ANON_KEY") ||
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)."
    );
    process.exit(1);
  }

  const rows = seedProcessedVoteRows();
  const showcase = seedFederalAndStateBills();
  console.log(`Upserting ${rows.length} Article 1 theme seeds into processed_votes…`);
  for (const bill of showcase) {
    console.log(
      `  - ${bill.billNumber} [${bill.category}] → ${bill.themeRoute} (${bill.level})`
    );
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("processed_votes")
    .upsert(rows, { onConflict: "roll_call_id" })
    .select("roll_call_id, bill_number, primary_category");

  if (error) {
    console.error("Upsert failed:", error.message || error);
    process.exit(1);
  }

  console.log(`Upserted ${Array.isArray(data) ? data.length : rows.length} rows.`);
  console.log(
    "Done. /api/bills-feed will pick these up via processed_votes and/or theme seed merge."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
