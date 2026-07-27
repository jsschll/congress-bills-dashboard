# Judge data CSVs (Option A)

Offline imports for `county_district_mapping` and `state_officials`.
Users only read Supabase at search time — never scrape live.

## Setup (once)

```powershell
cd C:\Users\knnrh\Projects\congress-bills-dashboard
npm install

$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"   # Project Settings → API → service_role
```

Never commit the service role key.

## Files

| Path | Purpose |
|------|---------|
| `templates/county-district-mapping.csv` | Column header template for mapping |
| `templates/state-officials.csv` | Column header template for officials |
| `tx-county-mapping.csv` | Texas county → district numbers |
| `tx-statewide.csv` | Statewide courts / leadership |
| `tx-appellate.csv` | Courts of Appeals |
| `tx-local.csv` | District + County/Magistrate |

## Column formats

### county-district-mapping.csv

```text
state_code,county_name,appellate_district_numbers,judicial_district_numbers
TX,Fort Bend,"1|14","240|268|328|387|434|458"
```

- `state_code`: 2-letter (e.g. `TX`)
- `county_name`: without trailing `County` (e.g. `Fort Bend`)
- District lists: pipe `|` or semicolon `;` separated integers (CSV-safe)

### state-officials.csv

```text
full_name,title,level,state_code,district_number,county_name
Jimmy Blacklock,Chief Justice Supreme Court of Texas,Statewide,TX,,
Steve Rogers,Judge 268th District Court,District,TX,268,Fort Bend
```

- `level` must be one of: `Statewide`, `Appellate`, `District`, `County/Magistrate`
- `district_number`: integer for Appellate/District; leave blank for Statewide / many County rows
- `county_name`: required for `County/Magistrate`; optional for District

## Commands

```powershell
# Upsert county → district mapping
node scripts/import-county-mapping.js data/tx-county-mapping.csv

# Import officials (idempotent per name+level+district+county)
node scripts/import-state-officials.js data/tx-statewide.csv
node scripts/import-state-officials.js data/tx-appellate.csv
node scripts/import-state-officials.js data/tx-local.csv

# Which TX counties still lack District or County/Magistrate rows?
node scripts/coverage-report.js TX
```

## Friend-testing loop

1. Edit / append CSV rows
2. Run the matching import script
3. Friends hard-refresh the live site and search their address
