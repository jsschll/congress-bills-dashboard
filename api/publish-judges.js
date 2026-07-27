/**
 * POST /api/publish-judges
 * Header: Authorization: Bearer <JUDGES_IMPORT_SECRET>
 *
 * Loads data/*.csv from the deployed repo into Supabase (service role).
 * Set Vercel env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   JUDGES_IMPORT_SECRET
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const {
  parseCsv,
  parseIntList,
  parseOptionalInt,
  normalizeCountyName,
} = require("../scripts/lib/csv");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

function getBearer(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readDataCsv(fileName) {
  const filePath = path.join(process.cwd(), "data", fileName);
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return parseCsv(text);
}

function listImportFiles() {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) return { mapping: [], officials: [] };
  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".csv")).sort();
  return {
    mapping: files.filter((n) => n.endsWith("-county-mapping.csv")),
    officials: [
      ...files.filter((n) => n.endsWith("-statewide.csv")),
      ...files.filter((n) => n.endsWith("-appellate.csv")),
      ...files.filter((n) => n.endsWith("-local.csv")),
    ],
  };
}

async function upsertMappings(supabase, fileName) {
  const rows = readDataCsv(fileName);
  if (!rows?.length) return { file: fileName, upserted: 0 };

  const payload = rows.map((row) => ({
    state_code: String(row.state_code || "").toUpperCase().trim(),
    county_name: normalizeCountyName(row.county_name),
    appellate_district_numbers: parseIntList(row.appellate_district_numbers),
    judicial_district_numbers: parseIntList(row.judicial_district_numbers),
  }));

  const { data, error } = await supabase
    .from("county_district_mapping")
    .upsert(payload, { onConflict: "state_code,county_name" })
    .select("county_name");

  if (error) throw new Error(`${fileName}: ${error.message}`);
  return { file: fileName, upserted: data?.length || 0 };
}

async function importOfficials(supabase, fileName) {
  const rows = readDataCsv(fileName);
  if (!rows?.length) return { file: fileName, inserted: 0 };

  const allowed = new Set([
    "Statewide",
    "Appellate",
    "District",
    "County/Magistrate",
    "County",
  ]);

  const payload = rows.map((row) => {
    const level = String(row.level || "").trim();
    if (!allowed.has(level)) {
      throw new Error(`${fileName}: invalid level ${level}`);
    }
    return {
      full_name: String(row.full_name || "").trim(),
      title: String(row.title || "").trim() || null,
      level,
      state_code: String(row.state_code || "").toUpperCase().trim(),
      district_number: parseOptionalInt(row.district_number),
      county_name: normalizeCountyName(row.county_name) || null,
    };
  });

  for (const row of payload) {
    let query = supabase
      .from("state_officials")
      .delete()
      .eq("state_code", row.state_code)
      .eq("full_name", row.full_name)
      .eq("level", row.level);

    if (row.district_number != null) query = query.eq("district_number", row.district_number);
    else query = query.is("district_number", null);

    if (row.county_name) query = query.eq("county_name", row.county_name);
    else query = query.is("county_name", null);

    const { error } = await query;
    if (error) throw new Error(`${fileName} delete ${row.full_name}: ${error.message}`);
  }

  const { data, error } = await supabase
    .from("state_officials")
    .insert(payload)
    .select("full_name");

  if (error) throw new Error(`${fileName}: ${error.message}`);
  return { file: fileName, inserted: data?.length || 0 };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method !== "POST") {
    return json(res, 405, { error: "POST only" });
  }

  const expected = process.env.JUDGES_IMPORT_SECRET || "";
  if (!expected || getBearer(req) !== expected) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return json(res, 500, {
      error: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel",
    });
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const files = listImportFiles();
    const results = { mapping: [], officials: [] };

    for (const file of files.mapping) {
      results.mapping.push(await upsertMappings(supabase, file));
    }
    for (const file of files.officials) {
      results.officials.push(await importOfficials(supabase, file));
    }

    return json(res, 200, {
      ok: true,
      message: "Published judge CSVs to Supabase",
      results,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || String(error) });
  }
};
