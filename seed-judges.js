/**
 * seed-judges.js
 *
 * Seeds Option A tables used by the State tab address lookup:
 *   - public.county_district_mapping
 *   - public.state_officials
 *
 * Primary demo geography: Fort Bend County, TX
 *   appellate_district_numbers: [1, 14]
 *   judicial_district_numbers:  [240, 268, 328, 387, 434, 458]
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *   node seed-judges.js
 *
 * Prefer the CSV importers for ongoing work:
 *   node scripts/import-county-mapping.js data/tx-county-mapping.csv
 *   node scripts/import-state-officials.js data/tx-local.csv
 *   node scripts/coverage-report.js TX
 *
 * This file remains a Fort Bend / Harris smoke seed.
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`
Missing credentials.

Set both:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Example (PowerShell):
  $env:SUPABASE_URL="https://xxxx.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
  node seed-judges.js
`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** County → appellate + judicial district mapping rows */
const COUNTY_MAPPINGS = [
  {
    state_code: "TX",
    county_name: "Fort Bend",
    appellate_district_numbers: [1, 14],
    judicial_district_numbers: [240, 268, 328, 387, 434, 458],
  },
  {
    state_code: "TX",
    county_name: "Harris",
    appellate_district_numbers: [1, 14],
    judicial_district_numbers: [11, 55, 61, 80, 113, 125],
  },
];

/**
 * Officials for Statewide / Appellate / District / County-Magistrate.
 * district_number is a string so it matches PostgREST text columns.
 */
const STATE_OFFICIALS = [
  // —— Statewide high courts & leadership ——
  {
    full_name: "Jimmy Blacklock",
    title: "Chief Justice, Supreme Court of Texas",
    level: "Statewide",
    state_code: "TX",
    district_number: null,
    county_name: null,
  },
  {
    full_name: "James P. Sullivan",
    title: "Justice, Supreme Court of Texas",
    level: "Statewide",
    state_code: "TX",
    district_number: null,
    county_name: null,
  },
  {
    full_name: "Sharon Keller",
    title: "Presiding Judge, Texas Court of Criminal Appeals",
    level: "Statewide",
    state_code: "TX",
    district_number: null,
    county_name: null,
  },
  {
    full_name: "Greg Abbott",
    title: "Governor of Texas",
    level: "Statewide",
    state_code: "TX",
    district_number: null,
    county_name: null,
  },

  // —— Regional Courts of Appeals (1st & 14th cover Fort Bend) ——
  {
    full_name: "Terry Adams",
    title: "Chief Justice, First Court of Appeals",
    level: "Appellate",
    state_code: "TX",
    district_number: 1,
    county_name: null,
  },
  {
    full_name: "Julie Countiss",
    title: "Justice, First Court of Appeals",
    level: "Appellate",
    state_code: "TX",
    district_number: 1,
    county_name: null,
  },
  {
    full_name: "Tracy Christopher",
    title: "Chief Justice, Fourteenth Court of Appeals",
    level: "Appellate",
    state_code: "TX",
    district_number: 14,
    county_name: null,
  },
  {
    full_name: "Kevin Jewell",
    title: "Justice, Fourteenth Court of Appeals",
    level: "Appellate",
    state_code: "TX",
    district_number: 14,
    county_name: null,
  },

  // —— Fort Bend district trial courts ——
  {
    full_name: "Steve Rogers",
    title: "Judge, 268th District Court",
    level: "District",
    state_code: "TX",
    district_number: 268,
    county_name: "Fort Bend",
  },
  {
    full_name: "Chad Bridges",
    title: "Judge, 240th District Court",
    level: "District",
    state_code: "TX",
    district_number: 240,
    county_name: "Fort Bend",
  },
  {
    full_name: "R. O'Neil Williams",
    title: "Judge, 434th District Court",
    level: "District",
    state_code: "TX",
    district_number: 434,
    county_name: "Fort Bend",
  },
  {
    full_name: "J. Christian Becerra",
    title: "Judge, 458th District Court",
    level: "District",
    state_code: "TX",
    district_number: 458,
    county_name: "Fort Bend",
  },

  // —— County / local magistrates ——
  {
    full_name: "KP George",
    title: "Fort Bend County Judge",
    level: "County/Magistrate",
    state_code: "TX",
    district_number: null,
    county_name: "Fort Bend",
  },
  {
    full_name: "Kelly Coker",
    title: "Justice of the Peace, Precinct 1 Place 1",
    level: "County/Magistrate",
    state_code: "TX",
    district_number: null,
    county_name: "Fort Bend",
  },
];

async function seedCountyMappings() {
  console.log("Seeding county_district_mapping...");
  for (const row of COUNTY_MAPPINGS) {
    const { data, error } = await supabase
      .from("county_district_mapping")
      .upsert(row, { onConflict: "state_code,county_name" })
      .select(
        "state_code, county_name, appellate_district_numbers, judicial_district_numbers"
      );

    if (error) {
      throw new Error(`county_district_mapping upsert failed: ${error.message}`);
    }
    console.log("  ✓", data?.[0] || row);
  }
}

async function seedStateOfficials() {
  console.log("Seeding state_officials...");

  // Idempotent: remove prior rows that match this seed set (same name + state + level).
  for (const row of STATE_OFFICIALS) {
    let query = supabase
      .from("state_officials")
      .delete()
      .eq("state_code", row.state_code)
      .eq("full_name", row.full_name)
      .eq("level", row.level);

    if (row.district_number) {
      query = query.eq("district_number", row.district_number);
    }
    if (row.county_name) {
      query = query.eq("county_name", row.county_name);
    }

    const { error: deleteError } = await query;
    if (deleteError) {
      throw new Error(
        `state_officials delete failed for ${row.full_name}: ${deleteError.message}`
      );
    }
  }

  const { data, error } = await supabase
    .from("state_officials")
    .insert(STATE_OFFICIALS)
    .select("full_name, level, district_number, county_name");

  if (error) {
    throw new Error(`state_officials insert failed: ${error.message}`);
  }

  console.log(`  ✓ inserted ${data?.length || 0} officials`);
  for (const row of data || []) {
    console.log(
      `    - [${row.level}] ${row.full_name}` +
        (row.district_number ? ` (district ${row.district_number})` : "") +
        (row.county_name ? ` (${row.county_name})` : "")
    );
  }
}

async function main() {
  console.log("Supabase URL:", SUPABASE_URL);
  await seedCountyMappings();
  await seedStateOfficials();
  console.log(
    "\nDone. Search a Fort Bend County, TX address and open the State tab."
  );
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message || error);
  process.exit(1);
});
