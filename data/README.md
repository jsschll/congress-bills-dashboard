# Judge data CSVs (Option A) — published via GitHub → Supabase

Users only **read** Supabase at search time. You **publish** judge data by
editing CSVs in this repo; GitHub Actions loads them into cloud Supabase.

## One-time GitHub setup

1. Open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**
2. Add two repository secrets:
   - `SUPABASE_URL` — e.g. `https://xxxx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → **service_role** (secret)
3. Never put the service role key in `config.js` or commit it

## How to publish (cloud — preferred)

1. Edit / append rows in the CSVs under `data/` (in Cursor or GitHub)
2. Commit and push to `main`
3. GitHub Action **Publish judge data to Supabase** runs automatically
4. Friends hard-refresh the live site and search their address

You can also run it manually: GitHub → **Actions** → **Publish judge data to Supabase** → **Run workflow**.

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

## Friend-testing loop

1. Add judges for a friend’s county to the CSVs
2. Push to `main` (Action publishes to Supabase)
3. Friend hard-refreshes and searches

## Local override (optional)

Only if you need to debug imports on your PC:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
node scripts/import-all-judges.js
```
