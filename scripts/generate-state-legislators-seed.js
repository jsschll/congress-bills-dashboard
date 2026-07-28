/**
 * Downloads Open States current-legislator CSVs and writes batched SQL seeds.
 *
 * Usage: node scripts/generate-state-legislators-seed.js
 *
 * Output:
 *   data/openstates-current/{st}.csv
 *   data/state-legislators.json
 *   supabase/seed-state-legislators/01-....sql … (batches of 10 states)
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const CSV_DIR = path.join(ROOT, "data", "openstates-current");
const OUT_DIR = path.join(ROOT, "supabase", "seed-state-legislators");
const OUT_JSON = path.join(ROOT, "data", "state-legislators.json");
const USER_AGENT =
  "CongressBillsDashboard/1.0 (jessica-local-seed; github.com/jsschll/congress-bills-dashboard)";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

/** States whose lower chamber is called Assembly. */
const ASSEMBLY_STATES = new Set(["CA", "NY", "NV", "WI"]);

const BATCH_SIZE = 10;

function sqlString(value) {
  if (value == null || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeParty(raw) {
  const value = String(raw || "")
    .replace(/–/g, "-")
    .trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (
    lower.includes("democratic") ||
    lower.includes("farmer-labor") ||
    lower === "dfl"
  ) {
    return "Democratic";
  }
  if (lower.startsWith("rep")) return "Republican";
  if (lower.includes("independent")) return "Independent";
  if (lower.includes("libertarian")) return "Libertarian";
  if (lower.includes("progressive")) return "Progressive";
  if (lower.includes("nonpartisan") || lower.includes("non-partisan")) {
    return "Nonpartisan";
  }
  return value;
}

function chamberTitle(stateCode, chamber) {
  const c = String(chamber || "").toLowerCase();
  if (c === "upper") return "State Senator";
  if (c === "legislature") return "State Senator"; // NE unicameral
  if (c === "lower") {
    if (ASSEMBLY_STATES.has(stateCode)) return "Assembly Member";
    return "State Representative";
  }
  return "State Legislator";
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(
      url,
      { headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(dest)));
      }
    );
    req.on("error", (err) => {
      file.close();
      try {
        fs.unlinkSync(dest);
      } catch (_) {}
      reject(err);
    });
  });
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      row.push(field);
      if (row.some((c) => c.length)) rows.push(row);
      field = "";
      row = [];
      i += ch === "\r" ? 2 : 1;
      continue;
    }
    if (ch === "\r") {
      row.push(field);
      if (row.some((c) => c.length)) rows.push(row);
      field = "";
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((c) => c.length)) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] != null ? cols[idx] : "";
    });
    return obj;
  });
}

function mapRow(stateCode, row) {
  const name = String(row.name || "").trim();
  if (!name) return null;
  const chamber = String(row.current_chamber || "").toLowerCase();
  if (!chamber) return null;
  const district = String(row.current_district || "").trim();
  if (!district) return null;

  return {
    state_code: stateCode,
    full_name: name,
    title: chamberTitle(stateCode, chamber),
    chamber,
    district_number: district,
    party: normalizeParty(row.current_party),
    photo_url: String(row.image || "").trim(),
    court_or_agency: "Legislative Branch",
    level: "Legislative",
    selection_method: "elected",
    appointed_by: null,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeBatchSql(batchIndex, stateCodes, officials) {
  const codesList = stateCodes.map((c) => sqlString(c)).join(", ");
  const values = officials
    .map(
      (o) =>
        `  (${sqlString(o.full_name)}, ${sqlString(o.title)}, ${sqlString(
          "Legislative Branch"
        )}, 'Legislative', ${sqlString(o.state_code)}, ${sqlString(
          o.district_number
        )}, NULL, ${sqlString(o.party)}, ${sqlString(o.photo_url)}, ${sqlString(
          o.selection_method
        )}, ${sqlString(o.appointed_by)})`
    )
    .join(",\n");

  const sql = `-- seed-state-legislators batch ${String(batchIndex).padStart(2, "0")}
-- States: ${stateCodes.join(", ")}
-- Paste into Supabase SQL Editor AFTER migration-selection-method-and-legislative.sql
-- Safe to re-run for these states.

delete from public.state_officials
where court_or_agency = 'Legislative Branch'
  and state_code in (${codesList});

insert into public.state_officials (
  full_name,
  title,
  court_or_agency,
  level,
  state_code,
  district_number,
  county_name,
  party,
  photo_url,
  selection_method,
  appointed_by
)
values
${values};

-- select state_code, count(*) from state_officials
-- where court_or_agency = 'Legislative Branch'
--   and state_code in (${codesList})
-- group by 1 order by 1;
`;

  const filename = `${String(batchIndex).padStart(2, "0")}-${stateCodes[0]}-to-${
    stateCodes[stateCodes.length - 1]
  }.sql`;
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, sql, "utf8");
  return outPath;
}

async function main() {
  fs.mkdirSync(CSV_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const all = [];
  const byState = {};

  for (const code of STATES) {
    const st = code.toLowerCase();
    const dest = path.join(CSV_DIR, `${st}.csv`);
    const url = `https://data.openstates.org/people/current/${st}.csv`;
    process.stdout.write(`Fetching ${code}… `);
    try {
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 100) {
        await download(url, dest);
        await sleep(150);
      }
      const text = fs.readFileSync(dest, "utf8");
      if (text.startsWith("<?xml") || text.includes("AccessDenied")) {
        throw new Error("Access denied / empty");
      }
      const rows = parseCsv(text)
        .map((r) => mapRow(code, r))
        .filter(Boolean);
      byState[code] = rows.length;
      all.push(...rows);
      console.log(`${rows.length} legislators`);
    } catch (error) {
      console.log(`FAILED (${error.message})`);
      byState[code] = 0;
    }
  }

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total: all.length,
        by_state: byState,
        sample: all.slice(0, 5),
      },
      null,
      2
    ),
    "utf8"
  );

  // Clear old batch files
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.endsWith(".sql")) fs.unlinkSync(path.join(OUT_DIR, name));
  }

  let batchIndex = 1;
  for (let i = 0; i < STATES.length; i += BATCH_SIZE) {
    const batchStates = STATES.slice(i, i + BATCH_SIZE);
    const officials = all.filter((o) => batchStates.includes(o.state_code));
    if (!officials.length) {
      console.warn("Skipping empty batch", batchStates.join(","));
      continue;
    }
    const out = writeBatchSql(batchIndex, batchStates, officials);
    console.log(
      `Wrote ${path.basename(out)} (${officials.length} rows, ${batchStates.join(",")})`
    );
    batchIndex += 1;
  }

  // Index file
  const indexSql = `-- README: run order for state legislators
-- 1) ../migration-selection-method-and-legislative.sql
-- 2) Each 01-….sql … file in this folder (in order)
--
-- Confirm:
-- select count(*) from state_officials where court_or_agency = 'Legislative Branch';
-- select state_code, count(*) from state_officials
-- where court_or_agency = 'Legislative Branch'
-- group by 1 order by 1;
`;
  fs.writeFileSync(path.join(OUT_DIR, "00-README.sql"), indexSql, "utf8");

  console.log(`\nTotal legislators: ${all.length}`);
  console.log(`JSON: ${OUT_JSON}`);
  console.log(`SQL batches: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
