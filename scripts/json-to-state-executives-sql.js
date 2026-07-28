/**
 * Rebuild supabase/seed-state-executives.sql from data/state-executives.json
 * (no network). Use after enriching photos offline.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JSON_PATH = path.join(ROOT, "data", "state-executives.json");
const OUT_SQL = path.join(ROOT, "supabase", "seed-state-executives.sql");

function sqlString(value) {
  if (value == null || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const officials = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const values = officials
  .map(
    (o) =>
      `  (${sqlString(o.full_name)}, ${sqlString(o.title)}, ${sqlString(
        "Executive Branch"
      )}, 'Statewide', ${sqlString(o.state_code)}, NULL, NULL, ${sqlString(
        o.party
      )}, ${sqlString(o.photo_url)})`
  )
  .join(",\n");

const sql = `-- seed-state-executives.sql
-- Paste into Supabase SQL Editor and Run.
-- Seeds Governor, Lieutenant Governor, Attorney General, Secretary of State,
-- and Treasurer (or treasury equivalent) for all 50 states under
-- court_or_agency = 'Executive Branch'.
--
-- Includes title, name, party, photo_url.
-- Safe to re-run.

alter table public.state_officials
  add column if not exists party text;

alter table public.state_officials
  add column if not exists photo_url text;

delete from public.state_officials
where court_or_agency = 'Executive Branch'
   or (
     level = 'Statewide'
     and lower(coalesce(title, '')) in (
       'governor',
       'lieutenant governor',
       'attorney general',
       'secretary of state',
       'treasurer',
       'chief financial officer',
       'comptroller of public accounts',
       'comptroller'
     )
     and (
       court_or_agency is null
       or court_or_agency ilike 'Office of the %'
       or court_or_agency = 'Executive Branch'
     )
   );

insert into public.state_officials (
  full_name,
  title,
  court_or_agency,
  level,
  state_code,
  district_number,
  county_name,
  party,
  photo_url
)
values
${values};

-- Confirm:
-- select count(*) from state_officials where court_or_agency = 'Executive Branch';
-- select state_code, title, full_name, party, (photo_url is not null) as has_photo
-- from state_officials
-- where court_or_agency = 'Executive Branch'
-- order by state_code, title;
`;

fs.writeFileSync(OUT_SQL, sql, "utf8");
console.log(
  `Wrote ${OUT_SQL} (${officials.length} rows, ${
    officials.filter((o) => o.photo_url).length
  } with photos)`
);
