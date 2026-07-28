/**
 * Split remaining legislator batch SQL into one file per state.
 * Usage: node scripts/split-legislator-batches.js
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "seed-state-legislators");
const OUT = path.join(DIR, "by-state");
const BATCHES = [
  "02-HI-to-MD.sql",
  "03-MA-to-NJ.sql",
  "04-NM-to-SC.sql",
  "05-SD-to-WY.sql",
];

fs.mkdirSync(OUT, { recursive: true });

function splitValuesBlock(text) {
  const idx = text.search(/\nvalues\n/i);
  if (idx < 0) return [];
  let body = text.slice(idx + "\nvalues\n".length).trim();
  if (body.endsWith(";")) body = body.slice(0, -1).trim();

  const rows = [];
  let depth = 0;
  let start = -1;
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) {
      if (ch === "'" && body[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") inQuote = false;
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      continue;
    }
    if (ch === "(") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        rows.push(body.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return rows;
}

for (const batch of BATCHES) {
  const text = fs.readFileSync(path.join(DIR, batch), "utf8");
  const rows = splitValuesBlock(text);
  const byState = {};
  for (const row of rows) {
    const m = row.match(
      /^\(\s*'[^']*(?:''[^']*)*'\s*,\s*'[^']*(?:''[^']*)*'\s*,\s*'Legislative Branch'\s*,\s*'Legislative'\s*,\s*'([A-Z]{2})'/
    );
    if (!m) {
      console.warn("parse fail in", batch, row.slice(0, 100));
      continue;
    }
    const st = m[1];
    (byState[st] = byState[st] || []).push(row);
  }
  for (const [st, list] of Object.entries(byState)) {
    const sql = `-- ${st} state legislators
-- Paste into Supabase SQL Editor and Run.

delete from public.state_officials
where court_or_agency = 'Legislative Branch'
  and state_code = '${st}';

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
${list.join(",\n")};
`;
    fs.writeFileSync(path.join(OUT, `${st}.sql`), sql, "utf8");
    console.log(`${st}: ${list.length}`);
  }
}

console.log("Wrote", OUT);
