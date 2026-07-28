# Judge / official data — published to cloud Supabase

## All 50 states — Executive Branch (start here)

File: [`../supabase/seed-state-executives.sql`](../supabase/seed-state-executives.sql)

Seeds **Governor, Lieutenant Governor, Attorney General, Secretary of State, and Treasurer** (or treasury equivalent) for every state, with **name, title, party, photo**.

1. Open Supabase → **SQL Editor** → New query  
2. Open that `.sql` file → **Select All → Copy**  
3. Paste into Supabase → **Run**  
4. Confirm:

```sql
select count(*) from state_officials where court_or_agency = 'Executive Branch';
-- expect ~240+

select state_code, title, full_name, party
from state_officials
where court_or_agency = 'Executive Branch' and state_code = 'TX'
order by title;
```

UI: State tab → **Executive Branch**.

Notes:
- A few states have no Lt. Governor (AZ, ME, NH, OR, WY) or no Treasurer (AK, HI).
- Some offices are appointed; still included when they exist.
- Photos come from Wikipedia when a free portrait is available.

Regenerate from source (optional):
```powershell
node scripts/generate-state-executives-seed.js
node scripts/json-to-state-executives-sql.js
```

---

## Full Texas load (mapping + high courts)

File: [`../supabase/seed-tx-all-mapping-and-high-courts.sql`](../supabase/seed-tx-all-mapping-and-high-courts.sql)

1. Open Supabase → **SQL Editor** → New query  
2. Open that `.sql` file in Cursor, **Select All → Copy**  
3. Paste into Supabase SQL Editor → **Run**  
4. Confirm:

```sql
select count(*) from county_district_mapping where state_code = 'TX';
-- expect 254

select level, count(*) from state_officials where state_code = 'TX' group by level order by 1;
```

What it loads:
- **All 254 TX counties** → appellate + judicial district numbers  
- **Statewide** (Supreme Court, Court of Criminal Appeals)  
- **Appellate** chief justices for Courts of Appeals 1–14 (+ some 14th Court justices)

What it does **not** wipe: your existing **District** / **County/Magistrate** rows (e.g. Fort Bend). Prefer running the **Executive Branch** seed separately (above) for governors/AGs.

---

The live site already reads from **cloud Supabase**. Publishing means loading
CSVs from this repo into that database (not keeping anything only on your laptop).

## Preferred: publish via Vercel API

### One-time setup (Vercel)
1. Vercel project → **Settings** → **Environment Variables**
2. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role secret — not the anon key)
   - `JUDGES_IMPORT_SECRET` (any long random string you invent)
3. Redeploy so env vars apply

### Publish after you change CSVs
1. Edit files under `data/` (e.g. add another county’s judges)
2. Commit + push to `main` (site/repo update)
3. Call the publish endpoint (PowerShell):

```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://congress-bills-dashboard.vercel.app/api/publish-judges" `
  -Headers @{ Authorization = "Bearer YOUR_JUDGES_IMPORT_SECRET" }
```

Friends hard-refresh and search — they hit the same cloud DB.

## Files to edit

| Path | Purpose |
|------|---------|
| `state-executives.json` | Generated 50-state executive roster |
| `tx-county-mapping.csv` | County → appellate/judicial districts |
| `tx-statewide.csv` | Statewide courts / leadership |
| `tx-appellate.csv` | Courts of Appeals |
| `tx-local.csv` | District + County/Magistrate |

### Mapping columns
```text
state_code,county_name,appellate_district_numbers,judicial_district_numbers
TX,Fort Bend,"1|14","240|268|328|387|434|458"
```

### Officials columns
```text
full_name,title,level,state_code,district_number,county_name
Steve Rogers,Judge 268th District Court,District,TX,268,Fort Bend
```

`level`: `Statewide` | `Appellate` | `District` | `County/Magistrate`

## Friend-testing loop
1. Add their county to the CSVs  
2. Push to `main`  
3. POST `/api/publish-judges` with your secret  
4. They refresh and search  

## Optional local debug
```powershell
$env:SUPABASE_URL="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
node scripts/import-all-judges.js
```
