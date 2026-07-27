#!/usr/bin/env node
/**
 * Upsert county → appellate/judicial district mapping from CSV.
 *
 * Usage:
 *   node scripts/import-county-mapping.js data/tx-county-mapping.csv
 */

const path = require("path");
const { requireSupabase } = require("./lib/supabase");
const { readCsvFile, parseIntList, normalizeCountyName } = require("./lib/csv");

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/import-county-mapping.js <file.csv>");
    process.exit(1);
  }

  const absolute = path.resolve(filePath);
  const rows = readCsvFile(absolute);
  if (!rows.length) {
    console.error("No data rows found in", absolute);
    process.exit(1);
  }

  const payload = rows.map((row, index) => {
    const state_code = String(row.state_code || "").toUpperCase().trim();
    const county_name = normalizeCountyName(row.county_name);
    const appellate_district_numbers = parseIntList(
      row.appellate_district_numbers
    );
    const judicial_district_numbers = parseIntList(
      row.judicial_district_numbers
    );

    if (!state_code || !county_name) {
      throw new Error(
        `Row ${index + 2}: state_code and county_name are required`
      );
    }

    return {
      state_code,
      county_name,
      appellate_district_numbers,
      judicial_district_numbers,
    };
  });

  const supabase = requireSupabase();
  console.log(`Upserting ${payload.length} mapping row(s) from ${absolute}...`);

  const { data, error } = await supabase
    .from("county_district_mapping")
    .upsert(payload, { onConflict: "state_code,county_name" })
    .select(
      "state_code, county_name, appellate_district_numbers, judicial_district_numbers"
    );

  if (error) {
    console.error("Import failed:", error.message);
    process.exit(1);
  }

  console.log(`✓ upserted ${data?.length || 0} row(s)`);
  for (const row of data || []) {
    console.log(
      `  ${row.state_code} / ${row.county_name}  appellate=[${(
        row.appellate_district_numbers || []
      ).join(",")}]  judicial=[${(row.judicial_district_numbers || []).join(
        ","
      )}]`
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
