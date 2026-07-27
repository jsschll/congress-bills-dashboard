#!/usr/bin/env node
/**
 * Import state_officials rows from CSV (idempotent).
 *
 * Usage:
 *   node scripts/import-state-officials.js data/tx-statewide.csv
 *   node scripts/import-state-officials.js data/tx-appellate.csv
 *   node scripts/import-state-officials.js data/tx-local.csv
 */

const path = require("path");
const { requireSupabase } = require("./lib/supabase");
const {
  readCsvFile,
  parseOptionalInt,
  normalizeCountyName,
} = require("./lib/csv");

const ALLOWED_LEVELS = new Set([
  "Statewide",
  "Appellate",
  "District",
  "County/Magistrate",
  "County",
]);

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/import-state-officials.js <file.csv>");
    process.exit(1);
  }

  const absolute = path.resolve(filePath);
  const rows = readCsvFile(absolute);
  if (!rows.length) {
    console.error("No data rows found in", absolute);
    process.exit(1);
  }

  const payload = rows.map((row, index) => {
    const full_name = String(row.full_name || "").trim();
    const title = String(row.title || "").trim() || null;
    const level = String(row.level || "").trim();
    const state_code = String(row.state_code || "").toUpperCase().trim();
    const district_number = parseOptionalInt(row.district_number);
    const county_name = normalizeCountyName(row.county_name) || null;

    if (!full_name || !state_code || !level) {
      throw new Error(
        `Row ${index + 2}: full_name, level, and state_code are required`
      );
    }
    if (!ALLOWED_LEVELS.has(level)) {
      throw new Error(
        `Row ${index + 2}: invalid level "${level}". Allowed: ${[
          ...ALLOWED_LEVELS,
        ].join(", ")}`
      );
    }
    if (
      (level === "Appellate" || level === "District") &&
      district_number == null
    ) {
      throw new Error(
        `Row ${index + 2}: ${level} rows need district_number`
      );
    }
    if (
      (level === "County/Magistrate" || level === "County") &&
      !county_name
    ) {
      throw new Error(
        `Row ${index + 2}: County/Magistrate rows need county_name`
      );
    }

    return {
      full_name,
      title,
      level,
      state_code,
      district_number,
      county_name,
    };
  });

  const supabase = requireSupabase();
  console.log(`Importing ${payload.length} official(s) from ${absolute}...`);

  let deleted = 0;
  for (const row of payload) {
    let query = supabase
      .from("state_officials")
      .delete()
      .eq("state_code", row.state_code)
      .eq("full_name", row.full_name)
      .eq("level", row.level);

    if (row.district_number != null) {
      query = query.eq("district_number", row.district_number);
    } else {
      query = query.is("district_number", null);
    }

    if (row.county_name) {
      query = query.eq("county_name", row.county_name);
    } else {
      query = query.is("county_name", null);
    }

    const { error } = await query;
    if (error) {
      console.error(`Delete failed for ${row.full_name}:`, error.message);
      process.exit(1);
    }
    deleted += 1;
  }

  const { data, error } = await supabase
    .from("state_officials")
    .insert(payload)
    .select("full_name, level, district_number, county_name, state_code");

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log(`✓ replaced ${deleted} prior match(es), inserted ${data?.length || 0}`);
  for (const row of data || []) {
    const bits = [`[${row.level}]`, row.full_name];
    if (row.district_number != null) bits.push(`d=${row.district_number}`);
    if (row.county_name) bits.push(row.county_name);
    console.log(" ", bits.join(" "));
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
